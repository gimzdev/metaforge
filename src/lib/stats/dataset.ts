import { configuredSetNumber, currentPatch, patchWindows, type ResolvedPatch } from '@/config/game';
import { singleton } from '@/lib/cache';
import { getStaticData } from '@/lib/static/load';
import { indexStatic, type StaticIndex } from '@/lib/static';
import type { StaticData } from '@/lib/static/types';
import { getStore } from '@/lib/store';
import { emptyColumns, loadColumns, type Columns } from './columns';
import type { DatasetMeta } from './types';

/**
 * The stored boards interned against the game data in typed arrays, which the
 * engine scans. Built from the compact columns (see columns.ts): only matches the
 * store hasn't delivered yet are read when something changes.
 */
export interface Cluster {
  id: string;
  trait: number;
  carry: number;
  name: string;
}

export interface Dataset {
  version: number;
  static: StaticData;
  champKeys: string[];
  itemKeys: string[];
  traitKeys: string[];
  augKeys: string[];
  champIdx: Map<string, number>;
  itemIdx: Map<string, number>;
  traitIdx: Map<string, number>;
  augIdx: Map<string, number>;
  champCost: Uint8Array;
  traitUnique: Uint8Array;
  regions: string[];
  patches: ResolvedPatch[];
  N: number;
  place: Uint8Array;
  level: Uint8Array;
  region: Uint8Array;
  patch: Uint8Array;
  uStart: Uint32Array;
  uChamp: Uint16Array;
  uStar: Uint8Array;
  iStart: Uint32Array;
  iItem: Uint16Array;
  tStart: Uint32Array;
  tTrait: Uint16Array;
  tTier: Uint8Array;
  tUnits: Uint8Array;
  tStyle: Uint8Array;
  aStart: Uint32Array;
  aAug: Uint16Array;
  comp: Int32Array;
  clusters: Cluster[];
  meta: DatasetMeta;
}

export const NO_PATCH = 255;
/** How often to ask the store whether new matches arrived. */
const CHECK_MS = 60_000;

const gen = () => singleton('dataset-gen', () => ({ n: 1 }));

interface Holder {
  ds: Dataset | null;
  columns: Columns | null;
  /** The match list of the columns `ds` was built from. */
  builtFrom: string[] | null;
  token: string;
  gen: number;
  windows: string;
  checkedAt: number;
  refreshing: Promise<Dataset> | null;
}
const holder = () =>
  singleton<Holder>('dataset-holder', () => ({ ds: null, columns: null, builtFrom: null, token: '', gen: 0, windows: '', checkedAt: 0, refreshing: null }));

/** Force a rebuild on the next request (after a collection run stores matches). */
function invalidateDataset() {
  gen().n++;
}

/**
 * The current dataset. Serves the loaded copy immediately and refreshes it in the
 * background when the store reports new matches or a new patch starts.
 */
export function getDataset(): Promise<Dataset> {
  const h = holder();
  if (h.ds && h.gen === gen().n && Date.now() - h.checkedAt < CHECK_MS) return Promise.resolve(h.ds);
  h.refreshing ??= refresh(h)
    .catch((error) => {
      console.error('[metaforge] dataset refresh failed:', error instanceof Error ? error.message : error);
      if (h.ds) {
        h.checkedAt = Date.now();
        return h.ds;
      }
      throw error;
    })
    .finally(() => {
      h.refreshing = null;
    });
  return h.ds ? Promise.resolve(h.ds) : h.refreshing;
}

async function refresh(h: Holder): Promise<Dataset> {
  const g = gen().n;
  const data = await getStaticData();
  const setNumber = data.set.number;
  const store = getStore();
  const token = await store.changeToken(setNumber).catch(() => `unknown:${Date.now()}`);
  const windows = patchWindows(setNumber)
    .map((p) => p.label)
    .join();
  if (h.ds && h.ds.static === data && h.gen === g && token === h.token && windows === h.windows) {
    h.checkedAt = Date.now();
    return h.ds;
  }
  let error: string | null = null;
  let columns = h.columns;
  if (!columns || token !== h.token || h.gen !== g) {
    try {
      columns = await loadColumns(h.columns, setNumber);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error('[metaforge] could not load boards:', error);
    }
  }
  // The same boards (nothing new in range) and the same game data: keep the built dataset.
  const same = h.ds && !h.ds.meta.error && !error && h.ds.static === data && windows === h.windows && columns?.matches === h.builtFrom;
  const ds = same ? h.ds! : buildDataset(columns ?? emptyColumns(), data, { version: g, source: store.describe(), error });
  // After a failed read, keep no token so the next check (a minute later) reads again.
  Object.assign(h, { ds, columns, builtFrom: columns?.matches ?? null, token: error ? '' : token, gen: g, windows, checkedAt: Date.now() });
  return ds;
}

