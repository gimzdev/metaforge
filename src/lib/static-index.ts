import { emblemToken } from '@/lib/cdragon/emblem';
import type { Augment, Champion, Item, StaticData, Trait } from '@/types/static';

/** Fast lookups over static data, memoized per data object. Safe on server and client. */
export interface StaticIndex {
  data: StaticData;
  champion: (idOrKeyOrSlug: string | null | undefined) => Champion | undefined;
  trait: (idOrKeyOrSlug: string | null | undefined) => Trait | undefined;
  item: (idOrKeyOrSlug: string | null | undefined) => Item | undefined;
  /** Catalog key for an item id seen in match data (merges mirrored ids), or the id itself. */
  itemKey: (id: string) => string;
  augment: (idOrKeyOrSlug: string | null | undefined) => Augment | undefined;
  traitByName: (name: string) => Trait | undefined;
}

const memo = new WeakMap<StaticData, StaticIndex>();

const compact = (s: string) => s.replace(/[^a-z0-9]/g, '');

function build<T extends { key: string; slug: string; id: string }>(list: T[]) {
  const map = new Map<string, T>();
  const loose = new Map<string, T>();
  for (const entry of list) {
    map.set(entry.key, entry);
    if (!map.has(entry.slug)) map.set(entry.slug, entry);
    const c = compact(entry.slug);
    if (c && !loose.has(c)) loose.set(c, entry);
  }
  // Exact key or slug first; then a punctuation-insensitive slug match ("kha-zix" finds "khazix").
  return (q: string | null | undefined) => {
    if (!q) return undefined;
    const lower = q.toLowerCase();
    return map.get(lower) ?? loose.get(compact(lower));
  };
}

export function indexStatic(data: StaticData): StaticIndex {
  const hit = memo.get(data);
  if (hit) return hit;
  const byTraitName = new Map(data.traits.map((t) => [t.name.toLowerCase(), t]));
  const itemLookup = build(data.items);
  const aliases = data.itemAliases ?? {};
  const emblems = new Map<string, Item>();
  for (const i of data.items) if (i.category === 'emblem') emblems.set(emblemToken(i.key), i);
  const resolveItem = (q: string | null | undefined): Item | undefined => {
    if (!q) return undefined;
    const lower = q.toLowerCase();
    const direct = itemLookup(lower) ?? (aliases[lower] ? itemLookup(aliases[lower]) : undefined);
    if (direct) return direct;
    // Emblem ids differ between the catalog and match data in some sets; match on the trait word.
    return lower.includes('emblem') ? emblems.get(emblemToken(lower)) : undefined;
  };
  const index: StaticIndex = {
    data,
    champion: build(data.champions),
    trait: build(data.traits),
    item: resolveItem,
    itemKey: (id) => resolveItem(id)?.key ?? id.toLowerCase(),
    augment: build(data.augments),
    traitByName: (name) => byTraitName.get(name.toLowerCase()),
  };
  memo.set(data, index);
  return index;
}

export function costColor(cost: number): string {
  if (cost >= 1 && cost <= 5) return `var(--color-cost-${cost})`;
  return 'var(--color-cost-6)';
}

/** Where a champion wants to stand: front line (row 0) to back line (row 3). */
export function preferredRow(champion: Champion): number {
  const role = (champion.role ?? '').toLowerCase();
  const range = champion.stats.range ?? 1;
  if (role.includes('tank')) return 0;
  if (role.includes('fighter') || role.includes('reaper') || role.includes('assassin')) return range > 2 ? 2 : 1;
  if (range >= 4) return 3;
  if (range >= 2) return 2;
  return 1;
}
