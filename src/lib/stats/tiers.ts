import type { CompRow, StatRow, Tier, TieredComp, TieredRow, TopUnit } from './types';

// Letter grades from a Bayesian-shrunk average placement: small samples are pulled toward the 4.5 lobby average
// so a lucky handful of games can't top the list.
const PRIOR = 4.5;
const PRIOR_WEIGHT = 25;

function shrunkAvg(avg: number, n: number) {
  return (avg * n + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
}

export function minSample(totalBoards: number, share = 0.004, floor = 10) {
  return Math.max(floor, Math.round(totalBoards * share));
}

/** Relative grades: the best ~12% are S, then A 23%, B 30%, C 20%, D rest. */
export function gradeRows<R extends Pick<StatRow, 'n' | 'avg'> = StatRow>(rows: R[], minN: number): Array<R & Pick<TieredRow, 'score' | 'grade'>> {
  const scored = rows.map((r) => ({ ...r, score: shrunkAvg(r.avg, r.n), grade: null as Tier | null }));
  const eligible = scored.filter((r) => r.n >= minN).sort((a, b) => a.score - b.score);
  const cuts: Array<[Tier, number]> = [['S', 0.12], ['A', 0.35], ['B', 0.65], ['C', 0.85], ['D', 1]];
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
      const grade: Tier | null = c.n < minN ? null : score <= 4.0 ? 'S' : score <= 4.25 ? 'A' : score <= 4.5 ? 'B' : score <= 4.75 ? 'C' : 'D';
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

/**
 * Standout units across every cost. Raw average placement favours legendaries (late boards that were already winning),
 * so each champion at each star level is judged against the others of the same cost and star level, counting only the
 * forms players build toward (see TARGET_STAR). Those beating their peers most while placing well outright make the
 * list, each champion once at its strongest form.
 */
export function topUnits(forms: StatRow[], champion: (key: string) => { cost: number; family: string } | null, minN: number, count = 6): TopUnit[] {
  const parsed = forms.flatMap((r) => {
    const cut = r.id.lastIndexOf(':');
    const key = r.id.slice(0, cut);
    const c = champion(key);
    const star = Number(r.id.slice(cut + 1));
    return c && c.cost > 0 && star >= (TARGET_STAR[c.cost] ?? 1) ? [{ ...r, key, star, cost: c.cost, family: c.family }] : [];
  });
  const peers = new Map<string, { n: number; sum: number }>();
  for (const f of parsed) {
    const k = `${f.cost}:${f.star}`;
    const b = peers.get(k) ?? { n: 0, sum: 0 };
    b.n += f.n;
    b.sum += f.avg * f.n;
    peers.set(k, b);
  }
  const ranked = parsed
    .filter((f) => f.n >= minN && shrunkAvg(f.avg, f.n) <= STANDOUT_MAX)
    .map((f) => {
      const b = peers.get(`${f.cost}:${f.star}`)!;
      // Without the unit itself, so a lone unit at its cost and star level has no peers to beat.
      const others = b.n - f.n;
      const peer = others > 0 ? (b.sum - f.avg * f.n) / others : f.avg;
      const shrunk = (f.avg * f.n + peer * PRIOR_WEIGHT) / (f.n + PRIOR_WEIGHT);
      return { ...f, peer, edge: shrunk - peer };
    })
    .filter((f) => f.edge < -0.05)
    .sort((a, b) => a.edge - b.edge);
  const out: TopUnit[] = [];
  const seen = new Set<string>();
  for (const f of ranked) {
    if (seen.has(f.family)) continue;
    seen.add(f.family);
    out.push({ id: f.key, star: f.star, n: f.n, avg: f.avg, top4: f.top4, win: f.win, peerAvg: f.peer });
    if (out.length >= count) break;
  }
  return out.sort((a, b) => a.avg - b.avg);
}

/** The star level each cost is built toward: 1 and 2-costs are rerolled to 3 stars. */
const TARGET_STAR: Record<number, number> = { 1: 3, 2: 3, 3: 2, 4: 2, 5: 1 };

/** A standout also has to place well outright: a shrunk average of 4.2 or better. */
const STANDOUT_MAX = 4.2;

/** Items need fewer games than champions for a stable row. */
export const itemMinSample = (minN: number) => Math.max(5, Math.round(minN * 0.6));