/** After a collection run: bring the columns up to date and save them for other servers. */
export async function refreshStoredBoards() {
  const h = holder();
  h.columns = await loadColumns(h.columns, configuredSetNumber(), { persist: true });
  invalidateDataset();
}

/** Intern the columns against the game data and group the boards into comps. */
function buildDataset(c: Columns, data: StaticData, opts: { version: number; source: string; error: string | null }): Dataset {
  const index = indexStatic(data);
  const keys = <T extends { key: string }>(list: T[]) => list.map((e) => e.key);
  const toIdx = (list: string[]) => new Map(list.map((k, i) => [k, i]));
  const champKeys = keys(data.champions);
  const itemKeys = keys(data.items);
  const traitKeys = keys(data.traits);
  const augKeys = keys(data.augments);
  const champIdx = toIdx(champKeys);
  const itemIdx = toIdx(itemKeys);
  const traitIdx = toIdx(traitKeys);
  const augIdx = toIdx(augKeys);
  const uMap = Int32Array.from(c.units, (k) => champIdx.get(k) ?? -1);
  const iMap = Int32Array.from(c.items, (k) => itemIdx.get(index.itemKey(k)) ?? -1);
  const tMap = Int32Array.from(c.traits, (k) => traitIdx.get(k) ?? -1);
  const aMap = Int32Array.from(c.augs, (k) => augIdx.get(k) ?? -1);
  const patches = patchWindows(data.set.number);
  const patchOf = (ms: number) => {
    for (let i = patches.length - 1; i >= 0; i--) if (ms >= patches[i].start) return i;
    return NO_PATCH;
  };

  const regions: string[] = [];
  const regionIdx = new Map<string, number>();
  const place: number[] = [], level: number[] = [], region: number[] = [], patch: number[] = [];
  const uStart = [0], uChamp: number[] = [], uStar: number[] = [];
  const iStart = [0], iItem: number[] = [];
  const tStart = [0], tTrait: number[] = [], tTier: number[] = [], tUnits: number[] = [], tStyle: number[] = [];
  const aStart = [0], aAug: number[] = [];
  let newest = 0;
  let oldest = Number.POSITIVE_INFINITY;
  let b = 0, u = 0, i = 0, t = 0, a = 0;
  for (let m = 0; m < c.matches.length; m++) {
    const time = c.mTime[m];
    const p = patchOf(time);
    for (let end = b + c.mBoards[m]; b < end; b++) {
      const units = c.uCount[b];
      const mark = uChamp.length;
      for (let ue = u + units; u < ue; u++) {
        const items = c.iCount[u];
        const champ = uMap[c.uId[u]];
        if (champ >= 0) {
          // Summons, props and retired units are left out.
          uChamp.push(champ);
          uStar.push(c.uStar[u]);
          for (let ie = i + items; i < ie; i++) if (iMap[c.iId[i]] >= 0) iItem.push(iMap[c.iId[i]]);
          iStart.push(iItem.length);
        } else i += items;
      }
      const traits = c.tCount[b];
      const augs = c.aCount[b];
      if (uChamp.length === mark) {
        t += traits;
        a += augs;
        continue; // nothing usable on this board
      }
      uStart.push(uChamp.length);
      for (let te = t + traits; t < te; t++) {
        const ti = tMap[c.tId[t]];
        if (ti < 0) continue;
        tTrait.push(ti);
        tUnits.push(c.tUnits[t]);
        tStyle.push(c.tStyle[t]);
        tTier.push(c.tTier[t]);
      }
      tStart.push(tTrait.length);
      for (let ae = a + augs; a < ae; a++) if (aMap[c.aId[a]] >= 0) aAug.push(aMap[c.aId[a]]);
      aStart.push(aAug.length);
      const name = c.regions[c.mRegion[m]];
      let r = regionIdx.get(name);
      if (r === undefined) {
        regionIdx.set(name, (r = regions.length));
        regions.push(name);
      }
      place.push(c.place[b]);
      level.push(c.level[b]);
      region.push(r);
      patch.push(p);
      if (time > newest) newest = time;
      if (time < oldest) oldest = time;
    }
  }

  const N = place.length;
  const champCost = Uint8Array.from(champKeys, (k) => index.champion(k)?.cost ?? 0);
  const traitUnique = Uint8Array.from(traitKeys, (k) => (index.trait(k)?.kind === 'unique' ? 1 : 0));
  const ds: Dataset = {
    version: opts.version,
    static: data,
    champKeys,
    itemKeys,
    traitKeys,
    augKeys,
    champIdx,
    itemIdx,
    traitIdx,
    augIdx,
    champCost,
    traitUnique,
    regions,
    patches,
    N,
    place: Uint8Array.from(place),
    level: Uint8Array.from(level),
    region: Uint8Array.from(region),
    patch: Uint8Array.from(patch),
    uStart: Uint32Array.from(uStart),
    uChamp: Uint16Array.from(uChamp),
    uStar: Uint8Array.from(uStar),
    iStart: Uint32Array.from(iStart),
    iItem: Uint16Array.from(iItem),
    tStart: Uint32Array.from(tStart),
    tTrait: Uint16Array.from(tTrait),
    tTier: Uint8Array.from(tTier),
    tUnits: Uint8Array.from(tUnits),
    tStyle: Uint8Array.from(tStyle),
    aStart: Uint32Array.from(aStart),
    aAug: Uint16Array.from(aAug),
    comp: new Int32Array(N).fill(-1),
    clusters: [],
    meta: {
      source: opts.source,
      error: opts.error,
      total: N,
      builtAt: Date.now(),
      hasAugments: aAug.length > 0,
      newest: N ? newest : null,
      oldest: N ? oldest : null,
      patches: [],
      regions: [],
      currentPatch: currentPatch(data.set.number)?.label ?? null,
    },
  };

  assignClusters(ds);

  const patchCounts = new Array(patches.length).fill(0);
  const regionCounts = new Array(regions.length).fill(0);
  for (let k = 0; k < N; k++) {
    if (ds.patch[k] !== NO_PATCH) patchCounts[ds.patch[k]]++;
    regionCounts[ds.region[k]]++;
  }
  ds.meta.patches = patches.map((p, k) => ({ label: p.label, boards: patchCounts[k], tentative: p.tentative }));
  ds.meta.regions = regions.map((id, k) => ({ id, boards: regionCounts[k] })).sort((x, y) => y.boards - x.boards);
  return ds;
}

