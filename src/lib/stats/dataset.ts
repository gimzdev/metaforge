import { norm, POSITION_SPECS } from '@/config/positioning';
import { configuredSetNumber, currentPatch, patchWindows, SET_RULES, type ResolvedPatch } from '@/config/game';
import { singleton } from '@/lib/cache';
import { getStaticData } from '@/lib/static/load';
import { indexStatic, type StaticIndex } from '@/lib/static';
import type { StaticData } from '@/lib/static/types';
import { getStore } from '@/lib/store';
import { slugify } from '@/lib/utils';
import { emptyColumns, loadColumns, type Columns } from './columns';
import type { DatasetMeta } from './types';

// The stored boards interned against the game data in typed arrays, which the engine scans. Built from the
// compact columns (see columns.ts): only matches the store hasn't delivered yet are read when something changes.
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
  /** Per board, the trait its Avatar (Lux) played as, or -1. */
  avatarTrait: Int16Array;
  comp: Int32Array;
  clusters: Cluster[];
  meta: DatasetMeta;
}

export const NO_PATCH = 255;
// How often a warm server asks the store whether new matches arrived. Pages read their results from the shared cache
// (lib/shared-cache.ts), and the stats service asks for a recent check when it computes one, so this default rarely applies.
const CHECK_MS = 30 * 60_000;

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

/**
 * The current dataset: the loaded copy at once, refreshed in the background when the store has new matches or a patch starts.
 * `maxAgeMs`: how recently the store must have been asked about new matches for the loaded copy to count as current.
 * `wait`: when it doesn't, wait for the refresh instead of answering with the loaded copy (results that get shared).
 */
export function getDataset(maxAgeMs = CHECK_MS, wait = false): Promise<Dataset> {
  const h = holder();
  if (h.ds && h.gen === gen().n && Date.now() - h.checkedAt < maxAgeMs) return Promise.resolve(h.ds);
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
  return h.ds && !wait ? Promise.resolve(h.ds) : h.refreshing;
}

async function refresh(h: Holder): Promise<Dataset> {
  const g = gen().n;
  const data = await getStaticData();
  const setNumber = data.set.number;
  const store = getStore();
  const token = await store.changeToken(setNumber).catch(() => `unknown:${Date.now()}`);
  const windows = patchWindows(setNumber).map((p) => `${p.label}@${p.start}`).join();
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
      console.error('[metaforge] could not load boards:', e instanceof Error ? e.message : e);
      // Pages and API responses show this, so not the driver's message: it can name the database host or user.
      const code = (e as { code?: unknown } | null)?.code;
      error = `Could not read the stored matches${typeof code === 'string' && /^\w{1,32}$/.test(code) ? ` (${code})` : ''}.`;
    }
  }
  // The same boards (nothing new in range) and the same game data: keep the built dataset. After a
  // failed read that is the last good one, rather than a copy rebuilt every minute just to carry the error.
  const unchanged = h.ds && h.ds.static === data && windows === h.windows && columns?.matches === h.builtFrom;
  const same = unchanged && (error ? h.ds!.N > 0 : !h.ds!.meta.error);
  const ds = same ? h.ds! : buildDataset(columns ?? emptyColumns(), data, { version: g, source: store.describe(), error });
  // After a failed read, keep no token so the next check (a minute later) reads again.
  Object.assign(h, { ds, columns, builtFrom: columns?.matches ?? null, token: error ? '' : token, gen: g, windows, checkedAt: Date.now() });
  return ds;
}

