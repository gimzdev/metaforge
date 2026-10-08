import { configuredSetNumber, RANKED_QUEUE } from '@/config/game';
import { singleton } from '@/lib/cache';
import { queueOf } from '@/lib/ingest';
import { getMatch, getMatchIds, riotHeadroom, RiotError } from '@/lib/riot/api';
import { getPlatform, normalizePlatform } from '@/lib/riot/regions';
import { getStore } from '@/lib/store';
import { addPlacement, emptyTotals, TOTALS_VERSION, type Totals } from '@/lib/totals';

/**
 * A player's ranked totals for a set, built a step at a time backwards through their history and saved (~4 KB, pruned
 * after a month unvisited), so later visits only add new games. Backs off below MIN_HEADROOM; capped at MAX_FETCH games.
 */

const PAGE = 200; // game ids per request (Riot's maximum)
const STEP = 48; // games fetched per step
const PARALLEL = 12;
const MAX_FETCH = 600;
const MIN_HEADROOM = 0.25;
const BUDGET_MS = 12_000;

interface Step {
  totals: Totals;
  done: boolean;
  /** ms before asking for the next step (0 when done). */
  retryIn: number;
}

const locks = () => singleton('player-totals-locks', () => new Map<string, Promise<unknown>>());
const failures = () => singleton('player-totals-failures', () => new Map<string, number>());

/** One step at a time per player, so two open tabs never count the same game twice. */
function locked<T>(key: string, work: () => Promise<T>): Promise<T> {
  const map = locks();
  const prev = map.get(key) ?? Promise.resolve();
  const run = prev.then(work, work);
  const tail = run.catch(() => undefined);
  map.set(key, tail);
  void tail.then(() => map.get(key) === tail && map.delete(key));
  return run;
}

const transient = (error: unknown) => error instanceof RiotError && ['budget', 'rate', 'network', 'server'].includes(error.code);

export const advanceTotals = (puuid: string, platform: string, set = configuredSetNumber()): Promise<Step> =>
  locked(`${puuid}:${set}`, () => step(puuid, platform, set));

const MAX_IDS = 4000;

/** Every game id Riot still lists for the player, newest first. */
export async function allIds(platform: string, puuid: string, deadline: number): Promise<string[]> {
  const ids: string[] = [];
  // The first page is usually all there is; longer histories go four pages at a time.
  let start = 0;
  let width = 1;
  while (ids.length < MAX_IDS) {
    const pages = await Promise.all(Array.from({ length: width }, (_, k) => getMatchIds(platform, puuid, { start: start + k * PAGE, count: PAGE }, { deadline })));
    for (const page of pages) ids.push(...page);
    if (pages.some((page) => page.length < PAGE)) break;
    start += width * PAGE;
    width = 4;
  }
  return ids;
}

/**
 * For an earlier set, its newest game id by bisection (sets only move forward): a dozen lookups instead of every newer
 * game. 'none' when every game is from a later set, null to just scan.
 */
async function findBegin(platform: string, puuid: string, set: number, deadline: number): Promise<string | 'none' | null> {
  const ids = await allIds(platform, puuid, deadline);
  if (!ids.length) return 'none';
  const setAt = async (i: number) => (await getMatch(ids[i], { deadline })).info.tft_set_number;
  try {
    if ((await setAt(ids.length - 1)) > set) return 'none';
    if ((await setAt(0)) <= set) return ids[0];
    let lo = 0; // newer than the set
    let hi = ids.length - 1; // the set or older
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((await setAt(mid)) <= set) hi = mid;
      else lo = mid;
    }
    return ids[hi];
  } catch (error) {
    if (error instanceof RiotError && (error.code === 'not_found' || error.code === 'bad_request')) return null;
    throw error;
  }
}

