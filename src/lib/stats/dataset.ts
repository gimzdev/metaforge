import { currentPatch, getSetInfo, patchWindows, RANKED_QUEUE, type ResolvedPatch } from '@/config/game';
import { singleton } from '@/lib/cache';
import { getStaticData } from '@/lib/cdragon';
import { env } from '@/lib/env';
import { indexStatic } from '@/lib/static-index';
import { getStore } from '@/lib/store';
import type { BoardRecord } from '@/lib/store/types';
import type { StaticData } from '@/types/static';
import type { DatasetMeta } from './types';

/**
 * Collected boards in a compact column layout (typed arrays), interned against
 * the static data. Rebuilt every few minutes or right after a collection run.
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
  traitTiers: Uint8Array;
  regions: string[];
  patches: ResolvedPatch[];
  N: number;
  place: Uint8Array;
  level: Uint8Array;
  region: Uint8Array;
  patch: Uint8Array;
  ts: Uint32Array;
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
/** Rebuild at least this often even without new matches (rolling time windows, patch changes). */
const MAX_AGE_MS = 30 * 60_000;

const gen = () => singleton('dataset-gen', () => ({ n: 1 }));

interface Holder {
  ds: Dataset | null;
  token: string;
  gen: number;
  checkedAt: number;
  refreshing: Promise<Dataset> | null;
}
const holder = () =>
  singleton<Holder>('dataset-holder', () => ({ ds: null, token: '', gen: 0, checkedAt: 0, refreshing: null }));

/** Force a rebuild on the next request (called after a collection run stores matches). */
export function invalidateDataset() {
  gen().n++;
}

/**
 * The current dataset. Serves the loaded copy immediately and refreshes it in
 * the background when the store reports new matches, so pages stay fast.
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
  const store = getStore();
  let token = '';
  try {
    token = await store.changeToken(data.set.number);
  } catch {
    token = `unknown:${Date.now()}`;
  }
  const current = h.ds;
  if (
    current &&
    current.static === data &&
    h.gen === g &&
    token === h.token &&
    Date.now() - current.meta.builtAt < MAX_AGE_MS
  ) {
    h.checkedAt = Date.now();
    return current;
  }
  const ds = await loadDataset(g, data);
  h.ds = ds;
  h.token = token;
  h.gen = g;
  h.checkedAt = Date.now();
  return ds;
}

async function loadDataset(version: number, data: StaticData): Promise<Dataset> {
  const setNumber = data.set.number;
  const info = getSetInfo(setNumber);
  const setStart = Date.parse(`${info.start}T00:00:00Z`);
  const since = Number.isFinite(setStart) ? setStart : Date.now() - 90 * 86_400_000;
  const store = getStore();
  const builder = new DatasetBuilder(data);
  let error: string | null = null;
  try {
    await store.forEachBoard({ setNumber, queueId: RANKED_QUEUE, since, limit: env.maxBoards }, (b) => builder.add(b));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error('[metaforge] could not load boards:', error);
  }
  return builder.finish({ version, source: store.describe(), error });
}

class Interner {
  keys: string[] = [];
  map = new Map<string, number>();
  add(key: string) {
    let i = this.map.get(key);
    if (i === undefined) {
      i = this.keys.length;
      this.keys.push(key);
      this.map.set(key, i);
    }
    return i;
  }
}

/** Turns board records into the column layout, one record at a time. */
export class DatasetBuilder {
  private index;
  private champs = new Interner();
  private items = new Interner();
  private traits = new Interner();
  private augs = new Interner();
  private regions = new Interner();
  private patches: ResolvedPatch[];
  private place: number[] = [];
  private level: number[] = [];
  private region: number[] = [];
  private patch: number[] = [];
  private ts: number[] = [];
  private uStart: number[] = [0];
  private uChamp: number[] = [];
  private uStar: number[] = [];
  private iStart: number[] = [0];
  private iItem: number[] = [];
  private tStart: number[] = [0];
  private tTrait: number[] = [];
  private tTier: number[] = [];
  private tUnits: number[] = [];
  private tStyle: number[] = [];
  private aStart: number[] = [0];
  private aAug: number[] = [];
  private newest = 0;
  private oldest = Number.POSITIVE_INFINITY;

  constructor(private data: StaticData) {
    this.index = indexStatic(data);
    // Intern every known entity up front so indices are stable and complete.
    for (const c of data.champions) this.champs.add(c.key);
    for (const i of data.items) this.items.add(i.key);
    for (const t of data.traits) this.traits.add(t.key);
    for (const a of data.augments) this.augs.add(a.key);
    this.patches = patchWindows(data.set.number);
  }