/** After a collection run: bring the columns up to date and save them for other servers. */
export async function refreshStoredBoards() {
  const h = holder();
  // The set the dataset reads (the game data's, see refresh), so both keep one snapshot instead of
  // replacing each other's while CommunityDragon lags behind a new TFT_SET.
  const setNumber = (await getStaticData().catch(() => null))?.set.number ?? configuredSetNumber();
  h.columns = await loadColumns(h.columns, setNumber, { persist: true });
  gen().n++; // rebuild on the next request
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

  // Written straight into typed arrays sized for every column entry (only unknown units, items,
  // traits and augments are dropped), then trimmed: building runs on every cold start and every
  // time new matches arrive, so it avoids growing plain arrays of millions of numbers.
  const regions: string[] = [];
  const regionOf = new Int32Array(c.regions.length).fill(-1);
  const maxB = c.place.length;
  const place = new Uint8Array(maxB), level = new Uint8Array(maxB), region = new Uint8Array(maxB), patch = new Uint8Array(maxB);
  const uStart = new Uint32Array(maxB + 1), uChamp = new Uint16Array(c.uId.length), uStar = new Uint8Array(c.uId.length);
  const iStart = new Uint32Array(c.uId.length + 1), iItem = new Uint16Array(c.iId.length);
  const tStart = new Uint32Array(maxB + 1), tTrait = new Uint16Array(c.tId.length), tTier = new Uint8Array(c.tId.length);
  const tUnits = new Uint8Array(c.tId.length), tStyle = new Uint8Array(c.tId.length);
  const aStart = new Uint32Array(maxB + 1), aAug = new Uint16Array(c.aId.length);
  let newest = 0;
  let oldest = Number.POSITIVE_INFINITY;
  // Read positions in the columns, and how much of each output array is filled.
  let b = 0, u = 0, i = 0, t = 0, a = 0;
  let N = 0, U = 0, I = 0, T = 0, A = 0;
  for (let m = 0; m < c.matches.length; m++) {
    const time = c.mTime[m];
    const p = patchOf(time);
    for (let end = b + c.mBoards[m]; b < end; b++) {
      const units = c.uCount[b];
      const mark = U;
      for (let ue = u + units; u < ue; u++) {
        const items = c.iCount[u];
        const champ = uMap[c.uId[u]];
        if (champ >= 0) {
          // Summons, props and retired units are left out.
          uChamp[U] = champ;
          uStar[U] = c.uStar[u];
          for (let ie = i + items; i < ie; i++) if (iMap[c.iId[i]] >= 0) iItem[I++] = iMap[c.iId[i]];
          iStart[++U] = I;
        } else i += items;
      }
      const traits = c.tCount[b];
      const augs = c.aCount[b];
      if (U === mark) {
        t += traits;
        a += augs;
        continue; // nothing usable on this board
      }
      uStart[N + 1] = U;
      for (let te = t + traits; t < te; t++) {
        const ti = tMap[c.tId[t]];
        if (ti < 0) continue;
        tTrait[T] = ti;
        tUnits[T] = c.tUnits[t];
        tStyle[T] = c.tStyle[t];
        tTier[T++] = c.tTier[t];
      }
      tStart[N + 1] = T;
      for (let ae = a + augs; a < ae; a++) if (aMap[c.aId[a]] >= 0) aAug[A++] = aMap[c.aId[a]];
      aStart[N + 1] = A;
      let r = regionOf[c.mRegion[m]];
      if (r < 0) {
        regionOf[c.mRegion[m]] = r = regions.length;
        regions.push(c.regions[c.mRegion[m]]);
      }
      place[N] = c.place[b];
      level[N] = c.level[b];
      region[N] = r;
      patch[N++] = p;
      if (time > newest) newest = time;
      if (time < oldest) oldest = time;
    }
  }

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
    place: place.slice(0, N),
    level: level.slice(0, N),
    region: region.slice(0, N),
    patch: patch.slice(0, N),
    uStart: uStart.slice(0, N + 1),
    uChamp: uChamp.slice(0, U),
    uStar: uStar.slice(0, U),
    iStart: iStart.slice(0, U + 1),
    iItem: iItem.slice(0, I),
    tStart: tStart.slice(0, N + 1),
    tTrait: tTrait.slice(0, T),
    tTier: tTier.slice(0, T),
    tUnits: tUnits.slice(0, T),
    tStyle: tStyle.slice(0, T),
    aStart: aStart.slice(0, N + 1),
    aAug: aAug.slice(0, A),
    avatarTrait: new Int16Array(N).fill(-1),
    comp: new Int32Array(N).fill(-1),
    clusters: [],
    meta: {
      source: opts.source,
      error: opts.error,
      total: N,
      builtAt: Date.now(),
      hasAugments: A > 0,
      newest: N ? newest : null,
      oldest: N ? oldest : null,
      patches: [],
      regions: [],
      currentPatch: currentPatch(data.set.number)?.label ?? null,
    },
  };

  inferAvatarTraits(ds, index);
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

