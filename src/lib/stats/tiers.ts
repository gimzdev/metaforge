import type { CompRow, StatRow, Tier, TieredComp, TieredRow } from './types';

/**
 * Letter grades from a Bayesian-shrunk average placement: small samples are
 * pulled toward the 4.5 lobby average so a lucky handful of games can't top
 * the list.
 */
const PRIOR = 4.5;
const PRIOR_WEIGHT = 25;

export function shrunkAvg(avg: number, n: number) {
  return (avg * n + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
}

export function minSample(totalBoards: number, share = 0.004, floor = 10) {
  return Math.max(floor, Math.round(totalBoards * share));
}

/** Relative grades: the best ~12% are S, then A 23%, B 30%, C 20%, D rest. */
export function gradeRows(rows: StatRow[], minN: number): TieredRow[] {
  const scored = rows.map((r) => ({ ...r, score: shrunkAvg(r.avg, r.n), grade: null as Tier | null }));
  const eligible = scored.filter((r) => r.n >= minN).sort((a, b) => a.score - b.score);
  const cuts: Array<[Tier, number]> = [
    ['S', 0.12],
    ['A', 0.35],
    ['B', 0.65],
    ['C', 0.85],
    ['D', 1],
  ];
  eligible.forEach((r, i) => {
    const q = eligible.length === 1 ? 0 : i / (eligible.length - 1);
    r.grade = cuts.find(([, c]) => q <= c)?.[0] ?? 'D';
  });
  return scored.sort((a, b) => a.score - b.score);
}

/** Absolute grades for comps — boards compete directly, so 4.5 is a fair midpoint. */
export function gradeComps(comps: CompRow[], minN: number): TieredComp[] {
  return comps
    .map((c) => {
      const score = shrunkAvg(c.avg, c.n);
      let grade: Tier | null = null;
      if (c.n >= minN) {
        grade = score <= 4.0 ? 'S' : score <= 4.25 ? 'A' : score <= 4.5 ? 'B' : score <= 4.75 ? 'C' : 'D';
      }
      return { ...c, score, grade };
    })
    .sort((a, b) => (a.grade === null ? 1 : 0) - (b.grade === null ? 1 : 0) || a.score - b.score);
}

export interface Highlight {
  kind: 'best' | 'top4' | 'win' | 'popular' | 'sleeper';
  id: string;
  row: StatRow;
}

export function highlights(rows: StatRow[], minN: number): Highlight[] {
  const eligible = rows.filter((r) => r.n >= minN);
  if (!eligible.length) return [];
  const by = (fn: (r: StatRow) => number) => [...eligible].sort((a, b) => fn(b) - fn(a))[0];
  const best = by((r) => -shrunkAvg(r.avg, r.n));
  const top4 = by((r) => r.top4 - (PRIOR_WEIGHT / (r.n + PRIOR_WEIGHT)) * 0.2);
  const win = by((r) => r.win - (PRIOR_WEIGHT / (r.n + PRIOR_WEIGHT)) * 0.1);
  const popular = by((r) => r.freq);
  const medianFreq = [...eligible].sort((a, b) => a.freq - b.freq)[Math.floor(eligible.length / 2)]?.freq ?? 0;
  const quiet = eligible.filter((r) => r.freq <= medianFreq);
  const sleeper = quiet.length ? [...quiet].sort((a, b) => shrunkAvg(a.avg, a.n) - shrunkAvg(b.avg, b.n))[0] : undefined;
  const out: Highlight[] = [
    { kind: 'best', id: best.id, row: best },
    { kind: 'top4', id: top4.id, row: top4 },
    { kind: 'win', id: win.id, row: win },
    { kind: 'popular', id: popular.id, row: popular },
  ];
  if (sleeper && sleeper.id !== best.id) out.push({ kind: 'sleeper', id: sleeper.id, row: sleeper });
  return out;
}
