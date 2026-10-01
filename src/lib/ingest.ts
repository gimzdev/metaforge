import { configuredSetNumber, getSetInfo, RANKED_QUEUE } from '@/config/game';
import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { getLadder, getMatch, getMatchIds, RiotError, type LadderTier, type LeagueItemDto, type MatchDto } from '@/lib/riot/api';
import { parseRegionList, platformFromMatchId } from '@/lib/riot/regions';
import { refreshStoredBoards } from '@/lib/stats/dataset';
import { getStore, type BoardRecord, type MatchRecord, type PlayerRecord } from '@/lib/store';

/* ── Riot match → storage records ───────────────────────── */

export const queueOf = (match: MatchDto) => Number(match.info.queue_id ?? match.info.queueId ?? 0);

/** Convert a Riot match into storage records. Boards are kept for ranked games of the tracked set only. */
export function matchToRecords(match: MatchDto, setNumber: number) {
  const info = match.info;
  const platform = platformFromMatchId(match.metadata.match_id);
  const queueId = queueOf(match);
  const participants = Array.isArray(info.participants) ? info.participants : [];
  const standard = !info.tft_game_type || info.tft_game_type === 'standard';
  const eligible = info.tft_set_number === setNumber && queueId === RANKED_QUEUE && standard && participants.length >= 8;

  const record: MatchRecord = {
    matchId: match.metadata.match_id,
    platform,
    setNumber: Number(info.tft_set_number) || 0,
    queueId,
    datetime: Number(info.game_datetime) || Date.now(),
    gameVersion: String(info.game_version ?? ''),
    boardsStored: eligible,
  };

  const boards: BoardRecord[] = eligible
    ? participants.map((p) => ({
        matchId: record.matchId,
        puuid: p.puuid,
        platform,
        datetime: record.datetime,
        placement: Math.min(8, Math.max(1, Number(p.placement) || 8)),
        level: Number(p.level) || 0,
        goldLeft: Number(p.gold_left) || 0,
        lastRound: Number(p.last_round) || 0,
        damage: Number(p.total_damage_to_players) || 0,
        units: (p.units ?? [])
          .filter((u) => typeof u?.character_id === 'string' && u.character_id)
          .map((u) => [
            u.character_id,
            Math.min(4, Math.max(1, Number(u.tier) || 1)),
            (u.itemNames ?? []).filter((i): i is string => typeof i === 'string' && i.length > 0),
          ]),
        traits: (p.traits ?? [])
          .filter((t) => typeof t?.name === 'string' && Number(t.tier_current) > 0)
          .map((t) => [t.name, Number(t.num_units) || 0, Number(t.style) || 0, Number(t.tier_current) || 0]),
        augments: Array.isArray(p.augments) ? p.augments.filter((a): a is string => typeof a === 'string') : [],
      }))
    : [];

  const players: PlayerRecord[] = participants
    .filter((p) => p.puuid)
    .map((p) => ({ puuid: p.puuid, gameName: p.riotIdGameName || null, tagLine: p.riotIdTagline || null, platform }));

  return { record, boards, players };
}

/* ── Collection runs ────────────────────────────────────── */

interface RegionReport {
  platform: string;
  players: number;
  candidates: number;
  fetched: number;
  stored: number;
  skipped: number;
  errors: number;
  note?: string;
}

interface IngestReport {
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  setNumber: number;
  store: string;
  regions: RegionReport[];
  error?: string;
}

const lock = () => singleton('ingest-lock', () => ({ running: false }));
export const ingestRunning = () => lock().running;

