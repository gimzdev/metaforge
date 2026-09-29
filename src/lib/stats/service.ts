import { TtlCache, singleton } from '@/lib/cache';
import { getDataset, type Dataset } from './dataset';
import {
  aggregate,
  aggregateComps,
  heldItems,
  clusterIndex,
  itemInsight,
  resolveScope,
  scopeBoards,
  selectBoards,
  summarize,
  traitInsight,
  unitInsight,
} from './engine';
import { filterSignature } from './filters';
import { gradeComps, gradeRows, highlights, minSample, type Highlight } from './tiers';
import type { ExplorerResult, Filter, Scope, StatRow, Summary, TieredComp, TieredRow } from './types';

/** Cached, page-ready stats built on the engine. */

const results = () => singleton('stats-results', () => new TtlCache<unknown>(150, 5 * 60_000));

function memo<T>(ds: Dataset, key: string, build: () => T): T {
  const k = `${ds.version}:${ds.meta.builtAt}:${key}`;
  const hit = results().get(k);
  if (hit !== undefined) return hit as T;
  const value = build();
  results().set(k, value);
  return value;
}

export async function explore(scopeInput: Partial<Scope>, filters: Filter[]): Promise<ExplorerResult> {
  const ds = await getDataset();
  const { scope, idx } = resolveScope(ds, scopeInput);
  return memo(ds, `explore:${scope.region}|${scope.patch}|${filterSignature(filters)}`, () => {
    const base = scopeBoards(ds, idx);
    const baseline = summarize(ds, base, base.length);
    const boards = selectBoards(ds, base, filters);
    const summary = summarize(ds, boards, base.length);
    const rows = aggregate(ds, boards, summary.avg);
    const comps = aggregateComps(ds, boards, { minN: Math.max(4, Math.round(boards.length * 0.004)), limit: 30 });
    const held: Record<string, StatRow[]> = {};
    for (const f of filters) {
      if (f.k === 'unit' && !f.not && !held[f.id]) held[f.id] = heldItems(ds, boards, f.id, summary.avg);
    }
    return { scope, summary, baseline, ...rows, comps, held, meta: ds.meta };
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
  highlights: { units: Highlight[]; items: Highlight[]; traits: Highlight[] };
  trends: Record<string, number>;
  previousPatch: string | null;
}

export async function getMeta(scopeInput: Partial<Scope> = {}): Promise<MetaResult> {
  const ds = await getDataset();
  const { scope, idx } = resolveScope(ds, scopeInput);
  return memo(ds, `meta:${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    const summary = summarize(ds, boards, boards.length);
    const rows = aggregate(ds, boards, summary.avg);
    const minN = minSample(boards.length, 0.004, 10);
    // Only comps people actually play: at least 0.5% of boards (and 15 games), best 24 by grade.
    const compMin = Math.max(15, Math.round(boards.length * 0.005));
    const comps = gradeComps(aggregateComps(ds, boards, { minN: compMin, limit: 40 }), compMin)
      .filter((c) => c.grade)
      .slice(0, 24);

    // Trend versus the previous patch window, when it has a real sample.
    const trends: Record<string, number> = {};
    let previousPatch: string | null = null;
    const current = idx.patch >= 0 ? idx.patch : ds.patches.length - 1;
    if (current > 0) {
      const prevIdx = { region: idx.region, patch: current - 1 };
      const prevBoards = scopeBoards(ds, prevIdx);
      const currentBoards = idx.patch >= 0 ? boards : scopeBoards(ds, { region: idx.region, patch: current });
      if (prevBoards.length >= 400 && currentBoards.length >= 400) {
        previousPatch = ds.patches[current - 1].label;
        const prev = aggregate(ds, prevBoards, 0).units;
        const now = aggregate(ds, currentBoards, 0).units;
        const prevMap = new Map(prev.filter((r) => r.n >= 20).map((r) => [r.id, r.avg]));
        for (const r of now) {
          const before = prevMap.get(r.id);
          if (before !== undefined && r.n >= 20) trends[r.id] = r.avg - before;
        }
      }
    }
    const units = gradeRows(rows.units, minN);
    const items = gradeRows(rows.items, minSample(boards.length, 0.003, 8));
    const traits = gradeRows(rows.traits, minN);
    return {
      scope,
      meta: ds.meta,
      summary,
      minN,
      units,
      items,
      traits,
      augments: gradeRows(rows.augments, minN),
      comps,
      highlights: {
        units: highlights(rows.units, minN),
        items: highlights(rows.items, minN),
        traits: highlights(rows.traits, minN),
      },
      trends,
      previousPatch,
    };
  });
}

export async function getUnitStats(key: string, scopeInput: Partial<Scope> = {}) {
  const ds = await getDataset();
  const { scope, idx } = resolveScope(ds, scopeInput);
  return memo(ds, `unit:${key}|${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    const insight = unitInsight(ds, boards, key);
    const withUnit = selectBoards(ds, boards, [{ k: 'unit', id: key }]);
    const comps = gradeComps(aggregateComps(ds, withUnit, { minN: Math.max(5, Math.round(withUnit.length * 0.01)), limit: 8 }), 8);
    return { scope, meta: ds.meta, total: boards.length, ...insight, comps };
  });
}

export async function getItemStats(key: string, scopeInput: Partial<Scope> = {}) {
  const ds = await getDataset();
  const { scope, idx } = resolveScope(ds, scopeInput);
  return memo(ds, `item:${key}|${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    return { scope, meta: ds.meta, total: boards.length, ...itemInsight(ds, boards, key) };
  });
}

export async function getTraitStats(key: string, scopeInput: Partial<Scope> = {}) {
  const ds = await getDataset();
  const { scope, idx } = resolveScope(ds, scopeInput);
  return memo(ds, `trait:${key}|${scope.region}|${scope.patch}`, () => {
    const boards = scopeBoards(ds, idx);
    const insight = traitInsight(ds, boards, key);
    const withTrait = selectBoards(ds, boards, [{ k: 'trait', id: key }]);
    const comps = gradeComps(aggregateComps(ds, withTrait, { minN: Math.max(5, Math.round(withTrait.length * 0.01)), limit: 8 }), 8);
    return { scope, meta: ds.meta, total: boards.length, ...insight, comps };
  });
}

export async function getComp(id: string, scopeInput: Partial<Scope> = {}) {
  const ds = await getDataset();
  const { scope, idx } = resolveScope(ds, scopeInput);
  const c = clusterIndex(ds, id);
  if (c < 0) return null;
  return memo(ds, `comp:${id}|${scope.region}|${scope.patch}`, () => {
    let boards = scopeBoards(ds, idx);
    let [row] = aggregateComps(ds, boards, { minN: 1, limit: 1, only: [c] });
    let widened = false;
    if (!row && idx.patch >= 0) {
      boards = scopeBoards(ds, { region: idx.region, patch: -1 });
      [row] = aggregateComps(ds, boards, { minN: 1, limit: 1, only: [c] });
      widened = true;
    }
    if (!row) return null;
    const [graded] = gradeComps([row], 12);
    const compBoards = new Int32Array(Array.from(boards).filter((b) => ds.comp[b] === c));
    const carry = ds.clusters[c].carry;
    const carryKey = carry >= 0 ? ds.champKeys[carry] : null;
    const carryInsight = carryKey ? unitInsight(ds, compBoards, carryKey) : null;
    const levels = aggregate(ds, compBoards, graded.avg).levels;
    return { scope: widened ? { ...scope, patch: 'all' } : scope, meta: ds.meta, comp: graded, carry: carryKey, carryBuilds: carryInsight?.builds.slice(0, 6) ?? [], carryItems: carryInsight?.items ?? [], levels };
  });
}

export async function datasetMeta() {
  const ds = await getDataset();
  return ds.meta;
}
