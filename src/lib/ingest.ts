import { configuredSetNumber, getSetInfo, RANKED_QUEUE } from '@/config/game';
import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { fetchAccountByPuuid, getDivisionPage, getLadder, getMatch, getMatchIds, riotHeadroom, RiotError } from '@/lib/riot/api';
import type { LadderTier, LeagueItemDto, MatchDto } from '@/lib/riot/api';
import { getPlatform, parseRegionList, platformFromMatchId } from '@/lib/riot/regions';
import { refreshStoredBoards } from '@/lib/stats/dataset';
import { getStore, type BoardRecord, type MatchRecord, type PlayerRecord } from '@/lib/store';
import { sleep } from '@/lib/utils';

export const queueOf = (match: MatchDto) => Number(match.info.queue_id ?? match.info.queueId ?? 0);

/** Boards are kept for ranked games of the tracked set only. */
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
const BUSY = 'A collection run is already in progress';

const fatal = (error: unknown) => error instanceof RiotError && (error.code === 'key' || error.code === 'config');

/** The report is public: Riot's messages as-is, anything else (DB errors can name hosts/users) generic, details logged. */
function reportError(error: unknown) {
  if (error instanceof RiotError) return error.message;
  console.error('[metaforge] collection error:', error);
  return 'Internal error (details in the server log)';
}

/** Run fn over items, `limit` at a time. After a failure no new items are started. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      try {
        while (i < items.length && !failed) await fn(items[i++]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }),
  );
}

const APEX_TIERS: LadderTier[] = ['challenger', 'grandmaster', 'master'];
type LadderEntry = LeagueItemDto & { tier: string };

async function ladderEntries(platform: string, tier: LadderTier, deadline: number): Promise<LadderEntry[]> {
  const list = await getLadder(platform, tier, { deadline });
  return (list.entries ?? []).filter((e) => typeof e.puuid === 'string' && e.puuid).map((e) => ({ ...e, tier: list.tier || tier.toUpperCase() }));
}

async function ladderFor(platform: string, needed: number, deadline: number) {
  const out: LadderEntry[] = [];
  for (const tier of APEX_TIERS) {
    out.push(...(await ladderEntries(platform, tier, deadline)).sort((a, b) => b.leaguePoints - a.leaguePoints));
    if (out.length >= Math.max(needed * 3, 60)) break;
  }
  return out;
}

async function ingestRegion(platform: string, setNumber: number, since: number, deadline: number, log: (m: string) => void): Promise<RegionReport> {
  const store = getStore();
  const players = env.ingestPlayersPerRegion;
  const report: RegionReport = { platform, players: 0, candidates: 0, fetched: 0, stored: 0, skipped: 0, errors: 0 };

  const ladder = await ladderFor(platform, players, deadline);
  if (!ladder.length) return { ...report, note: 'No ranked ladder yet' };
  await store.upsertPlayers(ladder.map((e) => ({ puuid: e.puuid, platform, tier: e.tier, lp: e.leaguePoints })));
  await store.recordLp(ladder.map((e) => ({ puuid: e.puuid, platform, tier: e.tier, division: 'I', lp: e.leaguePoints })), false).catch(() => undefined);

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
  const fresh = [...ids].filter((id) => !known.has(id)).sort((a, b) => matchNumber(b) - matchNumber(a)).slice(0, env.ingestMatchesPerRegion);

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

const DIVISIONS: Array<[string, string]> = ['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'].flatMap((t) =>
  ['I', 'II', 'III', 'IV'].map((d) => [t, d] as [string, string]),
);

/** Background crawling only runs while this share of a host's rate limit is free; the rest is for visitors. */
const CRAWL_HEADROOM = 0.5;

/** False once the deadline is (nearly) reached. */
async function room(host: string, deadline: number) {
  while (riotHeadroom(host) < CRAWL_HEADROOM) {
    if (Date.now() + 1_000 > deadline) return false;
    await sleep(500);
  }
  return Date.now() < deadline;
}

const APEX_EVERY_MS = 6 * 3_600_000;

