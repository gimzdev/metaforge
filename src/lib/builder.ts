import { SET_RULES } from '@/config/game';
import type { StaticIndex } from '@/lib/static';
import type { TraitLite, TraitStyle } from '@/lib/static/types';
import { decodeState, encodeState } from '@/lib/utils';

// Team builder model, share codes and trait math. Safe on the server and in the browser.
export const ROWS = 4;
export const COLS = 7;
const HEXES = ROWS * COLS;
export const MAX_ITEMS = 3;

/** `trait`: the trait an Avatar (Lux) took; it counts twice. */
export type BuilderUnit = { key: string; star: number; items: string[]; trait?: string };

/** Hex index (row * COLS + col, row 0 = front line) → unit */
export type BuilderBoard = Record<number, BuilderUnit>;

type Packed = { v: 1; u: Array<[number, string, number, string[]?, string?]>; l?: number };

export function encodeBoard(board: BuilderBoard, level?: number): string {
  const u = Object.entries(board)
    .map(([hex, unit]) => {
      const row: Packed['u'][number] = [Number(hex), unit.key, unit.star];
      if (unit.items.length || unit.trait) row.push(unit.items);
      if (unit.trait) row.push(unit.trait);
      return row;
    })
    .sort((a, b) => a[0] - b[0]);
  return encodeState({ v: 1, u, ...(level ? { l: level } : {}) } satisfies Packed);
}

export function decodeBoard(value: string | null | undefined, index?: StaticIndex): { board: BuilderBoard; level: number | null } {
  const packed = decodeState<Packed>(value);
  const board: BuilderBoard = {};
  if (!packed || !Array.isArray(packed.u)) return { board, level: null };
  for (const entry of packed.u.slice(0, HEXES)) {
    if (!Array.isArray(entry)) continue;
    const [hex, key, star, items, trait] = entry;
    if (!Number.isInteger(hex) || hex < 0 || hex >= HEXES || typeof key !== 'string') continue;
    const champion = index?.champion(key);
    if (index && !champion) continue;
    board[hex] = {
      key: champion ? champion.key : key.toLowerCase(),
      star: Number.isInteger(star) && star >= 1 && star <= 4 ? star : 1,
      // Catalog keys, like champions above: older links can name an item by an id that is now an alias.
      items: Array.isArray(items)
        ? items
            .filter((i): i is string => typeof i === 'string' && (!index || Boolean(index.item(i))))
            .slice(0, MAX_ITEMS)
            .map((i) => index?.item(i)?.key ?? i.toLowerCase())
        : [],
      ...(typeof trait === 'string' && (!index || index.trait(trait)) ? { trait: index?.trait(trait)?.key ?? trait.toLowerCase() } : {}),
    };
  }
  const level = Number.isInteger(packed.l) && packed.l! >= 1 && packed.l! <= 11 ? packed.l! : null;
  return { board, level };
}

/** Columns ordered from the middle outwards, so auto-placed units cluster sensibly. */
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

export function firstFreeHex(board: BuilderBoard, preferred: number): number | null {
  const rows = [preferred, ...[0, 1, 2, 3].filter((r) => r !== preferred).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))];
  for (const row of rows) for (const col of COLUMN_ORDER) if (!board[row * COLS + col]) return row * COLS + col;
  return null;
}

/** Place a list of units on an empty board by their natural row. */
export function autoPlace(units: BuilderUnit[], index: StaticIndex): BuilderBoard {
  const board: BuilderBoard = {};
  for (const unit of units) {
    const champion = index.champion(unit.key);
    if (!champion) continue;
    const hex = firstFreeHex(board, champion.row);
    if (hex === null) break;
    board[hex] = { key: champion.key, star: unit.star || 1, items: unit.items.slice(0, MAX_ITEMS), ...(unit.trait ? { trait: unit.trait } : {}) };
  }
  return board;
}

export interface ActiveTrait {
  trait: TraitLite;
  count: number;
  /** 1-based breakpoint reached, 0 if none */
  tier: number;
  style: TraitStyle;
  next: number | null;
}

const traitKey = (index: StaticIndex, name: string) => index.traitByName(name)?.key;

