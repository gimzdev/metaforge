import { configuredSetNumber, RANKED_QUEUE } from '@/config/game';
import { queueOf } from '@/lib/ingest';
import { allIds } from '@/lib/player-totals';
import { getMatch, RiotError } from '@/lib/riot/api';
import { getStore } from '@/lib/store';

/**
 * Which sets a player has ranked games in (the current set always counts), from the history Riot still lists. Games only move forward through sets,
 * so the list is split where the set differs at its two ends (a few lookups per set change), then each set is
 * searched from its newest game for a ranked one, giving up after CHECK games. Saved for half a day, since an old
 * set never gains games.
 */
const CHECK = 24;
const PARALLEL = 8;

const TTL_MS = 12 * 3_600_000;
const BUDGET_MS = 12_000;

export async function playedSets(puuid: string, platform: string): Promise<number[]> {
  const store = getStore();
  const key = `pl:${puuid}`;
  const hit = await store.getKv<{ sets: number[]; at: number }>(key).catch(() => null);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sets;

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
      v = (await getMatch(ids[i], { deadline })).info.tft_set_number;
      known.set(i, v);
    }
    return v;
  };
  // Where each set's games sit in the list (newest first).
  const range = new Map<number, { from: number; to: number }>();
  const note = (set: number, i: number) => {
    const r = range.get(set);
    if (!r) range.set(set, { from: i, to: i });
    else {
      r.from = Math.min(r.from, i);
      r.to = Math.max(r.to, i);
    }
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
      const batch = Array.from({ length: Math.min(PARALLEL, end - i + 1) }, (_, k) => i + k);
      const hits = await Promise.all(batch.map(async (j) => queueOf(await getMatch(ids[j], { deadline })) === RANKED_QUEUE));
      if (hits.some(Boolean)) return true;
    }
    return false;
  };
  // The current set is always offered; every other set is checked at the same time.
  const current = configuredSetNumber();
  const checked = await Promise.all([...range].map(async ([set, r]) => (set === current || (await ranked(r.from, r.to)) ? set : null)));
  const sets = checked.filter((set): set is number => set !== null).sort((x, y) => y - x);
  await store.setKv(key, { sets, at: Date.now() }).catch(() => undefined);
  return sets;
}