async function step(puuid: string, platform: string, set: number): Promise<Step> {
  const store = getStore();
  const key = `pt:${puuid}:${set}`;
  const p = getPlatform(normalizePlatform(platform) ?? '');
  if (!p) throw new RiotError('bad_request', 'Unknown region');

  const stored = await store.getKv<Totals>(key).catch(() => null);
  let t = stored && stored.v === TOTALS_VERSION && stored.set === set ? stored : emptyTotals(set);
  const hadStop = t.stop !== null;
  const before = `${t.fetched}|${t.done}|${t.stop}`;
  const deadline = Date.now() + BUDGET_MS;
  const seen = new Set(t.seen);
  const retry = (ms: number): Step => ({ totals: t, done: false, retryIn: ms });

  // 0. An earlier set starts somewhere back in the history: find where first.
  if (!t.probed && set < configuredSetNumber()) {
    try {
      const found = await findBegin(platform, puuid, set, deadline);
      t.probed = true;
      if (found === 'none') t.done = true;
      else t.begin = found;
      t.at = Date.now();
      await store.setKv(key, t).catch(() => undefined);
      if (t.done) return { totals: t, done: true, retryIn: 0 };
    } catch (error) {
      if (transient(error)) return retry(5_000);
      throw error;
    }
  }

  // 1. The newest games not looked at yet. A finished history only needs its first page checked for new games.
  const todo: string[] = [];
  let exhausted = false;
  let started = t.begin === null; // games newer than an earlier set's start are skipped
  try {
    for (let start = 0; todo.length < STEP && !exhausted; start += PAGE) {
      const ids = await getMatchIds(platform, puuid, { start, count: PAGE }, { deadline });
      let fresh = 0;
      for (const id of ids) {
        if (!started) {
          if (id !== t.begin) continue;
          started = true;
        }
        if (id === t.stop) {
          exhausted = true;
          break;
        }
        if (!seen.has(id)) {
          todo.push(id);
          fresh++;
        }
      }
      if (ids.length < PAGE || (t.done && fresh === 0)) exhausted = true;
    }
  } catch (error) {
    if (error instanceof RiotError && error.code === 'not_found') exhausted = true;
    else if (transient(error)) return retry(5_000);
    else throw error;
  }

  // 2. Fetch and count them, a few at a time.
  const batch = todo.slice(0, STEP);
  // 'skip' marks a game that cannot be read.
  type Seen = { set: number; queue: number; place: number | null } | 'skip';
  const views = new Array<Seen | undefined>(batch.length).fill(undefined);
  let cursor = 0;
  let backOff = false;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, batch.length) }, async () => {
      while (!backOff) {
        const i = cursor++;
        if (i >= batch.length) return;
        if (riotHeadroom(p.match) < MIN_HEADROOM) {
          backOff = true;
          return;
        }
        try {
          const match = await getMatch(batch[i], { deadline });
          views[i] = {
            set: match.info.tft_set_number,
            queue: queueOf(match),
            place: match.info.participants?.find((x) => x.puuid === puuid)?.placement ?? null,
          };
        } catch (error) {
          if (!(error instanceof RiotError) || error.code === 'key' || error.code === 'config') throw error;
          if (error.code === 'not_found' || error.code === 'bad_request') views[i] = 'skip';
          else if (error.code === 'budget' || error.code === 'rate') backOff = true;
          else {
            // Give up on a game after a few failures so it cannot hold everything back.
            const tries = failures();
            if (tries.size > 2000) tries.clear();
            const n = (tries.get(batch[i]) ?? 0) + 1;
            tries.set(batch[i], n);
            if (n >= 3) views[i] = 'skip';
          }
        }
      }
    }),
  );

  let handled = 0;
  let last: string | null = null;
  for (let i = 0; i < batch.length; i++) {
    const view = views[i];
    if (view === undefined) continue;
    handled++;
    last = batch[i];
    seen.add(batch[i]);
    t.fetched++;
    if (view === 'skip') continue;
    if (view.set > set) continue; // a later set (only met near the start of an earlier one)
    if (view.set < set) {
      // Walking back from the newest: the first earlier-set game marks where this season starts.
      if (!t.stop) t.stop = batch[i];
    } else if (view.queue === RANKED_QUEUE && view.place !== null) {
      addPlacement(t, view.place);
    }
  }
  t.seen = [...seen];
  // At the cap, the oldest game reached becomes the start (newer games still get added later).
  if (!t.stop && t.fetched >= MAX_FETCH && last) t.stop = last;

  // 2b. Done when every game newer than the start (or cap) was seen; games past a start found this step are not left over.
  const allHandled = handled === batch.length;
  t.done = allHandled && ((t.stop !== null && (!hadStop || todo.length === batch.length)) || (exhausted && todo.length === batch.length));
  const changed = `${t.fetched}|${t.done}|${t.stop}` !== before;
  // Also rewritten about daily so a player still being looked at is not pruned.
  if (changed || !stored || Date.now() - t.at > 86_400_000) {
    t.at = Date.now();
    await store.setKv(key, t).catch(() => undefined);
  }
  return { totals: t, done: t.done, retryIn: t.done ? 0 : backOff || handled < batch.length ? 4_000 : 50 };
}
