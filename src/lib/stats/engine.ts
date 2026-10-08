import { SET_RULES } from '@/config/game';
import { autoPlace, computeTraits } from '@/lib/builder';
import { indexStatic } from '@/lib/static';
import { NO_PATCH, type Dataset } from './dataset';
import { ALL, type CompRow, type CompUnit, type Filter, type Scope, type StatRow, type Summary } from './types';

// Scoping, filtering and aggregation over the column dataset. Pure and synchronous.
interface ScopeIdx {
  region: number; // -1 = all regions, -2 = region without data
  patch: number; // -1 = all patches
}

export function resolveScope(ds: Dataset, input: Partial<Scope> = {}): { scope: Scope; idx: ScopeIdx } {
  let region = -1;
  let regionLabel = ALL;
  if (input.region && input.region !== ALL) {
    const i = ds.regions.indexOf(input.region);
    region = i >= 0 ? i : -2;
    regionLabel = input.region;
  }
  let patch = -1;
  let patchLabel = ALL;
  const requested = input.patch;
  if (requested && requested !== ALL) {
    const i = ds.patches.findIndex((p) => p.label === requested);
    if (i >= 0) {
      patch = i;
      patchLabel = requested;
    }
  } else if (!requested) {
    // Default to the live patch, never the whole set: while it is still thin, the stats are noisier but current. Only
    // when no board of the live patch is stored yet does the newest patch that has some stand in for it.
    for (let i = ds.patches.length - 1; i >= 0; i--) {
      if ((ds.meta.patches[i]?.boards ?? 0) > 0) {
        patch = i;
        patchLabel = ds.patches[i].label;
        break;
      }
    }
  }
  return { scope: { region: regionLabel, patch: patchLabel }, idx: { region, patch } };
}

const scopeMemo = new WeakMap<Dataset, Map<string, Int32Array>>();