/** Master+ for the directory: one call per tier, every APEX_EVERY_MS (divisions below start at Diamond). Resolves with the count. */
async function listApex(platform: string, deadline: number) {
  const store = getStore();
  const key = `crawl_apex_${platform}`;
  if (Date.now() - (Number(await store.getKv<number>(key)) || 0) < APEX_EVERY_MS) return 0;
  let listed = 0;
  for (const tier of APEX_TIERS) {
    if (!(await room(platform, deadline))) return listed; // not done: tried again next run
    try {
      const entries = await ladderEntries(platform, tier, deadline);
      const found = entries.map((e) => ({ puuid: e.puuid, platform, tier: e.tier, lp: e.leaguePoints ?? null }));
      if (found.length) await store.upsertPlayers(found);
      // Extends the LP curves of players someone has viewed.
      await store.recordLp(entries.map((e) => ({ puuid: e.puuid, platform, tier: e.tier, division: 'I', lp: e.leaguePoints ?? 0 })), false).catch(() => undefined);
      listed += found.length;
    } catch (error) {
      if (fatal(error)) throw error;
      return listed;
    }
  }
  await store.setKv(key, Date.now()).catch(() => undefined);
  return listed;
}

/** Directory listing: apex, then divisions page by page, each region resuming where it stopped. Resolves with the count. */
async function listDivisions(regions: string[], deadline: number) {
  const store = getStore();
  let listed = 0;
  if (env.crawlPages <= 0) return listed;
  await mapLimit(regions, 5, async (platform) => {
    listed += await listApex(platform, deadline);
    const key = `crawl_${platform}`;
    const saved = await store.getKv<{ d: number; page: number }>(key);
    let cur = saved && Number.isInteger(saved.d) && Number.isInteger(saved.page) && saved.d >= 0 && saved.page >= 1 ? saved : { d: 0, page: 1 };
    for (let i = 0; i < env.crawlPages && (await room(platform, deadline)); i++) {
      const [tier, division] = DIVISIONS[cur.d % DIVISIONS.length];
      try {
        const rows = await getDivisionPage(platform, tier, division, cur.page, { deadline });
        const found = rows.filter((r) => r.puuid).map((r) => ({ puuid: r.puuid!, platform, tier: r.tier ?? tier, lp: r.leaguePoints ?? null }));
        if (found.length) await store.upsertPlayers(found);
        const seen = rows.filter((r) => r.puuid).map((r) => ({ puuid: r.puuid!, platform, tier: r.tier ?? tier, division: r.rank ?? division, lp: r.leaguePoints ?? 0 }));
        await store.recordLp(seen, false).catch(() => undefined);
        listed += found.length;
        // A short (or empty) page ends the division.
        cur = rows.length >= 100 ? { d: cur.d, page: cur.page + 1 } : { d: (cur.d + 1) % DIVISIONS.length, page: 1 };
      } catch (error) {
        if (fatal(error)) throw error;
        break;
      }
    }
    await store.setKv(key, cur).catch(() => undefined);
  });
  return listed;
}

/** Name unnamed players, with a worker pool per account routing host. */
async function fillNames(deadline: number) {
  const store = getStore();
  const todo = env.crawlNames > 0 ? await store.unnamedPlayers(env.crawlNames) : [];
  const byHost = new Map<string, PlayerRecord[]>();
  for (const p of todo) {
    const host = getPlatform(p.platform)?.account;
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(p);
  }
  let named = 0;
  let unknown = 0;
  let batch: PlayerRecord[] = [];
  const flush = async () => {
    const rows = batch;
    batch = [];
    if (rows.length) await store.upsertPlayers(rows).catch(() => undefined);
  };
  await Promise.all(
    [...byHost].map(([host, players]) =>
      mapLimit(players, 16, async (p) => {
        if (!(await room(host, deadline))) return;
        try {
          const a = await fetchAccountByPuuid(p.puuid, host, { deadline });
          if (a.gameName && a.tagLine) {
            batch.push({ puuid: p.puuid, gameName: a.gameName, tagLine: a.tagLine, platform: p.platform });
            named++;
          }
        } catch (error) {
          if (fatal(error)) throw error;
          // Unknown (404) or unreadable (400, e.g. another API key's id): an empty name stops asking on every run.
          if (error instanceof RiotError && (error.status === 404 || error.status === 400)) {
            batch.push({ puuid: p.puuid, gameName: '', tagLine: '', platform: p.platform });
            unknown++;
          }
        }
        if (batch.length >= 250) await flush();
      }),
    ),
  ).finally(flush);
  return { named, unknown, waiting: Math.max(0, todo.length - named - unknown) };
}

