import { TtlCache, singleton } from '@/lib/cache';
import { getDataset, type Dataset } from './dataset';
import {
  aggregate,
  aggregateComps,
  heldItems,
  clusterIndex,
  itemHolders,
  itemInsight,
  resolveScope,
  scopeBoards,
  selectBoards,
  summarize,
  traitInsight,
  unitForms,
  unitInsight,
  unitRows,
} from './engine';
import { filterSignature } from './filters';
import { indexStatic } from '@/lib/static';
import { trimFloats } from '@/lib/utils';
import { gradeComps, gradeRows, highlights, itemMinSample, minSample, topUnits, type Highlight } from './tiers';
import type { ExplorerResult, Filter, Scope, StatRow, Summary, TieredComp, TieredRow, TopUnit } from './types';

// Cached, page-ready stats built on the engine.
const results = () => singleton('stats-results', () => new TtlCache<unknown>(150, 5 * 60_000));

function memo<T>(ds: Dataset, key: string, build: () => T): T {
  const k = `${ds.version}:${ds.meta.builtAt}:${key}`;
  const hit = results().get(k);
  if (hit !== undefined) return hit as T;
  const value = trimFloats(build());
  results().set(k, value);
  return value;
}

async function scoped(scopeInput: Partial<Scope>) {
  const ds = await getDataset();
  return { ds, ...resolveScope(ds, scopeInput) };
}

/** Comps among the boards that pass one filter (unit and trait pages). */
function compsWith(ds: Dataset, boards: Int32Array, filter: Filter) {
  const picked = selectBoards(ds, boards, [filter]);
  return gradeComps(aggregateComps(ds, picked, { minN: Math.max(5, Math.round(picked.length * 0.01)), limit: 8 }), 8);
}

export async function explore(scopeInput: Partial<Scope>, filters: Filter[]): Promise<ExplorerResult> {
  const { ds, scope, idx } = await scoped(scopeInput);
  return memo(ds, `explore:${scope.region}|${scope.patch}|${filterSignature(filters)}`, () => {
    const base = scopeBoards(ds, idx);
    const baseline = summarize(ds, base, base.length);
    const boards = selectBoards(ds, base, filters);
    const summary = summarize(ds, boards, base.length);
    const rows = aggregate(ds, boards, summary.avg);
    const comps = aggregateComps(ds, boards, { minN: Math.max(4, Math.round(boards.length * 0.004)), limit: 30 });
    // Items each champion in the filters holds, and the champions holding each item in them.
    const held: Record<string, StatRow[]> = {};
    const holders: Record<string, StatRow[]> = {};
    for (const f of filters) {
      if (f.not) continue;
      if (f.k === 'unit') held[f.id] ??= heldItems(ds, boards, f.id, summary.avg);
      if (f.k === 'item') holders[f.id] ??= itemHolders(ds, boards, f.id, summary.avg);
    }
    return { scope, summary, baseline, ...rows, comps, held, holders, meta: ds.meta };
  });
}

export interface MetaResult {
  scope: Scope;
  meta: Dataset['meta'];
  summary: Summary;
  minN: number;
  units: TieredRow[];
  items: TieredRow[];
  traits: TieredRow[];
  augments: TieredRow[];
  comps: TieredComp[];
  /** Best champions judged against their own cost and star level (see topUnits). */
  topUnits: TopUnit[];
  highlights: { units: Highlight[]; items: Highlight[]; traits: Highlight[] };
  trends: Record<string, number>;
  previousPatch: string | null;
}

export async function getMeta(scopeInput: Partial<Scope> = {}): Promise<MetaResult> {
  const { ds, scope, idx } = await scoped(scopeInput);
  return memo(ds, `meta:${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    const summary = summarize(ds, boards, boards.length);
    const rows = aggregate(ds, boards, summary.avg);
    const minN = minSample(boards.length, 0.004, 10);
    // Only comps people actually play: at least 0.5% of boards (and 15 games), best 24 by grade.
    const compMin = Math.max(15, Math.round(boards.length * 0.005));
    const comps = gradeComps(aggregateComps(ds, boards, { minN: compMin, limit: 40 }), compMin).filter((c) => c.grade).slice(0, 24);

    // Trend versus the previous patch window, when it has a real sample.
    const trends: Record<string, number> = {};
    let previousPatch: string | null = null;
    const current = idx.patch >= 0 ? idx.patch : ds.patches.length - 1;
    if (current > 0) {
      const prevBoards = scopeBoards(ds, { region: idx.region, patch: current - 1 });
      const currentBoards = idx.patch >= 0 ? boards : scopeBoards(ds, { region: idx.region, patch: current });
      if (prevBoards.length >= 400 && currentBoards.length >= 400) {
        previousPatch = ds.patches[current - 1].label;
        const prevMap = new Map(unitRows(ds, prevBoards, 0).filter((r) => r.n >= 20).map((r) => [r.id, r.avg]));
        for (const r of unitRows(ds, currentBoards, 0)) {
          const before = prevMap.get(r.id);
          if (before !== undefined && r.n >= 20) trends[r.id] = r.avg - before;
        }
      }
    }
    const index = indexStatic(ds.static);
    const family = (key: string) => {
      const c = index.champion(key);
      return c ? { cost: c.cost, family: c.baseName || c.name } : null;
    };
    return {
      scope,
      meta: ds.meta,
      summary,
      minN,
      units: gradeRows(rows.units, minN),
      items: gradeRows(rows.items, minSample(boards.length, 0.003, 8)),
      traits: gradeRows(rows.traits, minN),
      augments: gradeRows(rows.augments, minN),
      comps,
      topUnits: topUnits(unitForms(ds, boards, summary.avg), family, minN),
      highlights: { units: highlights(rows.units, minN), items: highlights(rows.items, minN), traits: highlights(rows.traits, minN) },
      trends,
      previousPatch,
    };
  });
}

/** A graded row as the meta page's tier lists draw it. */
export type TierRow = Pick<TieredRow, 'id' | 'n' | 'avg' | 'grade' | 'tier'>;

/** What the page sends: only graded rows and the fields the tier lists draw (items are graded again per category). */
export interface MetaViewData extends Omit<MetaResult, 'topUnits' | 'summary' | 'units' | 'items' | 'traits' | 'augments'> {
  units: TierRow[];
  items: Array<Pick<StatRow, 'id' | 'n' | 'avg'>>;
  traits: TierRow[];
  augments: TierRow[];
}

/** Slim a meta result down to what MetaView draws (keeps the page payload small). */
export function metaViewData({ topUnits: _topUnits, summary: _summary, units, items, traits, augments, ...rest }: MetaResult): MetaViewData {
  const graded = (rows: TieredRow[]) => rows.filter((r) => r.grade).map(({ id, n, avg, grade, tier }) => ({ id, n, avg, grade, tier }));
  const itemMin = itemMinSample(rest.minN);
  return {
    ...rest,
    units: graded(units),
    items: items.filter((r) => r.n >= itemMin).map(({ id, n, avg }) => ({ id, n, avg })),
    traits: graded(traits),
    augments: graded(augments),
  };
}

export async function getUnitStats(key: string, scopeInput: Partial<Scope> = {}) {
  const { ds, scope, idx } = await scoped(scopeInput);
  return memo(ds, `unit:${key}|${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    return { scope, meta: ds.meta, total: boards.length, ...unitInsight(ds, boards, key), comps: compsWith(ds, boards, { k: 'unit', id: key }) };
  });
}