/**
 * The trait each board's Avatar (Lux) played as. Riot sends her as one champion whatever trait she took, but counts that
 * trait twice: it is the trait the board has more of than its other units, their emblems and the set's bonus credit give.
 */
function inferAvatarTraits(ds: Dataset, index: StaticIndex) {
  const avatar = ds.traitIdx.get(index.traitByName(SET_RULES.doubleTraitHolder)?.key ?? '');
  if (avatar === undefined) return;
  const traitOf = (name: string) => ds.traitIdx.get(index.traitByName(name)?.key ?? '') ?? -1;
  const traitsOf = ds.champKeys.map((k) => (index.champion(k)?.traits ?? []).map((t) => ds.traitIdx.get(t) ?? -1).filter((t) => t >= 0));
  const bonus = SET_RULES.bonusTraitCredit.map((r) => ({ holder: traitOf(r.holder), trait: traitOf(r.trait), total: r.total }));
  const emblem = Int16Array.from(ds.itemKeys, (k) => {
    const traits = index.item(k)?.traits ?? [];
    return traits.length === 1 ? (ds.traitIdx.get(traits[0]) ?? -1) : -1;
  });
  const count = new Int16Array(ds.traitKeys.length);
  const seen = new Int32Array(ds.champKeys.length).fill(-1);
  for (let b = 0; b < ds.N; b++) {
    const from = ds.uStart[b], to = ds.uStart[b + 1];
    let found = false;
    for (let u = from; u < to && !found; u++) found = traitsOf[ds.uChamp[u]].includes(avatar);
    if (!found) continue;
    count.fill(0);
    for (let u = from; u < to; u++) {
      const c = ds.uChamp[u], own = traitsOf[c];
      if (own.includes(avatar)) continue;
      if (seen[c] !== b) {
        // Copies of one champion count once.
        seen[c] = b;
        for (const t of own) count[t]++;
        for (const r of bonus) if (r.trait >= 0 && own.includes(r.holder)) count[r.trait] += r.total - (own.includes(r.trait) ? 1 : 0);
      }
      // Each emblem trait once per unit, and only on a unit without it.
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) {
        const t = emblem[ds.iItem[i]];
        let again = false;
        for (let j = ds.iStart[u]; j < i; j++) again ||= emblem[ds.iItem[j]] === t;
        if (t >= 0 && !again && !own.includes(t)) count[t]++;
      }
    }
    let gap = 0;
    for (let x = ds.tStart[b]; x < ds.tStart[b + 1]; x++) {
      const t = ds.tTrait[x];
      if (t !== avatar && ds.tUnits[x] - count[t] > gap) {
        gap = ds.tUnits[x] - count[t];
        ds.avatarTrait[b] = t;
      }
    }
  }
}

/** Damage value of a real carry build: roughly two completed damage items. */
const DUO_DAMAGE = 3;
/** A board needs at least one finished damage item on its carry (two items for a tank carry) and this many units to count as a comp. */
const MIN_CARRY_DAMAGE = 1.2;
const MIN_BOARD_UNITS = 6;