export function scopeBoards(ds: Dataset, idx: ScopeIdx): Int32Array {
  let memo = scopeMemo.get(ds);
  if (!memo) scopeMemo.set(ds, (memo = new Map()));
  const key = `${idx.region}|${idx.patch}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const out: number[] = [];
  if (idx.region !== -2) {
    for (let b = 0; b < ds.N; b++) {
      if (idx.region >= 0 && ds.region[b] !== idx.region) continue;
      if (idx.patch >= 0 && ds.patch[b] !== idx.patch) continue;
      if (idx.patch >= 0 && ds.patch[b] === NO_PATCH) continue;
      out.push(b);
    }
  }
  const arr = Int32Array.from(out);
  memo.set(key, arr);
  return arr;
}

type Pred = (b: number) => boolean;
const NEVER: Pred = () => false;
const ALWAYS: Pred = () => true;

function compileOne(ds: Dataset, f: Filter): Pred {
  const negate = (p: Pred): Pred => (f.not ? (b) => !p(b) : p);
  switch (f.k) {
    case 'unit': {
      const c = ds.champIdx.get(f.id);
      if (c === undefined) return f.not ? ALWAYS : NEVER;
      const stars = f.stars?.length ? new Set(f.stars) : null;
      const required = (f.items ?? []).map((i) => ds.itemIdx.get(i));
      if (required.some((i) => i === undefined)) return f.not ? ALWAYS : NEVER;
      const need = required as number[];
      const minItems = Math.max(f.minItems ?? 0, need.length);
      // The candidate's items, reused across boards; each required copy uses up one of them.
      const pool: number[] = [];
      return negate((b) => {
        units: for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
          if (ds.uChamp[u] !== c) continue;
          if (stars && !stars.has(ds.uStar[u])) continue;
          const i0 = ds.iStart[u];
          const i1 = ds.iStart[u + 1];
          if (i1 - i0 < minItems) continue;
          if (need.length) {
            pool.length = 0;
            for (let i = i0; i < i1; i++) pool.push(ds.iItem[i]);
            for (const r of need) {
              const at = pool.indexOf(r);
              if (at < 0) continue units;
              pool[at] = -1;
            }
          }
          return true;
        }
        return false;
      });
    }
    case 'item': {
      const it = ds.itemIdx.get(f.id);
      if (it === undefined) return f.not ? ALWAYS : NEVER;
      const min = f.min ?? 1;
      return negate((b) => {
        let copies = 0;
        const i0 = ds.iStart[ds.uStart[b]];
        const i1 = ds.iStart[ds.uStart[b + 1]];
        for (let i = i0; i < i1; i++) if (ds.iItem[i] === it && ++copies >= min) return true;
        return false;
      });
    }
    case 'trait': {
      const t = ds.traitIdx.get(f.id);
      if (t === undefined) return f.not ? ALWAYS : NEVER;
      const min = f.min ?? 1;
      const max = f.max ?? 99;
      return negate((b) => {
        for (let x = ds.tStart[b]; x < ds.tStart[b + 1]; x++) {
          if (ds.tTrait[x] === t) return ds.tTier[x] >= min && ds.tTier[x] <= max;
        }
        return false;
      });
    }
    case 'aug': {
      const a = ds.augIdx.get(f.id);
      if (a === undefined) return f.not ? ALWAYS : NEVER;
      return negate((b) => {
        for (let x = ds.aStart[b]; x < ds.aStart[b + 1]; x++) if (ds.aAug[x] === a) return true;
        return false;
      });
    }
    case 'level': {
      const min = f.min ?? 0;
      const max = f.max ?? 99;
      return negate((b) => ds.level[b] >= min && ds.level[b] <= max);
    }
  }
}

export function selectBoards(ds: Dataset, base: Int32Array, filters: Filter[]): Int32Array {
  if (!filters.length) return base;
  const preds = filters.map((f) => compileOne(ds, f));
  const out: number[] = [];
  outer: for (let i = 0; i < base.length; i++) {
    const b = base[i];
    for (const p of preds) if (!p(b)) continue outer;
    out.push(b);
  }
  return Int32Array.from(out);
}

export function summarize(ds: Dataset, boards: Int32Array, total: number): Summary {
  const placements = [0, 0, 0, 0, 0, 0, 0, 0];
  let sum = 0;
  for (let i = 0; i < boards.length; i++) {
    const p = ds.place[boards[i]];
    placements[p - 1]++;
    sum += p;
  }
  const n = boards.length;
  const top4 = placements[0] + placements[1] + placements[2] + placements[3];
  return { boards: n, total, avg: n ? sum / n : 0, top4: n ? top4 / n : 0, win: n ? placements[0] / n : 0, placements };
}

class Acc {
  n: Float64Array;
  sum: Float64Array;
  t4: Float64Array;
  w: Float64Array;
  extra: Float64Array;
  stamp: Int32Array;
  constructor(size: number) {
    this.n = new Float64Array(size);
    this.sum = new Float64Array(size);
    this.t4 = new Float64Array(size);
    this.w = new Float64Array(size);
    this.extra = new Float64Array(size);
    this.stamp = new Int32Array(size).fill(-1);
  }
  /** Counts an entity once per board. */
  hit(i: number, b: number, place: number) {
    if (this.stamp[i] === b) return false;
    this.stamp[i] = b;
    this.n[i]++;
    this.sum[i] += place;
    if (place <= 4) this.t4[i]++;
    if (place === 1) this.w[i]++;
    return true;
  }
  /** Rows for every entity seen; `more` adds fields from the entity's index (copies, tier). */
  rows(ids: (i: number) => string, boards: number, baseline: number, more?: (i: number, n: number) => object): StatRow[] {
    const out: StatRow[] = [];
    for (let i = 0; i < this.n.length; i++) {
      const n = this.n[i];
      if (!n) continue;
      const avg = this.sum[i] / n;
      const row = { id: ids(i), n, freq: boards ? n / boards : 0, avg, delta: avg - baseline, top4: this.t4[i] / n, win: this.w[i] / n };
      out.push(more ? Object.assign(row, more(i, n)) : row);
    }
    return out;
  }
}

const TIER_SLOTS = 16;

export function aggregate(ds: Dataset, boards: Int32Array, baselineAvg: number) {
  const units = new Acc(ds.champKeys.length);
  const items = new Acc(ds.itemKeys.length);
  const traits = new Acc(ds.traitKeys.length * TIER_SLOTS);
  const augs = new Acc(ds.augKeys.length);
  const levels = new Acc(TIER_SLOTS);
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      units.hit(ds.uChamp[u], b, p);
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) {
        const it = ds.iItem[i];
        items.extra[it]++;
        items.hit(it, b, p);
      }
    }
    for (let t = ds.tStart[b]; t < ds.tStart[b + 1]; t++) {
      traits.hit(ds.tTrait[t] * TIER_SLOTS + Math.min(TIER_SLOTS - 1, ds.tTier[t]), b, p);
    }
    for (let a = ds.aStart[b]; a < ds.aStart[b + 1]; a++) augs.hit(ds.aAug[a], b, p);
    levels.hit(Math.min(TIER_SLOTS - 1, ds.level[b]), b, p);
  }
  const n = boards.length;
  return {
    units: units.rows((i) => ds.champKeys[i], n, baselineAvg),
    items: items.rows((i) => ds.itemKeys[i], n, baselineAvg, (i, k) => ({ copies: items.extra[i] / k })),
    traits: traits.rows((i) => `${ds.traitKeys[Math.floor(i / TIER_SLOTS)]}:${i % TIER_SLOTS}`, n, baselineAvg, (i) => ({ tier: i % TIER_SLOTS })),
    augments: augs.rows((i) => ds.augKeys[i], n, baselineAvg),
    levels: levels.rows((i) => String(i), n, baselineAvg),
  };
}

/** The champion rows of aggregate() alone (all the trend lines compare). */
export function unitRows(ds: Dataset, boards: Int32Array, baselineAvg: number): StatRow[] {
  const units = new Acc(ds.champKeys.length);
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) units.hit(ds.uChamp[u], b, p);
  }
  return units.rows((i) => ds.champKeys[i], boards.length, baselineAvg);
}

/** Every champion at every star level it finished at, as rows keyed "champion:star". */
export function unitForms(ds: Dataset, boards: Int32Array, baselineAvg: number): StatRow[] {
  const forms = new Acc(ds.champKeys.length * 4);
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) forms.hit(ds.uChamp[u] * 4 + Math.min(3, ds.uStar[u]), b, p);
  }
  return forms.rows((i) => `${ds.champKeys[Math.floor(i / 4)]}:${i % 4}`, boards.length, baselineAvg);
}

const buildMemo = new WeakMap<Dataset, Uint8Array>();

/** 1 for items that belong to a build (completed, emblems, artifacts, radiant, support), else 0. */
function buildItems(ds: Dataset): Uint8Array {
  let out = buildMemo.get(ds);
  if (!out) {
    const index = indexStatic(ds.static);
    const skip = new Set(['component', 'consumable', 'special']);
    out = Uint8Array.from(ds.itemKeys, (key) => {
      const item = index.item(key);
      return item && !skip.has(item.category) ? 1 : 0;
    });
    buildMemo.set(ds, out);
  }
  return out;
}

const STAR_SLOTS = 5; // star levels are 1-4 (see columns.ts)

/** Comps (clusters) within a set of boards, with their typical units, items and traits. */
export function aggregateComps(ds: Dataset, boards: Int32Array, opts: { minN: number; limit: number; only?: number[] }): CompRow[] {
  const K = ds.clusters.length;
  const n = new Float64Array(K);
  const sum = new Float64Array(K);
  const t4 = new Float64Array(K);
  const w = new Float64Array(K);
  const lvl = new Float64Array(K);
  const size = new Float64Array(K);
  const held = new Float64Array(K);
  const hist = new Float64Array(K * 8);
  const isBuild = buildItems(ds);
  for (let i = 0; i < boards.length; i++) {
    const b = boards[i];
    const c = ds.comp[b];
    if (c < 0) continue;
    const p = ds.place[b];
    n[c]++;
    sum[c] += p;
    lvl[c] += ds.level[b];
    size[c] += ds.uStart[b + 1] - ds.uStart[b];
    for (let x = ds.iStart[ds.uStart[b]]; x < ds.iStart[ds.uStart[b + 1]]; x++) held[c] += isBuild[ds.iItem[x]];
    hist[c * 8 + p - 1]++;
    if (p <= 4) t4[c]++;
    if (p === 1) w[c]++;
  }
  let chosen: number[];
  if (opts.only) chosen = opts.only.filter((c) => n[c] > 0);
  else {
    chosen = [];
    for (let c = 0; c < K; c++) if (n[c] >= opts.minN) chosen.push(c);
    chosen.sort((a, b) => n[b] - n[a]);
    chosen = chosen.slice(0, opts.limit);
  }
  if (!chosen.length) return [];

  // Runs on every explorer and meta request: flat arrays per (comp, champion) and (comp, trait) slot, not nested Maps.
  const local = new Int32Array(K).fill(-1);
  chosen.forEach((c, j) => (local[c] = j));
  const C = ds.champKeys.length;
  const T = ds.traitKeys.length;
  const I = ds.itemKeys.length;
  const unitCount = new Float64Array(chosen.length * C);
  const stamp = new Int32Array(chosen.length * C).fill(-1);
  const unitItems = new Float64Array(chosen.length * C);
  // Copies per star level (1-4) of each slot, and when each level was first seen (ties go to the first).
  const starN = new Float64Array(chosen.length * C * STAR_SLOTS);
  const starFirst = new Int32Array(chosen.length * C * STAR_SLOTS);
  let seen = 0;
  // Per slot: copies of each build item [0, I) and when each was first seen [I, 2I) (ties go to the first).
  const itemsOn = new Array<Int32Array | undefined>(chosen.length * C);
  const traitBoards = new Float64Array(chosen.length * T);
  // The traits the comp's Avatar (Lux) played as, board by board.
  const avatarVotes = new Float64Array(chosen.length * T);
  for (let i = 0; i < boards.length; i++) {
    const b = boards[i];
    const c = ds.comp[b];
    const j = c < 0 ? -1 : local[c];
    if (j < 0) continue;
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      const slot = j * C + ds.uChamp[u];
      if (stamp[slot] !== b) {
        stamp[slot] = b;
        unitCount[slot]++;
      }
      const st = slot * STAR_SLOTS + Math.min(STAR_SLOTS - 1, ds.uStar[u]);
      if (starN[st]++ === 0) starFirst[st] = ++seen;
      for (let x = ds.iStart[u]; x < ds.iStart[u + 1]; x++) {
        const it = ds.iItem[x];
        // Leftover components, consumables and loot are not part of anyone's build.
        if (!isBuild[it]) continue;
        unitItems[slot]++;
        const m = (itemsOn[slot] ??= new Int32Array(2 * I));
        if (m[it]++ === 0) m[I + it] = ++seen;
      }
    }
    for (let t = ds.tStart[b]; t < ds.tStart[b + 1]; t++) traitBoards[j * T + ds.tTrait[t]]++;
    if (ds.avatarTrait[b] >= 0) avatarVotes[j * T + ds.avatarTrait[b]]++;
  }
  /** The star level a slot is most often played at. */
  const usualStar = (slot: number) => {
    let best = -1;
    for (let k = slot * STAR_SLOTS, end = k + STAR_SLOTS; k < end; k++) {
      if (starN[k] && (best < 0 || starN[k] > starN[best] || (starN[k] === starN[best] && starFirst[k] < starFirst[best]))) best = k;
    }
    return best < 0 ? -1 : best - slot * STAR_SLOTS;
  };

  const total = boards.length;
  const index = indexStatic(ds.static);
  const exclusive = index.traitByName(SET_RULES.exclusiveTrait)?.key;
  return chosen.map((c, j) => {
    const cl = ds.clusters[c];
    const cnt = n[c];
    const units: Array<CompUnit & { slot: number }> = [];
    for (let ch = 0; ch < C; ch++) {
      const slot = j * C + ch;
      const f = unitCount[slot] / cnt;
      if (f < 0.12 && ch !== cl.carry) continue;
      units.push({ id: ds.champKeys[ch], freq: f, star: usualStar(slot), items: [], slot });
    }
    units.sort((a, b) => b.freq - a.freq || ds.champCost[ds.champIdx.get(b.id)!] - ds.champCost[ds.champIdx.get(a.id)!]);
    // The typical board: as many units as these boards usually field (8 at level 8), most played first.
    // Only one unit of an exclusive trait (one Avatar per board) makes it onto the same board.
    const boardSize = Math.max(6, Math.min(10, Math.round(size[c] / cnt)));
    const board: typeof units = [];
    let exclusiveTaken = false;
    for (const u of units) {
      if (board.length >= boardSize) break;
      if (exclusive && (index.champion(u.id)?.traits ?? []).some((t) => t.toLowerCase() === exclusive)) {
        if (exclusiveTaken) continue;
        exclusiveTaken = true;
        // She plays as the trait she took most often on these boards; it counts twice below.
        let best = -1;
        for (let t = 0; t < T; t++) if (avatarVotes[j * T + t] > (best < 0 ? 0 : avatarVotes[j * T + best])) best = t;
        if (best >= 0) u.trait = ds.traitKeys[best];
      }
      board.push(u);
    }
    // Items: the usual item count of these boards, handed out to the most consistent holders first (each as many as
    // it usually carries), so the board reads like one players field instead of every unit wearing occasional items.
    let budget = Math.round(held[c] / cnt);
    const carryKey = cl.carry >= 0 ? ds.champKeys[cl.carry] : null;
    // The carry is always on the board and gets its items first.
    if (carryKey && !board.some((u) => u.id === carryKey)) {
      const u = units.find((x) => x.id === carryKey);
      if (u) board[Math.max(0, board.length - 1)] = u;
    }
    const holders = [...board].sort((a, b) => Number(b.id === carryKey) - Number(a.id === carryKey) || unitItems[b.slot] - unitItems[a.slot]);
    for (const u of holders) {
      if (budget <= 0) break;
      const perGame = unitItems[u.slot] / Math.max(1, unitCount[u.slot]);
      const take = Math.min(3, budget, Math.round(perGame));
      if (take <= 0) continue;
      const m = itemsOn[u.slot];
      if (!m) continue;
      const usual: number[] = [];
      for (let it = 0; it < I; it++) if (m[it] && m[it] / unitCount[u.slot] >= 0.1) usual.push(it);
      u.items = usual
        .sort((a, b) => m[b] - m[a] || m[I + a] - m[I + b])
        .slice(0, take)
        .map((it) => ds.itemKeys[it]);
      budget -= u.items.length;
    }
    const typical: CompUnit[] = board
      .sort((a, b) => ds.champCost[ds.champIdx.get(a.id)!] - ds.champCost[ds.champIdx.get(b.id)!] || b.freq - a.freq)
      .map(({ slot: _slot, ...u }) => u);
    // Traits are counted from the board shown (units, emblems, set rules), so the summary adds up to what you see.
    const seenShare = new Map<string, number>();
    for (let t = 0; t < T; t++) if (traitBoards[j * T + t]) seenShare.set(ds.traitKeys[t], traitBoards[j * T + t] / cnt);
    const placed = autoPlace(typical.map((u) => ({ key: u.id, star: u.star, items: u.items, trait: u.trait })), index);
    const traitList: CompRow['traits'] = computeTraits(placed, index)
      .filter((t) => t.tier > 0 && t.trait.kind !== 'unique')
      .sort((a, b) => b.count - a.count || b.tier - a.tier || a.trait.name.localeCompare(b.trait.name))
      .map((t) => ({ id: t.trait.key, tier: t.tier, count: t.count, freq: seenShare.get(t.trait.key) ?? 0 }));
    const placements = Array.from(hist.subarray(c * 8, c * 8 + 8));
    return {
      id: cl.id,
      name: cl.name,
      trait: cl.trait >= 0 ? ds.traitKeys[cl.trait] : null,
      carry: cl.carry >= 0 ? ds.champKeys[cl.carry] : null,
      n: cnt,
      freq: total ? cnt / total : 0,
      avg: sum[c] / cnt,
      top4: t4[c] / cnt,
      win: w[c] / cnt,
      level: lvl[c] / cnt,
      placements,
      units: typical,
      traits: traitList.slice(0, 8),
    } satisfies CompRow;
  });
}

export function clusterIndex(ds: Dataset, id: string): number {
  return ds.clusters.findIndex((c) => c.id === id);
}

type BuildRow = { items: string[]; n: number; avg: number; top4: number; win: number };

/** Items one champion holds on the given boards, once per board, against those boards' average ("what should Aphelios hold"). */
export function heldItems(ds: Dataset, boards: Int32Array, champKey: string, baselineAvg: number): StatRow[] {
  const c = ds.champIdx.get(champKey);
  if (c === undefined) return [];
  const acc = new Acc(ds.itemKeys.length);
  const copies = new Float64Array(ds.itemKeys.length);
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      if (ds.uChamp[u] !== c) continue;
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) {
        acc.hit(ds.iItem[i], b, p);
        copies[ds.iItem[i]]++;
      }
    }
  }
  return acc.rows((i) => ds.itemKeys[i], boards.length, baselineAvg, (i, n) => ({ copies: copies[i] / n }));
}

/** Champions holding one item on the given boards, once per board, against those boards' average ("who holds Infinity Edge"). */
export function itemHolders(ds: Dataset, boards: Int32Array, itemKey: string, baselineAvg: number): StatRow[] {
  const it = ds.itemIdx.get(itemKey);
  if (it === undefined) return [];
  const acc = new Acc(ds.champKeys.length);
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) {
        if (ds.iItem[i] !== it) continue;
        acc.hit(ds.uChamp[u], b, ds.place[b]);
        break;
      }
    }
  }
  return acc.rows((i) => ds.champKeys[i], boards.length, baselineAvg);
}

/** Deep dive for one champion: star levels, item counts, best items and full builds. */
export function unitInsight(ds: Dataset, boards: Int32Array, champKey: string) {
  const c = ds.champIdx.get(champKey);
  const empty = { stars: [] as StatRow[], itemCounts: [] as StatRow[], items: [] as StatRow[], builds: [] as BuildRow[], summary: summarize(ds, new Int32Array(0), boards.length) };
  if (c === undefined) return empty;
  const withUnit: number[] = [];
  const starAcc = new Acc(5);
  const countAcc = new Acc(4);
  const itemAcc = new Acc(ds.itemKeys.length);
  const builds = new Map<string, { n: number; sum: number; t4: number; w: number }>();
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    let found = false;
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      if (ds.uChamp[u] !== c) continue;
      if (!found) withUnit.push(b);
      found = true;
      starAcc.hit(Math.min(4, ds.uStar[u]), b, p);
      const i0 = ds.iStart[u];
      const i1 = ds.iStart[u + 1];
      countAcc.hit(Math.min(3, i1 - i0), b, p);
      const list: number[] = [];
      for (let i = i0; i < i1; i++) {
        itemAcc.hit(ds.iItem[i], b, p);
        list.push(ds.iItem[i]);
      }
      if (list.length === 3) {
        const key = list.sort((x, y) => x - y).join(',');
        const e = builds.get(key) ?? { n: 0, sum: 0, t4: 0, w: 0 };
        e.n++;
        e.sum += p;
        if (p <= 4) e.t4++;
        if (p === 1) e.w++;
        builds.set(key, e);
      }
    }
  }
  const summary = summarize(ds, Int32Array.from(withUnit), boards.length);
  const base = summary.avg;
  const n = withUnit.length;
  return {
    summary,
    stars: starAcc.rows((i) => String(i), n, base),
    itemCounts: countAcc.rows((i) => String(i), n, base),
    items: itemAcc.rows((i) => ds.itemKeys[i], n, base),
    builds: [...builds.entries()]
      .map(([key, e]) => ({ items: key.split(',').map((i) => ds.itemKeys[Number(i)]), n: e.n, avg: e.sum / e.n, top4: e.t4 / e.n, win: e.w / e.n }))
      .filter((r) => r.n >= 3)
      .sort((a, b) => b.n - a.n)
      .slice(0, 24),
  };
}

/** Deep dive for one item: who holds it and what it is paired with. */
export function itemInsight(ds: Dataset, boards: Int32Array, itemKey: string) {
  const it = ds.itemIdx.get(itemKey);
  const holders = new Acc(ds.champKeys.length);
  const partners = new Acc(ds.itemKeys.length);
  const withItem: number[] = [];
  if (it === undefined) return { summary: summarize(ds, new Int32Array(0), boards.length), holders: [], partners: [] };
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    let found = false;
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      const i0 = ds.iStart[u];
      const i1 = ds.iStart[u + 1];
      let has = false;
      for (let i = i0; i < i1; i++) if (ds.iItem[i] === it) has = true;
      if (!has) continue;
      if (!found) withItem.push(b);
      found = true;
      holders.hit(ds.uChamp[u], b, p);
      let skipped = false;
      for (let i = i0; i < i1; i++) {
        if (ds.iItem[i] === it && !skipped) {
          skipped = true;
          continue;
        }
        partners.hit(ds.iItem[i], b, p);
      }
    }
  }
  const summary = summarize(ds, Int32Array.from(withItem), boards.length);
  return {
    summary,
    holders: holders.rows((i) => ds.champKeys[i], withItem.length, summary.avg),
    partners: partners.rows((i) => ds.itemKeys[i], withItem.length, summary.avg),
  };
}

/** Deep dive for one trait: performance per breakpoint and the champions fielded with it. */
export function traitInsight(ds: Dataset, boards: Int32Array, traitKey: string) {
  const t = ds.traitIdx.get(traitKey);
  const tiers = new Acc(TIER_SLOTS);
  const units = new Acc(ds.champKeys.length);
  const withTrait: number[] = [];
  if (t === undefined) return { summary: summarize(ds, new Int32Array(0), boards.length), tiers: [], units: [] };
  for (let k = 0; k < boards.length; k++) {
    const b = boards[k];
    const p = ds.place[b];
    let tier = 0;
    for (let x = ds.tStart[b]; x < ds.tStart[b + 1]; x++) if (ds.tTrait[x] === t) tier = ds.tTier[x];
    if (!tier) continue;
    withTrait.push(b);
    tiers.hit(Math.min(TIER_SLOTS - 1, tier), b, p);
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) units.hit(ds.uChamp[u], b, p);
  }
  const summary = summarize(ds, Int32Array.from(withTrait), boards.length);
  return {
    summary,
    tiers: tiers.rows((i) => String(i), withTrait.length, summary.avg),
    units: units.rows((i) => ds.champKeys[i], withTrait.length, summary.avg),
  };
}
