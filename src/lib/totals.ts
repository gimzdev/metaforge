/** A player's ranked totals for a set, built one game at a time; shared by the server walk and the browser's preview. */

export const TOTALS_VERSION = 3;

export interface Totals {
  v: number;
  set: number;
  /** Ranked games, sum of placements, and count per place (1st to 8th). */
  games: number;
  sum: number;
  spread: number[];
  /** Every game looked at (counted or not), so none is counted twice. */
  seen: string[];
  /** First earlier-set game found walking back (history before it is not this season's). */
  stop: string | null;
  fetched: number;
  done: boolean;
  /** For an earlier set: its newest game (newer ones are skipped), once probed. */
  begin: string | null;
  probed: boolean;
  at: number;
}

export type PublicTotals = Omit<Totals, 'seen' | 'v' | 'set' | 'begin' | 'probed'>;

export const emptyTotals = (set: number): Totals => ({
  v: TOTALS_VERSION,
  set,
  games: 0,
  sum: 0,
  spread: Array.from({ length: 8 }, () => 0),
  seen: [],
  stop: null,
  fetched: 0,
  done: false,
  begin: null,
  probed: false,
  at: 0,
});

export function addPlacement(t: Pick<Totals, 'games' | 'sum' | 'spread'>, placement: number) {
  const place = Math.min(8, Math.max(1, Math.round(placement) || 8));
  t.games += 1;
  t.sum += place;
  t.spread[place - 1] += 1;
}

interface TotalsSummary {
  games: number;
  avg: number;
  top1: number;
  top4: number;
}

export function summarize(t: Pick<Totals, 'games' | 'sum' | 'spread'>): TotalsSummary | null {
  if (t.games <= 0) return null;
  return {
    games: t.games,
    avg: t.sum / t.games,
    top1: t.spread[0] / t.games,
    top4: (t.spread[0] + t.spread[1] + t.spread[2] + t.spread[3]) / t.games,
  };
}

export const publicTotals = ({ seen: _seen, v: _v, set: _set, begin: _begin, probed: _probed, ...rest }: Totals): PublicTotals => rest;