const fatal = (error: unknown) => error instanceof RiotError && (error.code === 'key' || error.code === 'config');

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function ladderFor(platform: string, needed: number, deadline: number): Promise<Array<LeagueItemDto & { tier: string }>> {
  const out: Array<LeagueItemDto & { tier: string }> = [];
  for (const tier of ['challenger', 'grandmaster', 'master'] as LadderTier[]) {
    const list = await getLadder(platform, tier, { deadline });
    out.push(
      ...(list.entries ?? [])
        .filter((e) => typeof e.puuid === 'string' && e.puuid)
        .sort((a, b) => b.leaguePoints - a.leaguePoints)
        .map((e) => ({ ...e, tier: list.tier || tier.toUpperCase() })),
    );
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
  if (!ladder.length) return { ...report, note: 'No ranked ladder yet' };
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
      if (fatal(error)) throw error;
      if (error instanceof RiotError && error.code === 'budget') break;
      report.errors++;
    }
  }
  report.candidates = ids.size;
  const known = await store.knownMatchIds([...ids]);
  const matchNumber = (id: string) => Number(id.split('_')[1] ?? 0) || 0;
  const fresh = [...ids].filter((id) => !known.has(id)).sort((a, b) => matchNumber(b) - matchNumber(a)).slice(0, maxMatches);

  await mapLimit(fresh, 4, async (id) => {
    if (Date.now() > deadline) return;
    try {
      const { record, boards, players: seen } = matchToRecords(await getMatch(id, { deadline }), setNumber);
      await store.saveMatch(record, boards);
      await store.upsertPlayers(seen);
      report.fetched++;
      if (boards.length) report.stored++;
      else report.skipped++;
    } catch (error) {
      if (fatal(error)) throw error;
      if (!(error instanceof RiotError && error.code === 'budget')) report.errors++;
    }
  });
  log(`${platform}: ${report.stored} ranked matches stored, ${report.skipped} skipped, ${report.errors} errors`);
  return report;
}

export async function runIngest(options: { regions?: string[]; log?: (message: string) => void } = {}): Promise<IngestReport> {
  const log = options.log ?? ((m: string) => console.log(`[metaforge] ${m}`));
  const setNumber = configuredSetNumber();
  const store = getStore();
  const startedAt = Date.now();
  const base: IngestReport = { ok: false, startedAt, finishedAt: startedAt, setNumber, store: store.describe(), regions: [] };
  if (!env.riotApiKey) return { ...base, error: 'RIOT_API_KEY is not configured' };
  const l = lock();
  if (l.running) return { ...base, error: 'A collection run is already in progress' };
  l.running = true;

  try {
    await store.init();
    const regions = options.regions?.length ? options.regions : parseRegionList(env.ingestRegions);
    const setStart = Date.parse(`${getSetInfo(setNumber).start}T00:00:00Z`);
    const since = Math.max(Number.isFinite(setStart) ? setStart : 0, Date.now() - 21 * 86_400_000);
    const deadline = startedAt + env.ingestBudgetSeconds * 1000;
    log(`collecting Set ${setNumber} ranked matches from ${regions.join(', ')} into ${store.describe()}`);

    const results = await Promise.allSettled(
      regions.map((r) => ingestRegion(r, setNumber, since, deadline, env.ingestPlayersPerRegion, env.ingestMatchesPerRegion, log)),
    );
    const keyError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected' && fatal(r.reason));
    const report: IngestReport = {
      ...base,
      ok: !keyError,
      finishedAt: Date.now(),
      regions: results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { platform: regions[i], players: 0, candidates: 0, fetched: 0, stored: 0, skipped: 0, errors: 1, note: r.reason instanceof Error ? r.reason.message : String(r.reason) },
      ),
      error: keyError ? (keyError.reason as Error).message : undefined,
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
    // Player totals and set lists nobody has looked at for a month.
    for (const prefix of ['pt:', 'pl:']) await store.pruneKv(prefix, Date.now() - 30 * 86_400_000).catch(() => 0);
    if (pruned || report.regions.some((r) => r.stored > 0)) {
      // Update the board snapshot now, so servers pick up the new games without re-reading everything.
      await refreshStoredBoards().catch((error) => log(`updating the board snapshot failed: ${error instanceof Error ? error.message : error}`));
    }
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

/* ── Background schedule (long-running servers; Vercel uses its cron) ── */

const schedule = () => singleton('ingest-scheduler', () => ({ started: false, nextRunAt: 0 }));

export function startIngestScheduler() {
  const state = schedule();
  const minutes = env.ingestIntervalMinutes;
  if (state.started || !env.riotApiKey || minutes <= 0 || env.onVercel) return;
  state.started = true;
  const tick = async () => {
    try {
      const report = await runIngest();
      if (report.error) console.warn(`[metaforge] collection: ${report.error}`);
    } catch (error) {
      console.warn('[metaforge] collection failed:', (error as Error).message);
    } finally {
      state.nextRunAt = Date.now() + minutes * 60_000;
      setTimeout(tick, minutes * 60_000).unref?.();
    }
  };
  state.nextRunAt = Date.now() + 5_000;
  setTimeout(tick, 5_000).unref?.();
  console.log(`[metaforge] match collection every ${minutes} min (regions: ${env.ingestRegions})`);
}

export function schedulerInfo() {
  const state = schedule();
  return { active: state.started, nextRunAt: state.nextRunAt || null };
}