/** Damage value of a real carry build: roughly two completed damage items. */
const DUO_DAMAGE = 3;

/** How much of an item's value is damage: completed items inherit it from their two components. */
const COMPONENT_OFFENSE: Record<string, number> = {
  tft_item_bfsword: 1,
  tft_item_recurvebow: 1,
  tft_item_needlesslylargerod: 1,
  tft_item_sparringgloves: 0.8,
  tft_item_tearofthegoddess: 0.6,
  tft_item_spatula: 0.3,
  tft_item_fryingpan: 0.3,
  tft_item_chainvest: 0,
  tft_item_negatroncloak: 0,
  tft_item_giantsbelt: 0,
};

function itemOffense(ds: Dataset, index: StaticIndex<StaticData>) {
  const byName = new Map(ds.static.items.map((i) => [i.name.toLowerCase(), i]));
  const weight = (key: string, depth = 0): number => {
    const item = index.item(key);
    if (!item) return 0.5;
    if (item.category === 'component') return COMPONENT_OFFENSE[item.key] ?? 0.5;
    if (item.category === 'emblem') return 0.2;
    if (item.category === 'support') return 0;
    if (item.category === 'artifact') return 1.2;
    if (item.category === 'radiant' && depth === 0) {
      const base = byName.get(item.name.toLowerCase().replace(/^radiant\s+/, ''));
      return base ? weight(base.key, 1) : 1;
    }
    if (item.composition.length === 2) return item.composition.reduce((sum, c) => sum + weight(c, depth + 1), 0);
    return 0.5;
  };
  return Float32Array.from(ds.itemKeys, (k) => weight(k));
}

