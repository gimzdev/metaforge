import { getSetInfo } from '@/config/game';
import { slugify } from '@/lib/utils';
import type {
  Augment,
  Champion,
  Item,
  ItemCategory,
  StaticData,
  Trait,
  TraitEffect,
  TraitStyle,
} from '@/types/static';
import { emblemToken } from './emblem';
import { inferCalcValues, mapLookup, renderRich, splitTraitDescription } from './text';

/* Raw CommunityDragon shapes (only the fields we read). */
interface RawAbility {
  name?: string;
  desc?: string;
  icon?: string;
  variables?: Array<{ name?: string; value?: number[] | number }>;
}
export interface RawChampion {
  apiName: string;
  name?: string;
  characterName?: string;
  cost?: number;
  traits?: string[];
  role?: string | null;
  icon?: string;
  squareIcon?: string;
  tileIcon?: string;
  ability?: RawAbility;
  stats?: Record<string, number | null>;
}
export interface RawTrait {
  apiName: string;
  name?: string;
  desc?: string;
  icon?: string;
  effects?: Array<{ minUnits?: number; maxUnits?: number; style?: number; variables?: Record<string, unknown> }>;
}
export interface RawItem {
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
export interface RawSet {
  number?: number;
  mutator?: string;
  name?: string;
  champions?: RawChampion[];
  traits?: RawTrait[];
  items?: string[];
  augments?: string[];
}
export interface RawCdragon {
  items?: RawItem[];
  setData?: RawSet[];
  sets?: Record<string, RawSet>;
}

const CDRAGON_GAME = 'https://raw.communitydragon.org/latest/game/';
const SPECIAL_MODE = /_(TURBO|PAIRS|PVEMODE|MacaoMode|CarouselOfChaos|Evolved|Tutorial)\b/i;
const SUPPORT_TAG = '{27557a09}';
const COMPONENTS = new Set(
  [
    'TFT_Item_BFSword',
    'TFT_Item_RecurveBow',
    'TFT_Item_NeedlesslyLargeRod',
    'TFT_Item_TearOfTheGoddess',
    'TFT_Item_ChainVest',
    'TFT_Item_NegatronCloak',
    'TFT_Item_GiantsBelt',
    'TFT_Item_SparringGloves',
    'TFT_Item_Spatula',
    'TFT_Item_FryingPan',
  ].map((s) => s.toLowerCase()),
);

/** CDragon texture path → public PNG URL. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim().replace(/\\/g, '/');
  if (!trimmed || /^(none|null)$/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\.(tex|dds)(\?|$)/i, '.png$2');
  return CDRAGON_GAME + trimmed.toLowerCase().replace(/^\/+/, '').replace(/\.(tex|dds)$/, '.png');
}

export function selectSet(raw: RawCdragon, wanted: number): { set: RawSet; fellBack: boolean } {
  const all: RawSet[] = Array.isArray(raw.setData) && raw.setData.length ? raw.setData : Object.values(raw.sets ?? {});
  if (!all.length) throw new Error('CommunityDragon data contains no sets');
  const standard = all.filter((s) => !SPECIAL_MODE.test(s.mutator ?? ''));
  const pool = standard.length ? standard : all;
  const pick = (n: number) =>
    pool
      .filter((s) => s.number === n)
      .sort(
        (a, b) =>
          Number(a.mutator !== `TFTSet${n}`) - Number(b.mutator !== `TFTSet${n}`) ||
          (a.mutator ?? '').length - (b.mutator ?? '').length,
      )[0];
  const exact = pick(wanted);
  if (exact) return { set: exact, fellBack: false };
  const newest = Math.max(...pool.map((s) => s.number ?? 0));
  return { set: pick(newest), fellBack: true };
}

/** CDragon breakpoint styles: 1 bronze, 2 silver, 3 unique, 4 gold, 5 prismatic. */
function traitStyles(effects: Array<{ minUnits: number; style?: number }>): TraitStyle[] {
  const map: Record<number, TraitStyle> = { 1: 'bronze', 2: 'silver', 3: 'unique', 4: 'gold', 5: 'prismatic' };
  const mapped = effects.map((e) => (e.style !== undefined ? map[e.style] : undefined));
  const rank: Record<string, number> = { bronze: 1, silver: 2, gold: 3, prismatic: 4 };
  const multi = effects.length > 1;
  const sane =
    mapped.every(Boolean) &&
    (!multi || mapped.every((s) => s !== 'unique')) &&
    mapped.every((s, i) => i === 0 || rank[s as string] >= rank[mapped[i - 1] as string]);
  if (sane) return mapped as TraitStyle[];
  // Fallback: derive from position.
  const n = effects.length;
  if (n === 1) return [effects[0].minUnits <= 1 ? 'unique' : 'gold'];
  const ladder: TraitStyle[][] = [
    [],
    [],
    ['bronze', 'gold'],
    ['bronze', 'silver', 'gold'],
    ['bronze', 'silver', 'gold', 'prismatic'],
  ];
  if (n <= 4) return ladder[n];
  return effects.map((_, i) => (i === 0 ? 'bronze' : i === n - 1 ? 'prismatic' : i === n - 2 ? 'gold' : 'silver'));
}

function uniqueSlugger() {
  const used = new Set<string>();
  return (base: string, fallback: string) => {
    let slug = slugify(base) || slugify(fallback) || 'x';
    if (used.has(slug)) {
      let i = 2;
      while (used.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
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
  if ((item.composition?.length ?? 0) === 2) return 'completed';
  return 'special';
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

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function normalizeCdragon(raw: RawCdragon, wantedSet: number, source: StaticData['source']): StaticData {
  const { set } = selectSet(raw, wantedSet);
  const setNumber = set.number ?? wantedSet;
  const info = getSetInfo(setNumber);
  const origins = new Set(info.origins.map((o) => o.toLowerCase()));

  /* ── traits ─────────────────────────────────────────────── */
  const traitSlug = uniqueSlugger();
  const rawTraits = (set.traits ?? []).filter((t) => t?.apiName);
  const traitByName = new Map<string, Trait>();
  const traitByKey = new Map<string, Trait>();
  const traits: Trait[] = rawTraits.map((t) => {
    const effectsRaw = (t.effects ?? [])
      .map((e) => ({ ...e, minUnits: Number(e.minUnits ?? 0), maxUnits: Number(e.maxUnits ?? 0) }))
      .filter((e) => e.minUnits > 0)
      .sort((a, b) => a.minUnits - b.minUnits);
    const styles = traitStyles(effectsRaw);
    const { header, rows, expand } = splitTraitDescription(t.desc ?? '');
    const effects: TraitEffect[] = effectsRaw.map((e, i) => {
      const template = expand ?? rows[i] ?? rows[rows.length - 1] ?? '';
      return {
        minUnits: e.minUnits,
        maxUnits: e.maxUnits > 1000 ? 99 : e.maxUnits,
        style: styles[i] ?? 'bronze',
        desc: renderRich(template, mapLookup(e.variables, { MinUnits: e.minUnits, MaxUnits: e.maxUnits })),
      };
    });
    const firstVars = effectsRaw[0]?.variables;
    const name = t.name?.trim() || t.apiName;
    const trait: Trait = {
      id: t.apiName,
      key: t.apiName.toLowerCase(),
      slug: traitSlug(name, t.apiName),
      name,
      icon: assetUrl(t.icon),
      desc: renderRich(header, mapLookup(firstVars)),
      effects,
      champions: [],
      kind: 'trait',
    };
    traitByName.set(name.toLowerCase(), trait);
    traitByKey.set(trait.key, trait);
    return trait;
  });

  /* ── champions ──────────────────────────────────────────── */
  const seen = new Set<string>();
  const playable = (set.champions ?? []).filter((c) => {
    if (!c?.apiName || seen.has(c.apiName)) return false;
    if (!c.cost || c.cost <= 0 || !c.traits?.length) return false;
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
        const shared = siblings
          .map((s) => new Set(s.traits ?? []))
          .reduce((acc, cur) => new Set([...acc].filter((x) => cur.has(x))));
        const distinct = (c.traits ?? []).find((t) => !shared.has(t));
        const suffix = distinct ?? /_(AP|AD|[A-Za-z]+)$/.exec(c.apiName)?.[1] ?? c.apiName;
        name = `${baseName} (${suffix})`;
      }
      const traitIds = (c.traits ?? [])
        .map((tn) => traitByName.get(tn.toLowerCase()) ?? traitByKey.get(tn.toLowerCase()))
        .filter((t): t is Trait => Boolean(t))
        .map((t) => t.id);
      const vars = new Map<string, number[] | number>();
      for (const v of c.ability?.variables ?? []) {
        if (v?.name && v.value !== undefined) vars.set(v.name.toLowerCase(), v.value as number[] | number);
      }
      const calcs = inferCalcValues(c.ability?.desc ?? '', c.ability?.variables);
      const stats = c.stats ?? {};
      const champion: Champion = {
        id: c.apiName,
        key: c.apiName.toLowerCase(),
        slug: champSlug(name, c.apiName),
        name,
        baseName,
        cost: Number(c.cost),
        traits: traitIds,
        role: c.role ?? null,
        icon: assetUrl(c.squareIcon) ?? assetUrl(c.tileIcon) ?? assetUrl(c.icon),
        tile: assetUrl(c.tileIcon) ?? assetUrl(c.squareIcon),
        splash: assetUrl(c.icon) ?? assetUrl(c.tileIcon),
        ability: {
          name: c.ability?.name?.trim() ?? '',
          icon: assetUrl(c.ability?.icon),
          desc: renderRich(c.ability?.desc ?? '', (n) => calcs.get(n.toLowerCase()) ?? vars.get(n.toLowerCase())),
        },
        stats: {
          hp: num(stats.hp),
          mana: num(stats.mana),
          initialMana: num(stats.initialMana),
          damage: num(stats.damage),
          armor: num(stats.armor),
          magicResist: num(stats.magicResist),
          attackSpeed: num(stats.attackSpeed),
          critChance: num(stats.critChance),
          range: num(stats.range),
        },
      };
      return champion;
    })
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

  for (const champion of champions) {
    for (const id of champion.traits) traitByKey.get(id.toLowerCase())?.champions.push(champion.id);
  }
  for (const trait of traits) {
    const maxMin = Math.max(0, ...trait.effects.map((e) => e.minUnits));
    trait.kind =
      trait.effects.length > 0 && maxMin <= 1
        ? 'unique'
        : origins.size
          ? origins.has(trait.name.toLowerCase())
            ? 'origin'
            : 'class'
          : 'trait';
  }

  /* ── items & augments ───────────────────────────────────── */
  const allItems = (raw.items ?? []).filter((i) => i?.apiName);
  const itemIndex = new Map(allItems.map((i) => [i.apiName, i]));
  const isAugmentId = (id: string) => /_augment_/i.test(id);

  let itemPool: RawItem[];
  if (Array.isArray(set.items) && set.items.length) {
    itemPool = set.items.map((id) => itemIndex.get(id)).filter((i): i is RawItem => Boolean(i));
  } else {
    const prefix = new RegExp(`^(TFT_Item_|TFT${setNumber}_Item_)`, 'i');
    itemPool = allItems.filter((i) => prefix.test(i.apiName));
  }
  const itemSlug = uniqueSlugger();
  const items: Item[] = itemPool
    .filter((i) => !i.isAugment && !isAugmentId(i.apiName) && (i.name ?? '').trim())
    .map((i) => {
      const traitsFor = (i.associatedTraits ?? [])
        .map((t) => traitByKey.get(t.toLowerCase()) ?? traitByName.get(t.toLowerCase()))
        .filter((t): t is Trait => Boolean(t))
        .map((t) => t.id);
      return {
        id: i.apiName,
        key: i.apiName.toLowerCase(),
        slug: itemSlug(i.name ?? i.apiName, i.apiName),
        name: (i.name ?? i.apiName).trim(),
        icon: assetUrl(i.icon),
        desc: renderRich(i.desc ?? '', mapLookup(i.effects)),
        composition: (i.composition ?? []).filter((c) => itemIndex.has(c)),
        category: itemCategory(i),
        traits: traitsFor,
        unique: Boolean(i.unique),
      } satisfies Item;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const { items: catalog, aliases: itemAliases } = dedupeItems(items, traits);

  let augmentPool: RawItem[] = [];
  if (Array.isArray(set.augments) && set.augments.length) {
    augmentPool = set.augments.map((id) => itemIndex.get(id)).filter((i): i is RawItem => Boolean(i));
  }
  const augmentSlug = uniqueSlugger();
  const augments: Augment[] = augmentPool
    .filter((a) => (a.name ?? '').trim())
    .map((a) => ({
      id: a.apiName,
      key: a.apiName.toLowerCase(),
      slug: augmentSlug(a.name ?? a.apiName, a.apiName),
      name: (a.name ?? a.apiName).trim(),
      icon: assetUrl(a.icon),
      desc: renderRich(a.desc ?? '', mapLookup(a.effects)),
      tier: augmentTier(a),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    set: {
      number: setNumber,
      mutator: set.mutator ?? `TFTSet${setNumber}`,
      name: info.name,
      sourceName: set.name ?? '',
    },
    source,
    fetchedAt: new Date().toISOString(),
    champions,
    traits: traits.filter((t) => t.champions.length > 0 || t.effects.length > 0),
    items: catalog,
    augments,
    itemAliases,
  };
}

/**
 * One catalog entry per item. Set 18 mirrors most items under a "DA_" id (the
 * Wisp shop's copies, without descriptions); the standard id wins and the
 * others become aliases so their games count toward it. Wisp-only effects and
 * the temporary Phantom Emblem are dropped, and emblems get their trait.
 */
export function dedupeItems(items: Item[], traits: Trait[]) {
  const aliases: Record<string, string> = {};
  const rank = (i: Item) =>
    (i.key.startsWith('da_') ? 0 : 4) + (i.desc.length ? 2 : 0) - (/(upgrade|augment|_hr$|charm)/.test(i.key) ? 3 : 0);
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
    if (!current) {
      keep.set(group, item);
    } else if (rank(item) > rank(current)) {
      keep.set(group, item);
      aliases[current.key] = item.key;
    } else {
      aliases[item.key] = current.key;
    }
  }
  const catalog = [...keep.values()];
  // Point alias chains at the final survivor.
  const live = new Set(catalog.map((i) => i.key));
  for (const from of Object.keys(aliases)) {
    let to = aliases[from];
    for (let hops = 0; !live.has(to) && aliases[to] && hops < 5; hops++) to = aliases[to];
    aliases[from] = to;
  }

  // Recipes may name mirrored components (DA_Component_Spatula): point them at the catalog ids.
  const idByKey = new Map(catalog.map((i) => [i.key, i.id]));
  for (const item of catalog) {
    item.composition = item.composition.map((c) => idByKey.get(aliases[c.toLowerCase()] ?? c.toLowerCase()) ?? c);
  }

  // Emblems: attach the trait (by name first, then by the id's trait word) and describe them.
  const traitByName = new Map(traits.map((t) => [t.name.toLowerCase(), t]));
  const traitByToken = new Map(traits.map((t) => [t.key.replace(/^.*?_(\d+_)?/, '').replace(/[^a-z0-9]/g, ''), t]));
  for (const item of catalog) {
    if (item.category !== 'emblem') continue;
    let trait = item.traits.length ? traits.find((t) => t.id === item.traits[0]) : undefined;
    trait ??= traitByName.get(item.name.toLowerCase().replace(/\s+emblem$/, ''));
    trait ??= traitByToken.get(emblemToken(item.key));
    if (!trait) continue;
    if (!item.traits.length) item.traits = [trait.id];
    if (!item.desc.length) item.desc = [{ k: 't', v: `The holder gains the ${trait.name} trait.` }];
  }
  return { items: catalog, aliases };
}