/** Listing (platform hosts) and naming (account hosts) run side by side: separate rate limits, both only spare capacity. */
async function crawlPlayers(regions: string[], deadline: number, log: (m: string) => void) {
  if (Date.now() + 5_000 > deadline) return log('player directory: no time left in this run');
  const [listed, names] = await Promise.allSettled([listDivisions(regions, deadline), fillNames(deadline)]);
  const count = (r: PromiseSettledResult<number>) => (r.status === 'fulfilled' ? r.value : 0);
  const n = names.status === 'fulfilled' ? names.value : { named: 0, unknown: 0, waiting: 0 };
  log(`player directory: ${count(listed)} ranked players listed, ${n.named} Riot IDs filled in, ${n.unknown} unknown to Riot (${n.waiting} still waiting)`);
  const failed = [listed, names].find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}

export async function runIngest(options: { regions?: string[]; log?: (message: string) => void } = {}): Promise<IngestReport> {
  const log = options.log ?? ((m: string) => console.log(`[metaforge] ${m}`));
  const setNumber = configuredSetNumber();
  const store = getStore();
  const startedAt = Date.now();
  const base: IngestReport = { ok: false, startedAt, finishedAt: startedAt, setNumber, store: store.describe(), regions: [] };
  if (!env.riotApiKey) return { ...base, error: 'RIOT_API_KEY is not configured' };
  const l = lock();
  if (l.running) return { ...base, error: BUSY };
  l.running = true;
  let lease: string | null = null;

  try {
    await store.init();
    // Excludes other servers sharing the store; outlives the budget a little and expires if a run dies unreleased.
    lease = await store.claim('ingest', env.ingestBudgetSeconds * 1000 + 120_000);
    if (!lease) return { ...base, error: BUSY };
    await store.ensureNameSearch?.().catch((error) => log(`name search index: ${error instanceof Error ? error.message : error}`));
    const regions = options.regions?.length ? options.regions : parseRegionList(env.ingestRegions);
    const setStart = Date.parse(`${getSetInfo(setNumber).start}T00:00:00Z`);
    const since = Math.max(Number.isFinite(setStart) ? setStart : 0, Date.now() - 21 * 86_400_000);
    const fullDeadline = startedAt + env.ingestBudgetSeconds * 1000;
    // Match collection gets at most (100 - CRAWL_SHARE)% of the budget; the player directory crawl has the rest.
    const deadline = startedAt + env.ingestBudgetSeconds * 10 * (100 - env.crawlShare);
    log(`collecting Set ${setNumber} ranked matches from ${regions.join(', ')} into ${store.describe()}`);

    const results = await Promise.allSettled(regions.map((r) => ingestRegion(r, setNumber, since, deadline, log)));
    const keyError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected' && fatal(r.reason));
    const report: IngestReport = {
      ...base,
      ok: !keyError,
      finishedAt: Date.now(),
      regions: results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { platform: regions[i], players: 0, candidates: 0, fetched: 0, stored: 0, skipped: 0, errors: 1, note: reportError(r.reason) },
      ),
      error: keyError ? reportError(keyError.reason) : undefined,
    };
    await store.setKv('ingest_last_report', report).catch(() => undefined);
    // Housekeeping before the crawl, which takes whatever time is left.
    let pruned = 0;
    if (env.retainDays > 0) {
      pruned = await store.prune(Date.now() - env.retainDays * 86_400_000).catch((error) => {
        log(`pruning old matches failed: ${error instanceof Error ? error.message : error}`);
        return 0;
      });
      if (pruned) log(`removed ${pruned} matches older than ${env.retainDays} days`);
    }
    // LP curves cover the current set.
    await store.pruneLp(Date.parse(`${getSetInfo(setNumber).start}T00:00:00Z`) || 0).catch(() => 0);
    // Player totals and set lists nobody has looked at for a month.
    for (const prefix of ['pt:', 'pl:']) await store.pruneKv(prefix, Date.now() - 30 * 86_400_000).catch(() => 0);
    if (pruned || report.regions.some((r) => r.stored > 0)) {
      await refreshStoredBoards().catch((error) => log(`updating the board snapshot failed: ${error instanceof Error ? error.message : error}`));
    }
    if (!keyError) {
      await crawlPlayers(regions, fullDeadline, log).catch((error) => log(`player directory: ${error instanceof Error ? error.message : error}`));
    }
    return report;
  } catch (error) {
    const report = { ...base, finishedAt: Date.now(), error: reportError(error) };
    await store.setKv('ingest_last_report', report).catch(() => undefined);
    return report;
  } finally {
    if (lease) await store.release('ingest', lease).catch(() => undefined);
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