  private patchOf(ms: number) {
    for (let i = this.patches.length - 1; i >= 0; i--) if (ms >= this.patches[i].start) return i;
    return NO_PATCH;
  }

  add(r: BoardRecord) {
    if (!(r.placement >= 1 && r.placement <= 8) || !Array.isArray(r.units)) return;
    const unitMark = this.uChamp.length;
    const itemMark = this.iItem.length;
    const itemStarts = this.iStart.length;
    let unitsAdded = 0;
    for (const u of r.units) {
      const c = this.champs.map.get(String(u[0]).toLowerCase());
      if (c === undefined) continue; // summons, props, retired units
      this.uChamp.push(c);
      this.uStar.push(Math.min(4, Math.max(1, Number(u[1]) || 1)));
      for (const it of Array.isArray(u[2]) ? u[2] : []) {
        const i = this.items.map.get(this.index.itemKey(String(it)));
        if (i !== undefined) this.iItem.push(i);
      }
      this.iStart.push(this.iItem.length);
      unitsAdded++;
    }
    if (!unitsAdded) {
      // Nothing usable on this board; roll back partial pushes.
      this.uChamp.length = unitMark;
      this.uStar.length = unitMark;
      this.iItem.length = itemMark;
      this.iStart.length = itemStarts;
      return;
    }
    this.uStart.push(this.uChamp.length);
    for (const t of Array.isArray(r.traits) ? r.traits : []) {
      const ti = this.traits.map.get(String(t[0]).toLowerCase());
      if (ti === undefined || !(Number(t[3]) > 0)) continue;
      this.tTrait.push(ti);
      this.tUnits.push(Math.min(255, Number(t[1]) || 0));
      this.tStyle.push(Number(t[2]) || 0);
      this.tTier.push(Math.min(15, Number(t[3]) || 0));
    }
    this.tStart.push(this.tTrait.length);
    for (const a of Array.isArray(r.augments) ? r.augments : []) {
      const ai = this.augs.map.get(String(a).toLowerCase());
      if (ai !== undefined) this.aAug.push(ai);
    }
    this.aStart.push(this.aAug.length);
    this.place.push(r.placement);
    this.level.push(Math.min(15, Math.max(0, r.level || 0)));
    this.region.push(this.regions.add(r.platform || 'unknown'));
    this.patch.push(this.patchOf(r.datetime));
    this.ts.push(Math.floor(r.datetime / 1000));
    if (r.datetime > this.newest) this.newest = r.datetime;
    if (r.datetime < this.oldest) this.oldest = r.datetime;
  }

  finish(opts: { version: number; source: string; error: string | null }): Dataset {
    const { data, index, champs, traits, regions, patches } = this;
    const N = this.place.length;
    const champCost = new Uint8Array(champs.keys.length);
    champs.keys.forEach((k, i) => (champCost[i] = index.champion(k)?.cost ?? 0));
    const traitUnique = new Uint8Array(traits.keys.length);
    const traitTiers = new Uint8Array(traits.keys.length);
    traits.keys.forEach((k, i) => {
      const t = index.trait(k);
      traitUnique[i] = t?.kind === 'unique' ? 1 : 0;
      traitTiers[i] = t?.effects.length ?? 0;
    });

    const ds: Dataset = {
      version: opts.version,
      static: data,
      champKeys: champs.keys,
      itemKeys: this.items.keys,
      traitKeys: traits.keys,
      augKeys: this.augs.keys,
      champIdx: champs.map,
      itemIdx: this.items.map,
      traitIdx: traits.map,
      augIdx: this.augs.map,
      champCost,
      traitUnique,
      traitTiers,
      regions: regions.keys,
      patches,
      N,
      place: Uint8Array.from(this.place),
      level: Uint8Array.from(this.level),
      region: Uint8Array.from(this.region),
      patch: Uint8Array.from(this.patch),
      ts: Uint32Array.from(this.ts),
      uStart: Uint32Array.from(this.uStart),
      uChamp: Uint16Array.from(this.uChamp),
      uStar: Uint8Array.from(this.uStar),
      iStart: Uint32Array.from(this.iStart),
      iItem: Uint16Array.from(this.iItem),
      tStart: Uint32Array.from(this.tStart),
      tTrait: Uint16Array.from(this.tTrait),
      tTier: Uint8Array.from(this.tTier),
      tUnits: Uint8Array.from(this.tUnits),
      tStyle: Uint8Array.from(this.tStyle),
      aStart: Uint32Array.from(this.aStart),
      aAug: Uint16Array.from(this.aAug),
      comp: new Int32Array(N).fill(-1),
      clusters: [],
      meta: {
        source: opts.source,
        error: opts.error,
        total: N,
        builtAt: Date.now(),
        hasAugments: this.aAug.length > 0,
        newest: N ? this.newest : null,
        oldest: N ? this.oldest : null,
        patches: [],
        regions: [],
        currentPatch: currentPatch(data.set.number)?.label ?? null,
      },
    };

    assignClusters(ds);

    const patchCounts = new Array(patches.length).fill(0);
    const regionCounts = new Array(regions.keys.length).fill(0);
    for (let b = 0; b < N; b++) {
      if (ds.patch[b] !== NO_PATCH) patchCounts[ds.patch[b]]++;
      regionCounts[ds.region[b]]++;
    }
    ds.meta.patches = patches.map((p, i) => ({ label: p.label, boards: patchCounts[i], tentative: p.tentative }));
    ds.meta.regions = regions.keys
      .map((id, i) => ({ id, boards: regionCounts[i] }))
      .sort((a, b) => b.boards - a.boards);
    return ds;
  }
}