/** Team slots used, honoring units that take more than one slot. */
export function slotsUsed(board: BuilderBoard, index: StaticIndex): number {
  const extra = SET_RULES.extraSlots.map((r) => ({ trait: traitKey(index, r.holder), slots: r.slots }));
  let used = 0;
  for (const unit of Object.values(board)) {
    const traits = index.champion(unit.key)?.traits ?? [];
    used += extra.find((r) => r.trait && traits.includes(r.trait))?.slots ?? 1;
  }
  return used;
}

/** Trait counts: each distinct champion once, emblems add their trait to a holder lacking it, plus the set's special rules
 * (an Avatar's trait, its own or the one it took, counts twice). */
export function computeTraits(board: BuilderBoard, index: StaticIndex): ActiveTrait[] {
  const doubleHolder = traitKey(index, SET_RULES.doubleTraitHolder);
  const bonus = SET_RULES.bonusTraitCredit
    .map((b) => ({ holder: traitKey(index, b.holder), trait: traitKey(index, b.trait), total: b.total }))
    .filter((b): b is { holder: string; trait: string; total: 2 } => Boolean(b.holder && b.trait));

  // Credit per trait per distinct champion (max over copies of the same champion).
  const credit = new Map<string, Map<string, number>>();
  const add = (trait: string, source: string, amount: number) => {
    const bySource = credit.get(trait) ?? new Map<string, number>();
    bySource.set(source, Math.max(bySource.get(source) ?? 0, amount));
    credit.set(trait, bySource);
  };

  for (const unit of Object.values(board)) {
    const champion = index.champion(unit.key);
    if (!champion) continue;
    const own = new Set(champion.traits);
    const doubled = Boolean(doubleHolder && own.has(doubleHolder));
    for (const t of own) {
      let amount = doubled && t !== doubleHolder ? 2 : 1;
      for (const b of bonus) if (own.has(b.holder) && b.trait === t) amount = Math.max(amount, b.total);
      add(t, champion.key, amount);
    }
    for (const b of bonus) if (own.has(b.holder) && !own.has(b.trait)) add(b.trait, champion.key, b.total);
    if (doubled && unit.trait && unit.trait !== doubleHolder) {
      add(unit.trait, champion.key, 2);
      own.add(unit.trait);
    }
    // Emblems: each distinct emblem trait on this unit adds one, if the unit doesn't already have it.
    const emblemTraits = new Set(unit.items.flatMap((key) => index.item(key)?.traits ?? []));
    for (const t of emblemTraits) if (!own.has(t)) add(t, champion.key, 1);
  }

  const out: ActiveTrait[] = [];
  for (const [key, sources] of credit) {
    const trait = index.trait(key);
    if (!trait || !trait.effects.length) continue;
    let count = 0;
    for (const v of sources.values()) count += v;
    let tier = 0;
    for (let i = 0; i < trait.effects.length; i++) if (count >= trait.effects[i].minUnits) tier = i + 1;
    const next = trait.effects.find((e) => e.minUnits > count)?.minUnits ?? null;
    const style: TraitStyle = tier === 0 ? 'inactive' : trait.kind === 'unique' ? 'unique' : (trait.effects[tier - 1]?.style ?? 'bronze');
    out.push({ trait, count, tier, style, next });
  }
  const rank: Record<TraitStyle, number> = { prismatic: 5, gold: 4, unique: 3, silver: 2, bronze: 1, inactive: 0 };
  return out.sort(
    (a, b) => rank[b.style] - rank[a.style] || Number(b.tier > 0) - Number(a.tier > 0) || b.count - a.count || a.trait.name.localeCompare(b.trait.name),
  );
}

/** An Avatar (Lux): she plays as a trait of the player's choosing, counted twice. */
export function isAvatar(index: StaticIndex, key: string): boolean {
  const avatar = traitKey(index, SET_RULES.doubleTraitHolder);
  return Boolean(avatar && index.champion(key)?.traits.includes(avatar));
}

/** The champion already fielded under the trait that allows only one (one Lux form), if any. */
export function exclusiveConflict(board: BuilderBoard, candidateKey: string, index: StaticIndex, ignoreHex?: number): string | null {
  const exclusive = traitKey(index, SET_RULES.exclusiveTrait);
  const candidate = index.champion(candidateKey);
  if (!exclusive || !candidate?.traits.includes(exclusive)) return null;
  for (const [hex, unit] of Object.entries(board)) {
    if (Number(hex) === ignoreHex) continue;
    const c = index.champion(unit.key);
    if (c && c.key !== candidate.key && c.traits.includes(exclusive)) return c.name;
  }
  return null;
}
