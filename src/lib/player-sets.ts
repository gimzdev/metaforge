import { configuredSetNumber, RANKED_QUEUE } from '@/config/game';
import { queueOf } from '@/lib/ingest';
import { allIds } from '@/lib/player-totals';
import { getMatch, riotHeadroom, RiotError } from '@/lib/riot/api';
import { getPlatform, normalizePlatform } from '@/lib/riot/regions';
import { getStore } from '@/lib/store';

/**
 * Sets a player has ranked games in (current always counts): bisect the history where the set differs at the two ends,
 * then check up to CHECK games per set for a ranked one. Cached half a day. A first look can take 100+ calls, so it
 * fails (saving nothing) below MIN_HEADROOM and the page offers every set.
 */
const CHECK = 24;
const PARALLEL = 8;
const MIN_HEADROOM = 0.25;
const TTL_MS = 12 * 3_600_000;
const BUDGET_MS = 12_000;

export async function playedSets(puuid: string, platform: string): Promise<number[]> {
  const store = getStore();
  const key = `pl:${puuid}`;
  const hit = await store.getKv<{ sets: number[]; at: number }>(key).catch(() => null);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sets;

  const host = getPlatform(normalizePlatform(platform))?.match;
  const spare = () => {
    if (host && riotHeadroom(host) < MIN_HEADROOM) throw new RiotError('rate', 'The Riot API is busy right now. Try again in a moment.');
  };
  spare();
  const deadline = Date.now() + BUDGET_MS;
  let ids: string[];
  try {
    ids = await allIds(platform, puuid, deadline);
  } catch (error) {
    if (error instanceof RiotError && error.code === 'not_found') ids = [];
    else throw error;
  }
  const known = new Map<number, number>();
  const setAt = async (i: number) => {
    let v = known.get(i);
    if (v === undefined) {
      spare();
      v = (await getMatch(ids[i], { deadline })).info.tft_set_number;
      known.set(i, v);
    }
    return v;
  };
  // Where each set's games sit in the list (newest first).
  const range = new Map<number, { from: number; to: number }>();
  const note = (set: number, i: number) => {
    const r = range.get(set);
    range.set(set, { from: Math.min(r?.from ?? i, i), to: Math.max(r?.to ?? i, i) });
  };
  const split = async (lo: number, hi: number): Promise<void> => {
    const [a, b] = await Promise.all([setAt(lo), setAt(hi)]);
    note(a, lo);
    note(b, hi);
    if (a === b || hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;
    await Promise.all([split(lo, mid), split(mid, hi)]);
  };
  if (ids.length) await split(0, ids.length - 1);

  const ranked = async (from: number, to: number) => {
    const end = Math.min(to, from + CHECK - 1);
    for (let i = from; i <= end; i += PARALLEL) {
      spare();
      const batch = Array.from({ length: Math.min(PARALLEL, end - i + 1) }, (_, k) => i + k);
      const hits = await Promise.all(batch.map(async (j) => queueOf(await getMatch(ids[j], { deadline })) === RANKED_QUEUE));
      if (hits.some(Boolean)) return true;
    }
    return false;
  };
  const current = configuredSetNumber();
  const checked = await Promise.all([...range].map(async ([set, r]) => (set === current || (await ranked(r.from, r.to)) ? set : null)));
  const sets = checked.filter((set): set is number => set !== null).sort((x, y) => y - x);
  await store.setKv(key, { sets, at: Date.now() }).catch(() => undefined);
  return sets;
}
