import { getSetInfo } from '@/config/game';
import { slugify } from '@/lib/utils';
import { emblemToken } from './index';
import { inferCalcValues, mapLookup, renderRich, splitTraitDescription } from './text';
import type { Augment, Champion, ChampionStats, Item, ItemCategory, StaticData, Trait, TraitStyle } from './types';

/* Raw CommunityDragon shapes (only the fields read here). */
type RawAbility = { name?: string; desc?: string; icon?: string; variables?: Array<{ name?: string; value?: number[] | number }> };
interface RawChampion {
  apiName: string;
  name?: string;
  cost?: number;
  traits?: string[];
  role?: string | null;
  icon?: string;
  squareIcon?: string;
  tileIcon?: string;
  ability?: RawAbility;
  stats?: Record<string, number | null>;
}
interface RawTrait {
  apiName: string;
  name?: string;
  desc?: string;
  icon?: string;
  effects?: Array<{ minUnits?: number; maxUnits?: number; style?: number; variables?: Record<string, unknown> }>;
}
interface RawItem {
  apiName: string;
  name?: string;
  desc?: string;
  icon?: string;
  composition?: string[];
  associatedTraits?: string[];
  effects?: Record<string, unknown>;
  tags?: string[];
  unique?: boolean;
  isAugment?: boolean;
  tier?: number | string;
}
type RawSet = { number?: number; mutator?: string; champions?: RawChampion[]; traits?: RawTrait[]; items?: string[]; augments?: string[] };
export interface RawCdragon {
  items?: RawItem[];
  setData?: RawSet[];
  sets?: Record<string, RawSet>;
}

const SPECIAL_MODE = /_(TURBO|PAIRS|PVEMODE|MacaoMode|CarouselOfChaos|Evolved|Tutorial)\b/i;
const SUPPORT_TAG = '{27557a09}';
const COMPONENTS = new Set(
  [
    'bfsword', 'recurvebow', 'needlesslylargerod', 'tearofthegoddess', 'chainvest',
    'negatroncloak', 'giantsbelt', 'sparringgloves', 'spatula', 'fryingpan',
  ].map((s) => `tft_item_${s}`),
);

/** CDragon texture path → PNG path under the game folder (see cdn()). */
function assetPath(path: string | null | undefined): string | null {
  const trimmed = path?.trim().replace(/\\/g, '/');
  if (!trimmed || /^(none|null)$/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\.(tex|dds)(\?|$)/i, '.png$2');
  return trimmed.toLowerCase().replace(/^\/+/, '').replace(/\.(tex|dds)$/, '.png');
}

function selectSet(raw: RawCdragon, wanted: number): RawSet {
  const all: RawSet[] = Array.isArray(raw.setData) && raw.setData.length ? raw.setData : Object.values(raw.sets ?? {});
  if (!all.length) throw new Error('CommunityDragon data contains no sets');
  const standard = all.filter((s) => !SPECIAL_MODE.test(s.mutator ?? ''));
  const pool = standard.length ? standard : all;
  const inexact = (s: RawSet, n: number) => Number(s.mutator !== `TFTSet${n}`);
  const pick = (n: number) =>
    pool.filter((s) => s.number === n).sort((a, b) => inexact(a, n) - inexact(b, n) || (a.mutator ?? '').length - (b.mutator ?? '').length)[0];
  return pick(wanted) ?? pick(Math.max(...pool.map((s) => s.number ?? 0)));
}

/** CDragon breakpoint styles: 1 bronze, 2 silver, 3 unique, 4 gold, 5 prismatic. */
function traitStyles(effects: Array<{ minUnits: number; style?: number }>): TraitStyle[] {
  const map: Record<number, TraitStyle> = { 1: 'bronze', 2: 'silver', 3: 'unique', 4: 'gold', 5: 'prismatic' };
  const mapped = effects.map((e) => (e.style !== undefined ? map[e.style] : undefined));
  const rank: Record<string, number> = { bronze: 1, silver: 2, gold: 3, prismatic: 4 };
  const sane =
    mapped.every(Boolean) &&
    (effects.length <= 1 || mapped.every((s) => s !== 'unique')) &&
    mapped.every((s, i) => i === 0 || rank[s as string] >= rank[mapped[i - 1] as string]);
  if (sane) return mapped as TraitStyle[];
  // Otherwise derive them from the position.
  const n = effects.length;
  if (n === 1) return [effects[0].minUnits <= 1 ? 'unique' : 'gold'];
  const ladder: TraitStyle[][] = [[], [], ['bronze', 'gold'], ['bronze', 'silver', 'gold'], ['bronze', 'silver', 'gold', 'prismatic']];
  if (n <= 4) return ladder[n];
  return effects.map((_, i) => (i === 0 ? 'bronze' : i === n - 1 ? 'prismatic' : i === n - 2 ? 'gold' : 'silver'));
}