/**
 * Group boards into comps the way players name them.
 *
 * 1. Every board gets a carry: the unit whose items do the most damage (a tank
 *    in three armor items is not the carry). A second unit only makes it a duo
 *    ("Aphelios & Nidalee") when it holds a damage build of its own and shares a
 *    trait with the carry, so a legendary that picked up a stray item late in
 *    the game doesn't turn into a co-carry.
 * 2. Groups that field nearly the same eight units (same comp, items landed on
 *    a different unit that game) are merged into the bigger group.
 * 3. Names come from the whole merged group: its usual carry and trait
 *    ("Inferno Kha'Zix"), or both carries when most of its boards run the duo.
 */
function assignClusters(ds: Dataset) {
  const index = indexStatic(ds.static);
  const offense = itemOffense(ds, index);
  const C = ds.champKeys.length;
  const champTraits = ds.champKeys.map((k) =>
    (index.champion(k)?.traits ?? []).map((t) => ds.traitIdx.get(t.toLowerCase()) ?? -1).filter((t) => t >= 0),
  );

  // Pass 1: carry (and second carry) per board.
  interface Sig {
    a: number;
    b: number;
    n: number;
    units: Float64Array;
    primary: Float64Array;
    traits: Map<number, number>;
    size: number;
  }
  const sigs: Sig[] = [];
  const sigByKey = new Map<string, number>();
  const boardSig = new Int32Array(ds.N).fill(-1);
  for (let b = 0; b < ds.N; b++) {
    let first = -1;
    let firstScore = -1;
    let firstDamage = 0;
    let second = -1;
    let secondScore = -1;
    let secondDamage = 0;
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      let damage = 0;
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) damage += offense[ds.iItem[i]];
      const c = ds.uChamp[u];
      // Damage decides; then more items, a higher star level (a 3-star reroll carry), then cost.
      const score = damage * 100 + (ds.iStart[u + 1] - ds.iStart[u]) * 20 + ds.uStar[u] * 8 + ds.champCost[c] * 2;
      if (score > firstScore) {
        if (first >= 0 && first !== c) [second, secondScore, secondDamage] = [first, firstScore, firstDamage];
        [first, firstScore, firstDamage] = [c, score, damage];
      } else if (c !== first && score > secondScore) {
        [second, secondScore, secondDamage] = [c, score, damage];
      }
    }
    if (first < 0) continue;
    // A duo needs two real damage builds (about two damage items each) on units that play together.
    const pair =
      second >= 0 &&
      firstDamage >= DUO_DAMAGE &&
      secondDamage >= DUO_DAMAGE &&
      secondDamage >= firstDamage * 0.6 &&
      champTraits[first].some((t) => !ds.traitUnique[t] && champTraits[second].includes(t));
    // The comp's trait: the carry's strongest trait, unless the board runs a clearly bigger one.
    let trait = -1;
    let traitScore = -1;
    let boardTrait = -1;
    let boardScore = -1;
    const own = champTraits[first];
    for (let t = ds.tStart[b]; t < ds.tStart[b + 1]; t++) {
      const ti = ds.tTrait[t];
      if (ds.traitUnique[ti]) continue;
      const score = ds.tStyle[t] * 100 + ds.tUnits[t];
      if (score > boardScore) [boardTrait, boardScore] = [ti, score];
      if (own.includes(ti) && score > traitScore) [trait, traitScore] = [ti, score];
    }
    if (boardTrait >= 0 && (trait < 0 || Math.floor(boardScore / 100) > Math.floor(traitScore / 100))) trait = boardTrait;
    const a = pair ? Math.min(first, second) : first;
    const bb = pair ? Math.max(first, second) : -1;
    const key = pair ? `${a}|${bb}` : `${a}|-|${trait}`;
    let s = sigByKey.get(key);
    if (s === undefined) {
      s = sigs.length;
      sigs.push({ a, b: bb, n: 0, units: new Float64Array(C), primary: new Float64Array(2), traits: new Map(), size: 0 });
      sigByKey.set(key, s);
    }
    const sig = sigs[s];
    sig.n++;
    sig.size += ds.uStart[b + 1] - ds.uStart[b];
    if (pair) sig.primary[first === a ? 0 : 1]++;
    if (trait >= 0) sig.traits.set(trait, (sig.traits.get(trait) ?? 0) + 1);
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) sig.units[ds.uChamp[u]] = (sig.units[ds.uChamp[u]] ?? 0) + 1;
    boardSig[b] = s;
  }

  // Pass 2: merge groups that play the same board into the bigger one.
  const core = (sig: Sig) => {
    const size = Math.max(7, Math.min(10, Math.round(sig.size / Math.max(1, sig.n))));
    return [...sig.units.keys()]
      .filter((c) => sig.units[c] / sig.n >= 0.4)
      .sort((x, y) => sig.units[y] - sig.units[x])
      .slice(0, size);
  };
  const order = sigs.map((_, i) => i).sort((x, y) => sigs[y].n - sigs[x].n);
  const cores = sigs.map((sig) => new Set(core(sig)));
  const parent = sigs.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const targets: number[] = [];
  for (const s of order) {
    const mine = cores[s];
    let best = -1;
    let bestOverlap = 0;
    if (mine.size >= 4) {
      for (const t of targets) {
        const theirs = cores[t];
        let overlap = 0;
        for (const c of mine) if (theirs.has(c)) overlap++;
        const needed = Math.ceil(Math.max(mine.size, theirs.size) * 0.75);
        const sharesCarry = theirs.has(sigs[s].a) || (sigs[s].b >= 0 && theirs.has(sigs[s].b));
        if (overlap >= needed && sharesCarry && overlap > bestOverlap) [best, bestOverlap] = [t, overlap];
      }
    }
    if (best >= 0) parent[s] = root(best);
    else if (sigs[s].n >= 3) targets.push(s);
  }

  // What each surviving group plays: which carry leads it, how often it runs a duo, which trait.
  interface Group {
    n: number;
    lead: Map<number, number>;
    pairs: Map<string, number>;
    traits: Map<number, number>;
  }
  const bump = <K,>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const top = <K,>(m: Map<K, number>): [K, number] | null => {
    let best: [K, number] | null = null;
    for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
    return best;
  };
  const groups = new Map<number, Group>();
  for (let s = 0; s < sigs.length; s++) {
    const r = root(s);
    const sig = sigs[s];
    let g = groups.get(r);
    if (!g) groups.set(r, (g = { n: 0, lead: new Map(), pairs: new Map(), traits: new Map() }));
    g.n += sig.n;
    if (sig.b >= 0) {
      bump(g.lead, sig.a, sig.primary[0]);
      bump(g.lead, sig.b, sig.primary[1]);
      bump(g.pairs, `${sig.a}|${sig.b}`, sig.n);
    } else bump(g.lead, sig.a, sig.n);
    for (const [t, n] of sig.traits) bump(g.traits, t, n);
  }

  // Name the surviving groups and point every board at its group.
  const clusterOf = new Map<number, number>();
  const usedIds = new Set<string>();
  for (let b = 0; b < ds.N; b++) {
    if (boardSig[b] < 0) continue;
    const r = root(boardSig[b]);
    let k = clusterOf.get(r);
    if (k === undefined) {
      const g = groups.get(r)!;
      k = ds.clusters.length;
      const champ = (c: number) => index.champion(ds.champKeys[c]);
      const who = (c: number) => champ(c)?.baseName || champ(c)?.name || 'Flex';
      const carry = top(g.lead)?.[0] ?? sigs[r].a;
      const trait = top(g.traits)?.[0] ?? -1;
      // A duo only when most of the group's boards run both carries.
      let partner = -1;
      for (const [key, n] of g.pairs) {
        const [x, y] = key.split('|').map(Number);
        if ((x === carry || y === carry) && n >= g.n * 0.5) partner = x === carry ? y : x;
      }
      let name: string;
      let id: string;
      if (partner >= 0) {
        name = `${who(carry)} & ${who(partner)}`;
        id = `${champ(carry)?.slug ?? carry}-${champ(partner)?.slug ?? partner}`;
      } else {
        const tr = trait >= 0 ? index.trait(ds.traitKeys[trait]) : undefined;
        name = tr ? `${tr.name} ${who(carry)}` : `${who(carry)} Flex`;
        id = tr ? `${tr.slug}-${champ(carry)?.slug ?? carry}` : `${champ(carry)?.slug ?? carry}-flex`;
      }
      let unique = id;
      for (let i = 2; usedIds.has(unique); i++) unique = `${id}-${i}`;
      usedIds.add(unique);
      ds.clusters.push({ id: unique, trait, carry, name });
      clusterOf.set(r, k);
    }
    ds.comp[b] = k;
  }
}