export async function getItemStats(key: string, scopeInput: Partial<Scope> = {}) {
  const { ds, scope, idx } = await scoped(scopeInput);
  return memo(ds, `item:${key}|${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    return { scope, meta: ds.meta, total: boards.length, ...itemInsight(ds, boards, key) };
  });
}

export async function getTraitStats(key: string, scopeInput: Partial<Scope> = {}) {
  const { ds, scope, idx } = await scoped(scopeInput);
  return memo(ds, `trait:${key}|${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    return { scope, meta: ds.meta, total: boards.length, ...traitInsight(ds, boards, key), comps: compsWith(ds, boards, { k: 'trait', id: key }) };
  });
}

/**
 * Comp ids are built from the boards and are regrouped on every data refresh, so an old link, a bookmark or another server instance
 * can name a comp that is now called something else. Finds the closest current comp (same carry and trait words) to send the visitor to.
 */
export async function resolveCompId(id: string): Promise<string | null> {
  const ds = await getDataset();
  if (ds.clusters.some((c) => c.id === id)) return id;
  const base = id.replace(/-\d+$/, '');
  const same = ds.clusters.find((c) => c.id === base || c.id.replace(/-\d+$/, '') === base);
  if (same) return same.id;
  const words = new Set(base.split('-').filter(Boolean));
  let best: string | null = null;
  let bestScore = 0;
  for (const c of ds.clusters) {
    const theirs = c.id.split('-');
    let score = 0;
    for (const w of theirs) if (words.has(w)) score++;
    score /= Math.max(words.size, theirs.length);
    if (score > bestScore) {
      best = c.id;
      bestScore = score;
    }
  }
  return bestScore >= 0.34 ? best : null;
}

export async function getComp(id: string, scopeInput: Partial<Scope> = {}) {
  const { ds, scope, idx } = await scoped(scopeInput);
  const c = clusterIndex(ds, id);
  if (c < 0) return null;
  return memo(ds, `comp:${id}|${scope.region}|${scope.patch}`, () => {
    let scopeAll = false;
    let boards = scopeBoards(ds, idx);
    let [row] = aggregateComps(ds, boards, { minN: 1, limit: 1, only: [c] });
    let widened = false;
    if (!row && idx.patch >= 0) {
      boards = scopeBoards(ds, { region: idx.region, patch: -1 });
      [row] = aggregateComps(ds, boards, { minN: 1, limit: 1, only: [c] });
      widened = true;
    }
    // A comp that nobody played in this region: show it across all regions rather than a 404.
    if (!row && idx.region !== -1) {
      boards = scopeBoards(ds, { region: -1, patch: -1 });
      [row] = aggregateComps(ds, boards, { minN: 1, limit: 1, only: [c] });
      widened = true;
      scopeAll = true;
    }
    if (!row) return null;
    const [graded] = gradeComps([row], 12);
    const compBoards = new Int32Array(Array.from(boards).filter((b) => ds.comp[b] === c));
    const carry = ds.clusters[c].carry;
    const carryKey = carry >= 0 ? ds.champKeys[carry] : null;
    const carryInsight = carryKey ? unitInsight(ds, compBoards, carryKey) : null;
    const levels = aggregate(ds, compBoards, graded.avg).levels;
    return { scope: scopeAll ? { region: 'all', patch: 'all' } : widened ? { ...scope, patch: 'all' } : scope, meta: ds.meta, comp: graded, carry: carryKey, carryBuilds: carryInsight?.builds.slice(0, 6) ?? [], carryItems: carryInsight?.items ?? [], levels };
  });
}

/** id → [average placement, play rate], for rows with at least minN games (home and collection tiles). */
export type StatMap = Record<string, [number, number]>;

export function statMap(rows: StatRow[], minN: number): StatMap {
  const out: StatMap = {};
  for (const r of rows) if (r.n >= minN) out[r.id] = [Number(r.avg.toFixed(2)), Number(r.freq.toFixed(4))];
  return out;
}
