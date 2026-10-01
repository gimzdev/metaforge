/**
 * A player's ranked totals for the current set, built up one game at a time. Pure and shared: the server adds
 * games as it walks a player's history (and stores the result), the browser adds the games it has loaded to show
 * something while that runs. Riot reports ranked wins (top 4 finishes) and games, but not first places, average
 * place: that only comes from the games themselves.
 */

export const TOTALS_VERSION = 3;

export interface Totals {
  v: number;
  /** The set these totals cover; a new set starts them over. */
  set: number;
  /** Ranked games counted, the sum of their placements, and how many ended in each place (1st to 8th). */
  games: number;
  sum: number;
  spread: number[];
  /** Every game already looked at (counted or not), so none is counted twice. */
  seen: string[];
  /** The first game of an earlier set found walking back (history before it is not this season's), or null. */
  stop: string | null;
  /** Games fetched from Riot so far, and whether the whole history has been walked. */
  fetched: number;
  done: boolean;
  /** For an earlier set: the newest game of that set or older (games newer than it are skipped), once looked for. */
  begin: string | null;
  probed: boolean;
  /** When these were last updated (epoch ms). */
  at: number;
}

/** What the browser gets: the totals without the list of games seen. */
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

/** Count one game from the player's final placement (1st to 8th). */
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
