import type { RichText, StaticLite, TraitLite, TraitStyle } from './types';

/** Lookups over game data, memoized per data object. Safe on the server and in the browser. */
export interface StaticIndex<D extends StaticLite = StaticLite> {
  data: D;
  champion: (keyOrSlug: string | null | undefined) => D['champions'][number] | undefined;
  trait: (keyOrSlug: string | null | undefined) => D['traits'][number] | undefined;
  item: (keyOrSlug: string | null | undefined) => D['items'][number] | undefined;
  /** Catalog key for an item id seen in match data (merges mirrored ids), or the id itself. */
  itemKey: (id: string) => string;
  augment: (key: string | null | undefined) => D['augments'][number] | undefined;
  traitByName: (name: string) => D['traits'][number] | undefined;
}

const memo = new WeakMap<object, StaticIndex>();
const compact = (s: string) => s.replace(/[^a-z0-9]/g, '');

/** Exact key or slug first, then a punctuation-insensitive slug ("kha-zix" finds "khazix"). */
function lookup<T extends { key: string; slug?: string }>(list: T[]) {
  const map = new Map<string, T>();
  const loose = new Map<string, T>();
  for (const e of list) map.set(e.key, e);
  for (const e of list) {
    if (!e.slug) continue;
    if (!map.has(e.slug)) map.set(e.slug, e);
    const c = compact(e.slug);
    if (c && !loose.has(c)) loose.set(c, e);
  }
  return (q: string | null | undefined) => {
    if (!q) return undefined;
    const lower = q.toLowerCase();
    return map.get(lower) ?? loose.get(compact(lower));
  };
}

/** Words that identify an emblem's trait in ids like DA_18_EmblemSlayer or TFT18_Item_SlayerEmblemItem. */
export function emblemToken(key: string): string {
  return compact(key.toLowerCase().replace(/^(tft\d*_item_|tft\d*_|da_\d*_?)/, '').replace(/^emblem/, '').replace(/(emblemitem|emblem|item)$/, ''));
}

export function indexStatic<D extends StaticLite>(data: D): StaticIndex<D> {
  const hit = memo.get(data);
  if (hit) return hit as unknown as StaticIndex<D>;
  const byTraitName = new Map(data.traits.map((t) => [t.name.toLowerCase(), t]));
  const items = lookup(data.items);
  const emblems = new Map<string, D['items'][number]>();
  for (const i of data.items) if (i.category === 'emblem') emblems.set(emblemToken(i.key), i);
  const item = (q: string | null | undefined) => {
    if (!q) return undefined;
    const lower = q.toLowerCase();
    const alias = data.itemAliases[lower];
    // Emblem ids differ between the catalog and match data in some sets: match on the trait word.
    return items(lower) ?? (alias ? items(alias) : undefined) ?? (lower.includes('emblem') ? emblems.get(emblemToken(lower)) : undefined);
  };
  const index: StaticIndex<D> = {
    data,
    champion: lookup(data.champions),
    trait: lookup(data.traits),
    item,
    itemKey: (id) => item(id)?.key ?? id.toLowerCase(),
    augment: lookup(data.augments),
    traitByName: (name) => byTraitName.get(name.toLowerCase()),
  };
  memo.set(data, index as unknown as StaticIndex);
  return index;
}

/* ── The index anywhere ─────────────────────────────────── */

let pageData: StaticLite | null = null;

/** Set by <Providers> from the page's lite data (in the browser and when client components render on the server). */
export function setPageStatic(data: StaticLite) {
  pageData = data;
}

/** Game data without a hook or prop: the page's lite data in client components, the server's copy in server components. */
export function currentIndex(): StaticIndex {
  const bag = (globalThis as { __metaforge?: Record<string, { data?: StaticLite | null } | undefined> }).__metaforge;
  const data = pageData ?? bag?.['static-data']?.data;
  if (!data) throw new Error('Game data is not loaded yet');
  return indexStatic(data);
}

/* ── Display helpers ────────────────────────────────────── */

const CDRAGON = 'https://raw.communitydragon.org/latest/game/';

/** Game art is stored as a path under CommunityDragon's game folder; full URLs pass through. */
export function cdn(path: string | null | undefined): string | null {
  return !path ? null : /^https?:\/\//.test(path) ? path : CDRAGON + path;
}

/** Banner art URLs in the order to try them: the splash and its usual siblings, then (unless `portraits` is false) portraits. */
export function splashSources(
  c: { splash: string | null; tile?: string | null; icon?: string | null } | undefined | null,
  { portraits = true }: { portraits?: boolean } = {},
): string[] {
  const sibling = (name: string) => c?.splash?.replace(/splash_centered_0/i, name);
  const paths = [c?.splash, sibling('splash_uncentered_0'), sibling('splash_tile_0'), ...(portraits ? [c?.tile, c?.icon] : [])];
  return paths.map((p) => cdn(p)).filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i);
}

export function costColor(cost: number): string {
  return cost >= 1 && cost <= 5 ? `var(--color-cost-${cost})` : 'var(--color-cost-6)';
}

const MATCH_STYLE: Record<number, TraitStyle> = { 0: 'inactive', 1: 'bronze', 2: 'silver', 3: 'gold', 4: 'prismatic' };

/** Visual style of a trait at a breakpoint (1-based tier) or from a match's style number. */
export function styleFor(trait: TraitLite, tier?: number, matchStyle?: number): TraitStyle {
  if (trait.kind === 'unique' && (tier ?? 0) > 0) return 'unique';
  if (matchStyle !== undefined) return MATCH_STYLE[matchStyle] ?? 'bronze';
  if (!tier) return 'inactive';
  return trait.effects[Math.min(tier, trait.effects.length) - 1]?.style ?? 'bronze';
}

export const traitKindLabel = (t: TraitLite) => (t.kind === 'trait' ? 'synergy' : t.kind);

export function plainText(rich: RichText | undefined): string {
  return (rich ?? []).map((s) => (s.k === 'n' ? ' ' : (s.v ?? ''))).join('').replace(/\s+/g, ' ').trim();
}