function uniqueSlugger() {
  const used = new Set<string>();
  return (base: string, fallback: string) => {
    let slug = slugify(base) || slugify(fallback) || 'x';
    for (let i = 2, root = slug; used.has(slug); i++) slug = `${root}-${i}`;
    used.add(slug);
    return slug;
  };
}

function itemCategory(item: RawItem): ItemCategory {
  const api = item.apiName.toLowerCase();
  const name = (item.name ?? '').toLowerCase();
  const tags = new Set((item.tags ?? []).map((t) => String(t).toLowerCase()));
  if (api.includes('_assist_') || api.includes('armory')) return 'special';
  if (tags.has('consumable') || api.includes('consumable')) return 'consumable';
  if (tags.has('component') || COMPONENTS.has(api)) return 'component';
  if ((item.associatedTraits?.length ?? 0) > 0 || /emblem$/.test(name) || api.includes('emblem')) return 'emblem';
  if (tags.has(SUPPORT_TAG)) return 'support';
  if (api.includes('artifact') || api.includes('_ornn')) return 'artifact';
  if (name.startsWith('radiant ') || api.includes('radiant')) return 'radiant';
  if (api.includes('support')) return 'support';
  return (item.composition?.length ?? 0) === 2 ? 'completed' : 'special';
}

function augmentTier(item: RawItem): Augment['tier'] {
  const tiers: Record<string, Augment['tier']> = { '1': 'silver', '2': 'gold', '3': 'prismatic' };
  if (item.tier !== undefined && tiers[String(item.tier)]) return tiers[String(item.tier)];
  const icon = item.icon ?? '';
  const roman = /[-_](iii|ii|i)(?:\.[a-z]+)?$/i.exec(icon);
  if (roman) return ({ i: 'silver', ii: 'gold', iii: 'prismatic' } as const)[roman[1].toLowerCase() as 'i' | 'ii' | 'iii'];
  const digit = /([123])\.(?:tex|dds|png)$/i.exec(icon);
  return digit ? tiers[digit[1]] : 'unknown';
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const STAT_KEYS = ['hp', 'mana', 'initialMana', 'damage', 'armor', 'magicResist', 'attackSpeed', 'critChance', 'range'] as const;

/** Where each champion stands. Most catalog roles are blank, so short-range units much sturdier than their cost's average are tanks too. */
function assignRows(champions: Champion[]) {
  const dur = (c: Champion) => (c.stats.hp ?? 0) * (1 + (c.stats.armor ?? 0) / 100);
  const sums = new Map<number, { total: number; n: number }>();
  for (const c of champions) {
    const s = sums.get(Math.min(c.cost, 5)) ?? { total: 0, n: 0 };
    s.total += dur(c);
    s.n += 1;
    sums.set(Math.min(c.cost, 5), s);
  }
  for (const c of champions) {
    const s = sums.get(Math.min(c.cost, 5));
    const mean = s && s.n ? s.total / s.n : 0;
    const role = (c.role ?? '').toLowerCase();
    const range = c.stats.range ?? 1;
    const tank = role.includes('tank') || (range <= 2 && mean > 0 && dur(c) / mean >= 1.2);
    if (tank) c.row = 0;
    else if (role.includes('fighter') || role.includes('reaper') || role.includes('assassin')) c.row = range > 2 ? 2 : 1;
    else c.row = range >= 4 ? 3 : range >= 2 ? 2 : 1;
  }
}

export function normalizeCdragon(raw: RawCdragon, wantedSet: number, source: StaticData['source']): StaticData {
  const set = selectSet(raw, wantedSet);
  const setNumber = set.number ?? wantedSet;
  const info = getSetInfo(setNumber);
  const origins = new Set(info.origins.map((o) => o.toLowerCase()));

  /* ── traits ─────────────────────────────────────────────── */
  const traitSlug = uniqueSlugger();
  const traitByName = new Map<string, Trait>();
  const traitByKey = new Map<string, Trait>();
  const traits: Trait[] = (set.traits ?? [])
    .filter((t) => t?.apiName)
    .map((t) => {
      const effectsRaw = (t.effects ?? [])
        .map((e) => ({ ...e, minUnits: Number(e.minUnits ?? 0), maxUnits: Number(e.maxUnits ?? 0) }))
        .filter((e) => e.minUnits > 0)
        .sort((a, b) => a.minUnits - b.minUnits);
      const styles = traitStyles(effectsRaw);
      const { header, rows, expand } = splitTraitDescription(t.desc ?? '');
      const name = t.name?.trim() || t.apiName;
      const trait: Trait = {
        key: t.apiName.toLowerCase(),
        slug: traitSlug(name, t.apiName),
        name,
        icon: assetPath(t.icon),
        desc: renderRich(header, mapLookup(effectsRaw[0]?.variables)),
        effects: effectsRaw.map((e, i) => ({
          minUnits: e.minUnits,
          style: styles[i] ?? 'bronze',
          desc: renderRich(expand ?? rows[i] ?? rows[rows.length - 1] ?? '', mapLookup(e.variables, { MinUnits: e.minUnits, MaxUnits: e.maxUnits })),
        })),
        champions: [],
        kind: 'trait',
      };
      traitByName.set(name.toLowerCase(), trait);
      traitByKey.set(trait.key, trait);
      return trait;
    });
  const traitFor = (name: string) => traitByName.get(name.toLowerCase()) ?? traitByKey.get(name.toLowerCase());

  /* ── champions ──────────────────────────────────────────── */
  const seen = new Set<string>();
  const playable = (set.champions ?? []).filter((c) => {
    if (!c?.apiName || seen.has(c.apiName) || !c.cost || c.cost <= 0 || !c.traits?.length) return false;
    seen.add(c.apiName);
    return true;
  });
  const byName = new Map<string, RawChampion[]>();
  for (const c of playable) {
    const n = (c.name ?? c.apiName).trim();
    byName.set(n, [...(byName.get(n) ?? []), c]);
  }
  const champSlug = uniqueSlugger();
  const champions: Champion[] = playable
    .map((c) => {
      const baseName = (c.name ?? c.apiName).trim();
      const siblings = byName.get(baseName) ?? [];
      let name = baseName;
      if (siblings.length > 1) {
        // Forms of one champion (Lux the Avatar) are told apart by the trait only they have.
        const shared = siblings.map((s) => new Set(s.traits ?? [])).reduce((acc, cur) => new Set([...acc].filter((x) => cur.has(x))));
        const suffix = (c.traits ?? []).find((t) => !shared.has(t)) ?? /_(AP|AD|[A-Za-z]+)$/.exec(c.apiName)?.[1] ?? c.apiName;
        name = `${baseName} (${suffix})`;
      }
      const vars = new Map<string, number[] | number>();
      for (const v of c.ability?.variables ?? []) if (v?.name && v.value !== undefined) vars.set(v.name.toLowerCase(), v.value as number[] | number);
      const calcs = inferCalcValues(c.ability?.desc ?? '', c.ability?.variables);
      const stats = c.stats ?? {};
      return {
        key: c.apiName.toLowerCase(),
        slug: champSlug(name, c.apiName),
        name,
        baseName,
        cost: Number(c.cost),
        traits: (c.traits ?? []).map((tn) => traitFor(tn)?.key).filter((k): k is string => Boolean(k)),
        row: 1,
        role: c.role ?? null,
        icon: assetPath(c.squareIcon) ?? assetPath(c.tileIcon) ?? assetPath(c.icon),
        tile: assetPath(c.tileIcon) ?? assetPath(c.squareIcon),
        splash: assetPath(c.icon) ?? assetPath(c.tileIcon),
        ability: {
          name: c.ability?.name?.trim() ?? '',
          icon: assetPath(c.ability?.icon),
          desc: renderRich(c.ability?.desc ?? '', (n) => calcs.get(n.toLowerCase()) ?? vars.get(n.toLowerCase())),
        },
        stats: Object.fromEntries(STAT_KEYS.map((k) => [k, num(stats[k])])) as unknown as ChampionStats,
      } satisfies Champion;
    })
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  assignRows(champions);

  for (const champion of champions) for (const key of champion.traits) traitByKey.get(key)?.champions.push(champion.key);
  for (const trait of traits) {
    const maxMin = Math.max(0, ...trait.effects.map((e) => e.minUnits));
    trait.kind = trait.effects.length > 0 && maxMin <= 1 ? 'unique' : !origins.size ? 'trait' : origins.has(trait.name.toLowerCase()) ? 'origin' : 'class';
  }

  /* ── items & augments ───────────────────────────────────── */
  const allItems = (raw.items ?? []).filter((i) => i?.apiName);
  const itemIndex = new Map(allItems.map((i) => [i.apiName, i]));
  const inSet = (ids: string[] | undefined) => (ids ?? []).map((id) => itemIndex.get(id)).filter((i): i is RawItem => Boolean(i));
  const prefix = new RegExp(`^(TFT_Item_|TFT${setNumber}_Item_)`, 'i');
  const itemPool = set.items?.length ? inSet(set.items) : allItems.filter((i) => prefix.test(i.apiName));
  const itemSlug = uniqueSlugger();
  const items: Item[] = itemPool
    .filter((i) => !i.isAugment && !/_augment_/i.test(i.apiName) && (i.name ?? '').trim())
    .map((i) => ({
      key: i.apiName.toLowerCase(),
      slug: itemSlug(i.name ?? i.apiName, i.apiName),
      name: (i.name ?? i.apiName).trim(),
      icon: assetPath(i.icon),
      desc: renderRich(i.desc ?? '', mapLookup(i.effects)),
      composition: (i.composition ?? []).filter((c) => itemIndex.has(c)).map((c) => c.toLowerCase()),
      category: itemCategory(i),
      traits: (i.associatedTraits ?? []).map((t) => traitFor(t)?.key).filter((k): k is string => Boolean(k)),
      unique: Boolean(i.unique),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const { items: catalog, aliases: itemAliases } = dedupeItems(items, traits);

  const augments: Augment[] = inSet(set.augments)
    .filter((a) => (a.name ?? '').trim())
    .map((a) => ({
      key: a.apiName.toLowerCase(),
      name: (a.name ?? a.apiName).trim(),
      icon: assetPath(a.icon),
      desc: renderRich(a.desc ?? '', mapLookup(a.effects)),
      tier: augmentTier(a),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    set: { number: setNumber, name: info.name },
    source,
    champions,
    traits: traits.filter((t) => t.champions.length > 0 || t.effects.length > 0),
    items: catalog,
    augments,
    itemAliases,
  };
}

/**
 * One catalog entry per item. Set 18 mirrors most items under a "DA_" id (the Wisp shop's copies, without descriptions);
 * the standard id wins and the others become aliases so their games count toward it. Wisp-only effects and the temporary
 * Phantom Emblem are dropped, and emblems get their trait.
 */
function dedupeItems(items: Item[], traits: Trait[]) {
  const aliases: Record<string, string> = {};
  const rank = (i: Item) => (i.key.startsWith('da_') ? 0 : 4) + (i.desc.length ? 2 : 0) - (/(upgrade|augment|_hr$|charm)/.test(i.key) ? 3 : 0);
  const keep = new Map<string, Item>();
  for (const item of items) {
    if (/phantomemblem/.test(item.key) || /^phantom emblem$/i.test(item.name)) continue;
    if (item.key.startsWith('da_') && item.category !== 'emblem') {
      // Wisp effects (Artifactinate, Radiantize, potions...) are not items a unit holds.
      if (item.category === 'special' || item.category === 'consumable') continue;
      if (/potion|_\d+_(?!emblem)|\d+(_[a-z]+)?$/.test(item.key)) continue;
    }
    const group = `${item.category}|${item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const current = keep.get(group);
    if (!current) keep.set(group, item);
    else if (rank(item) > rank(current)) {
      keep.set(group, item);
      aliases[current.key] = item.key;
    } else aliases[item.key] = current.key;
  }
  const catalog = [...keep.values()];
  // Point alias chains at the final survivor.
  const live = new Set(catalog.map((i) => i.key));
  for (const from of Object.keys(aliases)) {
    let to = aliases[from];
    for (let hops = 0; !live.has(to) && aliases[to] && hops < 5; hops++) to = aliases[to];
    aliases[from] = to;
  }
  // Recipes may name mirrored components (DA_Component_Spatula): point them at the catalog.
  for (const item of catalog) item.composition = item.composition.map((c) => (live.has(aliases[c] ?? c) ? (aliases[c] ?? c) : c));
  // Emblems: attach the trait (by name first, then by the id's trait word) and describe them.
  const traitByName = new Map(traits.map((t) => [t.name.toLowerCase(), t]));
  const traitByToken = new Map(traits.map((t) => [t.key.replace(/^.*?_(\d+_)?/, '').replace(/[^a-z0-9]/g, ''), t]));
  for (const item of catalog) {
    if (item.category !== 'emblem') continue;
    const trait =
      (item.traits.length ? traits.find((t) => t.key === item.traits[0]) : undefined) ??
      traitByName.get(item.name.toLowerCase().replace(/\s+emblem$/, '')) ??
      traitByToken.get(emblemToken(item.key));
    if (!trait) continue;
    if (!item.traits.length) item.traits = [trait.key];
    if (!item.desc.length) item.desc = [{ k: 't', v: `The holder gains the ${trait.name} trait.` }];
  }
  return { items: catalog, aliases };
}