/** How much of an item's value is damage: completed items inherit it from their two components. */
const COMPONENT_OFFENSE: Record<string, number> = {
  tft_item_bfsword: 1, tft_item_recurvebow: 1, tft_item_needlesslylargerod: 1, tft_item_sparringgloves: 0.8, tft_item_tearofthegoddess: 0.6,
  tft_item_spatula: 0.3, tft_item_fryingpan: 0.3, tft_item_chainvest: 0, tft_item_negatroncloak: 0, tft_item_giantsbelt: 0,
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

/** How much of an item's value is defense: its vests, cloaks and belts, which completed items inherit from their components. */
const COMPONENT_DEFENSE: Record<string, number> = { tft_item_chainvest: 1, tft_item_negatroncloak: 1, tft_item_giantsbelt: 1 };
/** A second carry's damage build next to the carry's: two of them carry together from about two thirds. */
const DUO_SHARE = 0.65;
/** A main tank holds about two tank items (Gargoyle Stoneplate and Warmog's Armor, four tank components) or more. */
const MAIN_TANK_DEFENSE = 3;

function itemDefense(ds: Dataset, index: StaticIndex<StaticData>) {
  const byName = new Map(ds.static.items.map((i) => [i.name.toLowerCase(), i]));
  const weight = (key: string, depth = 0): number => {
    const item = index.item(key);
    if (!item) return 0;
    if (item.category === 'component') return COMPONENT_DEFENSE[item.key] ?? 0;
    if (item.category === 'emblem' || item.category === 'support' || item.category === 'artifact') return 0;
    if (item.category === 'radiant' && depth === 0) {
      const base = byName.get(item.name.toLowerCase().replace(/^radiant\s+/, ''));
      return base ? weight(base.key, 1) : 0;
    }
    if (item.composition.length === 2) return item.composition.reduce((sum, c) => sum + weight(c, depth + 1), 0);
    return 0;
  };
  return Float32Array.from(ds.itemKeys, (k) => weight(k));
}

/**
 * Group boards into comps the way players name them.
 * 1. Every board gets a carry: the unit whose items do the most damage, whatever its role (a frontline Kha'Zix with damage
 *    items carries, a tank in armor doesn't; Lux never does). A second unit makes it a duo ("Aphelios & Nidalee") only with
 *    a damage build of its own and a trait shared with the carry, so a legendary holding a stray late item doesn't become a
 *    co-carry. The board's main tank is the unit holding the most tank items.
 * 2. Groups that field nearly the same units (items landed on a different unit that game) merge into the bigger one.
 * 3. Names come from the merged group: its two carries when most boards run two real damage builds ("Sivir & Ashe"), else
 *    its ultra carry with the main tank most boards build ("Kha'Zix & Hecarim", "Azir & Rammus"), else the carry with its
 *    vertical ("Juggernaut Zyra") or its plan ("Veigar Reroll"). A trait the comp only splashes (3 Elderwood) never names it.
 */
function assignClusters(ds: Dataset) {
  const index = indexStatic(ds.static);
  const offense = itemOffense(ds, index);
  const defense = itemDefense(ds, index);
  const C = ds.champKeys.length;
  const champTraits = ds.champKeys.map((k) => (index.champion(k)?.traits ?? []).map((t) => ds.traitIdx.get(t.toLowerCase()) ?? -1).filter((t) => t >= 0));

  // Who can carry: anyone whose items do more damage than they defend, whatever its role. 1: never, Lux (the Avatar): a
  // legendary in one of many forms is too hard to hit to build a comp on, and she plays as a side carry. 2: a tank that
  // carries by holding items (Malphite, Maokai), which counts its items when nobody on the board holds a damage build.
  const avatar = ds.traitIdx.get(index.traitByName(SET_RULES.doubleTraitHolder)?.key ?? '') ?? -1;
  const carryClass = Uint8Array.from(ds.champKeys, (k, ch) => {
    const c = index.champion(k) as ({ baseName?: string; name: string; row: number } | undefined);
    if (!c) return 0;
    if (avatar >= 0 && champTraits[ch].includes(avatar)) return 1;
    return POSITION_SPECS[norm(c.baseName || c.name)]?.carry === 'tank' ? 2 : 0;
  });

  // A trait that says what the comp plays, rather than a few units that happen to share it: past its first breakpoint with
  // four units or more ("Vanguard Aphelios", "Juggernaut Zyra"), or a trait with a single breakpoint that is on ("Solar Yunara").
  // 3 Elderwood or 3 Sprykin is a splash, not the comp. The carry's own trait counts only as a full vertical of five or more
  // ("Rapidfire Aphelios"): two or three units with it say nothing about the board ("Inferno Kennen").
  const steps = ds.traitKeys.map((k) => (index.trait(k)?.effects ?? []).map((e) => e.minUnits));
  const vertical = (ti: number, units: number, own: boolean) => {
    const s = steps[ti];
    if (!s.length || units < 3) return false;
    if (own) return units >= 5 && units >= s[Math.min(1, s.length - 1)];
    return s.length === 1 ? units >= s[0] : units >= 4 && units >= s[1];
  };

  // Pass 1: carry (and second carry, and main tank) per board.
  type Sig = { a: number; b: number; trait: number; n: number; units: Float64Array; primary: Float64Array; traits: Map<number, number>; size: number; star: number; lvl: number; carried: Map<number, number>; tanks: Map<number, number> };
  const sigs: Sig[] = [];
  // Keyed by number: a duo by its two champions, a single carry by champion and trait.
  const sigByKey = new Map<number, number>();
  const T = ds.traitKeys.length;
  const boardSig = new Int32Array(ds.N).fill(-1);
  for (let b = 0; b < ds.N; b++) {
    let first = -1, firstScore = -1, firstDamage = 0;
    let second = -1, secondScore = -1, secondDamage = 0;
    let tankCarry = -1, tankCarryScore = -1;
    const pick = (c: number, damage: number, score: number) => {
      if (score > firstScore) {
        if (first >= 0 && first !== c) {
          second = first;
          secondScore = firstScore;
          secondDamage = firstDamage;
        }
        first = c;
        firstScore = score;
        firstDamage = damage;
      } else if (c !== first && score > secondScore) {
        second = c;
        secondScore = score;
        secondDamage = damage;
      }
    };
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      const c = ds.uChamp[u];
      if (carryClass[c] === 1) continue;
      const items = ds.iStart[u + 1] - ds.iStart[u];
      let damage = 0, guard = 0;
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) {
        damage += offense[ds.iItem[i]];
        guard += defense[ds.iItem[i]];
      }
      // Damage decides; then more items, a higher star level (a 3-star reroll carry), then cost.
      const tie = items * 20 + ds.uStar[u] * 8 + ds.champCost[c] * 2;
      if (carryClass[c] === 2 && items * 100 + tie > tankCarryScore) {
        tankCarry = c;
        tankCarryScore = items * 100 + tie;
      }
      // Tank items make a tank, not a carry.
      if (damage > guard) pick(c, damage, damage * 100 + tie);
    }
    // A tank that carries with its items, on a board with no damage build.
    if ((first < 0 || firstDamage < MIN_CARRY_DAMAGE) && tankCarry >= 0) {
      first = tankCarry;
      firstDamage = Math.floor(tankCarryScore / 100);
      second = -1;
      secondDamage = 0;
    }
    // No carry: nobody holds even one finished damage build, or the board is too small to be a comp.
    if (first < 0 || firstDamage < MIN_CARRY_DAMAGE || ds.uStart[b + 1] - ds.uStart[b] < MIN_BOARD_UNITS) continue;
    // A real second carry: a damage build of its own (about two damage items) close to the carry's; a unit with two items
    // next to a fully built carry (Zyra beside a 3-item Azir) supports it instead.
    const twoCarries = second >= 0 && secondDamage >= DUO_DAMAGE && secondDamage >= firstDamage * DUO_SHARE;
    // The main tank: the unit with the most tank items, two or more (then more items, star, cost), not a carry.
    let tank = -1, tankScore = -1;
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) {
      const c = ds.uChamp[u];
      if (c === first || (twoCarries && c === second)) continue;
      let guard = 0;
      for (let i = ds.iStart[u]; i < ds.iStart[u + 1]; i++) guard += defense[ds.iItem[i]];
      if (guard < MAIN_TANK_DEFENSE) continue;
      const score = guard * 100 + (ds.iStart[u + 1] - ds.iStart[u]) * 20 + ds.uStar[u] * 8 + ds.champCost[c] * 2;
      if (score > tankScore) {
        tank = c;
        tankScore = score;
      }
    }
    // A duo needs two real damage builds (about two damage items each) on units that play together.
    const pair =
      second >= 0 &&
      firstDamage >= DUO_DAMAGE &&
      secondDamage >= DUO_DAMAGE &&
      secondDamage >= firstDamage * 0.6 &&
      champTraits[first].some((t) => !ds.traitUnique[t] && champTraits[second].includes(t));
    // Two traits per board. The group's: the strongest active trait the carry does NOT have, three units or more, which keeps
    // apart comps with the same carry (Draven with Riftbeasts, Draven with Elderwoods). The name's: the strongest vertical (see
    // `vertical`), or none.
    let trait = -1, traitScore = -1, named = -1, namedScore = -1;
    const own = champTraits[first];
    const ownPartner = pair ? champTraits[second] : [];
    for (let t = ds.tStart[b]; t < ds.tStart[b + 1]; t++) {
      const ti = ds.tTrait[t];
      if (ds.traitUnique[ti] || ownPartner.includes(ti)) continue;
      const score = ds.tStyle[t] * 100 + ds.tUnits[t];
      // Lux counts the trait she took twice: the comp has to run it without her, or the name would be Lux's.
      if (vertical(ti, ds.tUnits[t] - (ti === ds.avatarTrait[b] ? 2 : 0), own.includes(ti)) && score > namedScore) {
        named = ti;
        namedScore = score;
      }
      // Only a trait with real weight on the board groups it: three units or more (not a lone Flora Fatalis or Rival).
      if (own.includes(ti) || ds.tUnits[t] < 3) continue;
      if (score > traitScore) {
        trait = ti;
        traitScore = score;
      }
    }
    const a = pair ? Math.min(first, second) : first;
    const bb = pair ? Math.max(first, second) : -1;
    const key = pair ? a * C + bb : C * C + a * (T + 1) + trait + 1;
    let s = sigByKey.get(key);
    if (s === undefined) {
      s = sigs.length;
      sigs.push({ a, b: bb, trait: pair ? -1 : trait, n: 0, units: new Float64Array(C), primary: new Float64Array(2), traits: new Map(), size: 0, star: 0, lvl: 0, carried: new Map(), tanks: new Map() });
      sigByKey.set(key, s);
    }
    const sig = sigs[s];
    sig.n++;
    sig.size += ds.uStart[b + 1] - ds.uStart[b];
    sig.lvl += ds.level[b];
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) if (ds.uChamp[u] === first) sig.star += ds.uStar[u];
    if (pair) sig.primary[first === a ? 0 : 1]++;
    // Everyone who really carried on this board (the carry, and a second real damage build), and its main tank, to name the comp.
    sig.carried.set(first, (sig.carried.get(first) ?? 0) + 1);
    if (twoCarries) sig.carried.set(second, (sig.carried.get(second) ?? 0) + 1);
    if (tank >= 0) sig.tanks.set(tank, (sig.tanks.get(tank) ?? 0) + 1);
    if (named >= 0) sig.traits.set(named, (sig.traits.get(named) ?? 0) + 1);
    for (let u = ds.uStart[b]; u < ds.uStart[b + 1]; u++) sig.units[ds.uChamp[u]]++;
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
        // Only a group whose core has this group's carry; checked first, as most don't.
        if (!theirs.has(sigs[s].a) && !(sigs[s].b >= 0 && theirs.has(sigs[s].b))) continue;
        let overlap = 0;
        for (const c of mine) if (theirs.has(c)) overlap++;
        const needed = Math.ceil(Math.max(mine.size, theirs.size) * 0.75);
        if (overlap >= needed && overlap > bestOverlap) {
          best = t;
          bestOverlap = overlap;
        }
      }
    }
    if (best >= 0) parent[s] = root(best);
    else if (sigs[s].n >= 3) targets.push(s);
  }

  // What each surviving group plays: which carry leads it, how often it runs a duo, which trait.
  type Group = { n: number; share: Map<number, number>; lead: Map<number, number>; traits: Map<number, number>; tanks: Map<number, number>; size: number; star: number; lvl: number };
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
    if (!g) groups.set(r, (g = { n: 0, share: new Map(), lead: new Map(), traits: new Map(), tanks: new Map(), size: 0, star: 0, lvl: 0 }));
    g.n += sig.n;
    for (const [c, k] of sig.carried) bump(g.share, c, k);
    g.size += sig.size;
    g.star += sig.star;
    g.lvl += sig.lvl;
    if (sig.b >= 0) {
      bump(g.lead, sig.a, sig.primary[0]);
      bump(g.lead, sig.b, sig.primary[1]);
    } else bump(g.lead, sig.a, sig.n);
    for (const [t, n] of sig.traits) bump(g.traits, t, n);
    for (const [c, n] of sig.tanks) bump(g.tanks, c, n);
  }

  // Name the surviving groups, the most played first. A smaller group whose name is taken is told apart by the trait that
  // kept it apart from the bigger one.
  const champ = (c: number) => index.champion(ds.champKeys[c]);
  const who = (c: number) => champ(c)?.baseName || champ(c)?.name || 'Flex';
  const named = new Map<number, Omit<Cluster, 'id'> | null>();
  const usedNames = new Set<string>();
  for (const [r, g] of [...groups.entries()].sort((x, y) => y[1].n - x[1].n)) {
    // Comps with a typical board under six units are scattered leftovers, not a comp.
    if (g.size / g.n < MIN_BOARD_UNITS) {
      named.set(r, null);
      continue;
    }
    // The comp's carries are the units that most boards of the group really carry with: the top one, and a second carry when
    // it holds a damage build on almost as many boards ("Sivir & Ashe").
    const ranked = [...g.share.entries()].sort((x, y) => y[1] - x[1]);
    const carry = ranked[0]?.[0] ?? top(g.lead)?.[0] ?? sigs[r].a;
    let partner = -1;
    if (ranked.length > 1 && ranked[1][1] >= g.n * 0.4 && ranked[1][1] >= ranked[0][1] * 0.6) partner = ranked[1][0];
    // An ultra carry goes with the main tank most of its boards build ("Kha'Zix & Hecarim", "Azir & Rammus").
    const mainTank = top(g.tanks);
    const tank = partner < 0 && mainTank && mainTank[0] !== carry && mainTank[1] >= g.n * 0.5 ? mainTank[0] : -1;
    // The group's trait must be the one most of its boards run; a minority trait would name a board that doesn't have it.
    const topTrait = top(g.traits);
    let trait = topTrait && topTrait[1] >= g.n * 0.5 ? topTrait[0] : -1;
    const carryCost = champ(carry)?.cost ?? 3;
    const avgStar = g.star / g.n;
    const avgLevel = g.lvl / g.n;
    const compose = (trait: number) => {
      if (partner >= 0) return `${who(carry)} & ${who(partner)}`;
      if (tank >= 0) return `${who(carry)} & ${who(tank)}`;
      const tr = trait >= 0 ? index.trait(ds.traitKeys[trait]) : undefined;
      // Without a main tank or a trait that says more than the carry itself, the economy plan names it.
      return tr ? `${tr.name} ${who(carry)}` : `${who(carry)}${carryCost <= 3 && avgStar >= 2.6 ? ' Reroll' : avgLevel >= 8.7 ? ' Fast 9' : ' Flex'}`;
    };
    let name = compose(trait);
    if (usedNames.has(name) && sigs[r].trait >= 0 && sigs[r].trait !== trait) {
      trait = sigs[r].trait;
      const tr = index.trait(ds.traitKeys[trait]);
      if (tr) name = `${tr.name} ${name}`;
    }
    usedNames.add(name);
    named.set(r, { trait: partner < 0 && tank < 0 ? trait : -1, carry, name });
  }

  // Point every board at its group.
  const clusterOf = new Map<number, number>();
  const usedIds = new Set<string>();
  for (let b = 0; b < ds.N; b++) {
    if (boardSig[b] < 0) continue;
    const r = root(boardSig[b]);
    let k = clusterOf.get(r);
    if (k === undefined) {
      const cl = named.get(r);
      if (!cl) {
        clusterOf.set(r, -1);
        continue;
      }
      k = ds.clusters.length;
      const id = slugify(cl.name) || `comp-${k}`;
      let unique = id;
      for (let i = 2; usedIds.has(unique); i++) unique = `${id}-${i}`;
      usedIds.add(unique);
      ds.clusters.push({ id: unique, ...cl });
      clusterOf.set(r, k);
    }
    ds.comp[b] = k;
  }
}