export function buildDataset(
  records: BoardRecord[],
  data: StaticData,
  opts: { version: number; source: string; error: string | null },
): Dataset {
  const builder = new DatasetBuilder(data);
  for (const r of records) builder.add(r);
  return builder.finish(opts);
}

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

function itemOffense(ds: Dataset, index: ReturnType<typeof indexStatic>) {
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
 *    in three armor items is not the carry). A second unit holding at least one
 *    damage item is a second carry, so "Aphelios + Nidalee" boards group together.
 * 2. Groups that field nearly the same eight units (same comp, items landed on
 *    a different unit that game) are merged into the bigger group.
 * 3. Names: "Aphelios & Nidalee" for two-carry comps, otherwise the carry and
 *    its strongest active trait ("Inferno Kha'Zix").
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
      const score = damage * 100 + (ds.iStart[u + 1] - ds.iStart[u]) * 20 + ds.champCost[c] * 5 + ds.uStar[u];
      if (score > firstScore) {
        if (first >= 0 && first !== c) [second, secondScore, secondDamage] = [first, firstScore, firstDamage];
        [first, firstScore, firstDamage] = [c, score, damage];
      } else if (c !== first && score > secondScore) {
        [second, secondScore, secondDamage] = [c, score, damage];
      }
    }
    if (first < 0) continue;
    // A second carry needs a real damage item (a lone component is not enough).
    const pair = second >= 0 && secondDamage >= 1.5 && firstDamage >= 1.5;
    let trait = -1;
    let traitScore = -1;
    const own = champTraits[first];
    for (let t = ds.tStart[b]; t < ds.tStart[b + 1]; t++) {
      const ti = ds.tTrait[t];
      if (ds.traitUnique[ti] || !own.includes(ti)) continue;
      const score = ds.tStyle[t] * 100 + ds.tUnits[t];
      if (score > traitScore) [trait, traitScore] = [ti, score];
    }
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

  // Name the surviving groups and point every board at its group.
  const clusterOf = new Map<number, number>();
  const usedIds = new Set<string>();
  for (let b = 0; b < ds.N; b++) {
    if (boardSig[b] < 0) continue;
    const r = root(boardSig[b]);
    let k = clusterOf.get(r);
    if (k === undefined) {
      const sig = sigs[r];
      k = ds.clusters.length;
      const champ = (c: number) => index.champion(ds.champKeys[c]);
      const who = (c: number) => champ(c)?.baseName || champ(c)?.name || 'Flex';
      let name: string;
      let id: string;
      let trait = -1;
      for (const [t, n] of sig.traits) if (trait < 0 || n > (sig.traits.get(trait) ?? 0)) trait = t;
      let carry = sig.a;
      if (sig.b >= 0) {
        const [lead, other] = sig.primary[1] > sig.primary[0] ? [sig.b, sig.a] : [sig.a, sig.b];
        carry = lead;
        name = `${who(lead)} & ${who(other)}`;
        id = `${champ(lead)?.slug ?? lead}-${champ(other)?.slug ?? other}`;
      } else {
        const tr = trait >= 0 ? index.trait(ds.traitKeys[trait]) : undefined;
        name = tr ? `${tr.name} ${who(sig.a)}` : `${who(sig.a)} Flex`;
        id = tr ? `${tr.slug}-${champ(sig.a)?.slug ?? sig.a}` : `${champ(sig.a)?.slug ?? sig.a}-flex`;
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
