import { configuredSetNumber, getSetInfo } from '@/config/game';
import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { getLadder, getMatch, getMatchIds, type LadderTier } from '@/lib/riot/api';
import { RiotError } from '@/lib/riot/client';
import { parseRegionList } from '@/lib/riot/regions';
import type { LeagueItemDto } from '@/lib/riot/types';
import { getStore } from '@/lib/store';
import { invalidateDataset } from '@/lib/stats/dataset';
import { matchToRecords } from './normalize';

export interface RegionReport {
  platform: string;
  players: number;
  candidates: number;
  fetched: number;
  stored: number;
  skipped: number;
  errors: number;
  note?: string;
}

export interface IngestReport {
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  setNumber: number;
  store: string;
  regions: RegionReport[];
  error?: string;
}

export interface IngestOptions {
  regions?: string[];
  budgetSeconds?: number;
  playersPerRegion?: number;
  matchesPerRegion?: number;
  log?: (message: string) => void;
}

const lock = () => singleton('ingest-lock', () => ({ running: false as boolean, startedAt: 0 }));

export function ingestRunning() {
  return lock().running;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function matchNumber(id: string) {
  return Number(id.split('_')[1] ?? 0) || 0;
}

async function ladderFor(platform: string, needed: number, deadline: number): Promise<Array<LeagueItemDto & { tier: string }>> {
  const tiers: LadderTier[] = ['challenger', 'grandmaster', 'master'];
  const out: Array<LeagueItemDto & { tier: string }> = [];
  for (const tier of tiers) {
    const list = await getLadder(platform, tier, { deadline });
    const entries = (list.entries ?? [])
      .filter((e) => typeof e.puuid === 'string' && e.puuid)
      .sort((a, b) => b.leaguePoints - a.leaguePoints)
      .map((e) => ({ ...e, tier: list.tier || tier.toUpperCase() }));
    out.push(...entries);
    if (out.length >= Math.max(needed * 3, 60)) break;
  }
  return out;
}

async function ingestRegion(
  platform: string,
  setNumber: number,
  since: number,
  deadline: number,
  players: number,
  maxMatches: number,
  log: (m: string) => void,
): Promise<RegionReport> {
  const store = getStore();
  const report: RegionReport = { platform, players: 0, candidates: 0, fetched: 0, stored: 0, skipped: 0, errors: 0 };

  const ladder = await ladderFor(platform, players, deadline);
  if (!ladder.length) {
    report.note = 'No ranked ladder yet';
    return report;
  }
  await store.upsertPlayers(ladder.map((e) => ({ puuid: e.puuid, platform, tier: e.tier, lp: e.leaguePoints })));

  // Rotate through the ladder across runs so the sample is not only the top 10.
  const cursorKey = `ingest_cursor_${platform}`;
  const cursor = ((await store.getKv<number>(cursorKey)) ?? 0) % ladder.length;
  const picked = Array.from({ length: Math.min(players, ladder.length) }, (_, i) => ladder[(cursor + i) % ladder.length]);
  await store.setKv(cursorKey, (cursor + picked.length) % ladder.length);
  report.players = picked.length;

  const ids = new Set<string>();
  for (const entry of picked) {
    if (Date.now() > deadline) break;
    try {
      for (const id of await getMatchIds(platform, entry.puuid, { count: 20, startTime: since }, { deadline })) ids.add(id);
    } catch (error) {
      if (error instanceof RiotError && (error.code === 'key' || error.code === 'config')) throw error;
      if (error instanceof RiotError && error.code === 'budget') break;
      report.errors++;
    }
  }
  report.candidates = ids.size;
  const known = await store.knownMatchIds([...ids]);
  const fresh = [...ids].filter((id) => !known.has(id)).sort((a, b) => matchNumber(b) - matchNumber(a)).slice(0, maxMatches);

  await mapLimit(fresh, 4, async (id) => {
    if (Date.now() > deadline) return;
    try {
      const match = await getMatch(id, { deadline });
      const { record, boards, players: seen } = matchToRecords(match, setNumber);
      await store.saveMatch(record, boards);
      await store.upsertPlayers(seen);
      report.fetched++;
      if (boards.length) report.stored++;
      else report.skipped++;
    } catch (error) {
      if (error instanceof RiotError && (error.code === 'key' || error.code === 'config')) throw error;
      if (error instanceof RiotError && error.code === 'budget') return;
      report.errors++;
    }
  });
  log(`${platform}: ${report.stored} ranked matches stored, ${report.skipped} skipped, ${report.errors} errors`);
  return report;
}

export async function runIngest(options: IngestOptions = {}): Promise<IngestReport> {
  const log = options.log ?? ((m: string) => console.log(`[metaforge] ${m}`));
  const setNumber = configuredSetNumber();
  const store = getStore();
  const startedAt = Date.now();
  const base: IngestReport = {
    ok: false,
    startedAt,
    finishedAt: startedAt,
    setNumber,
    store: store.describe(),
    regions: [],
  };
  if (!env.riotApiKey) return { ...base, error: 'RIOT_API_KEY is not configured' };
  const l = lock();
  if (l.running) return { ...base, error: 'A collection run is already in progress' };
  l.running = true;
  l.startedAt = startedAt;

  try {
    await store.init();
    const regions = options.regions?.length ? options.regions : parseRegionList(env.ingestRegions);
    const setStart = Date.parse(`${getSetInfo(setNumber).start}T00:00:00Z`);
    const since = Math.max(Number.isFinite(setStart) ? setStart : 0, Date.now() - 21 * 86_400_000);
    const deadline = startedAt + (options.budgetSeconds ?? env.ingestBudgetSeconds) * 1000;
    const players = options.playersPerRegion ?? env.ingestPlayersPerRegion;
    const matches = options.matchesPerRegion ?? env.ingestMatchesPerRegion;
    log(`collecting Set ${setNumber} ranked matches from ${regions.join(', ')} into ${store.describe()}`);

    const results = await Promise.allSettled(
      regions.map((r) => ingestRegion(r, setNumber, since, deadline, players, matches, log)),
    );
    const keyError = results.find(
      (r) => r.status === 'rejected' && r.reason instanceof RiotError && ['key', 'config'].includes(r.reason.code),
    );
    const reports = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            platform: regions[i],
            players: 0,
            candidates: 0,
            fetched: 0,
            stored: 0,
            skipped: 0,
            errors: 1,
            note: r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
    );
    const report: IngestReport = {
      ...base,
      ok: !keyError,
      finishedAt: Date.now(),
      regions: reports,
      error: keyError && keyError.status === 'rejected' ? (keyError.reason as Error).message : undefined,
    };
    await store.setKv('ingest_last_report', report).catch(() => undefined);
    let pruned = 0;
    if (env.retainDays > 0) {
      pruned = await store.prune(Date.now() - env.retainDays * 86_400_000).catch((error) => {
        log(`pruning old matches failed: ${error instanceof Error ? error.message : error}`);
        return 0;
      });
      if (pruned) log(`removed ${pruned} matches older than ${env.retainDays} days`);
    }
    if (pruned || reports.some((r) => r.stored > 0)) invalidateDataset();
    return report;
  } catch (error) {
    const report = { ...base, finishedAt: Date.now(), error: error instanceof Error ? error.message : String(error) };
    await store.setKv('ingest_last_report', report).catch(() => undefined);
    return report;
  } finally {
    l.running = false;
  }
}

export async function lastIngestReport(): Promise<IngestReport | null> {
  try {
    return await getStore().getKv<IngestReport>('ingest_last_report');
  } catch {
    return null;
  }
}
