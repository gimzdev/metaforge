import { SET_RULES } from '@/config/game';
import { preferredRow, type StaticIndex } from '@/lib/static-index';
import { decodeState, encodeState } from '@/lib/utils';
import type { Trait, TraitStyle } from '@/types/static';

/** Team builder model, encoding and trait math. Safe on server and client. */

export const ROWS = 4;
export const COLS = 7;
export const HEXES = ROWS * COLS;
export const MAX_ITEMS = 3;

export interface BuilderUnit {
  key: string;
  star: number;
  items: string[];
}

/** Hex index (row * COLS + col, row 0 = front line) → unit */
export type BuilderBoard = Record<number, BuilderUnit>;

type Packed = { v: 1; u: Array<[number, string, number, string[]?]>; l?: number };

export function encodeBoard(board: BuilderBoard, level?: number): string {
  const u = Object.entries(board)
    .map(([hex, unit]) => {
      const row: [number, string, number, string[]?] = [Number(hex), unit.key, unit.star];
      if (unit.items.length) row.push(unit.items);
      return row;
    })
    .sort((a, b) => a[0] - b[0]);
  const packed: Packed = { v: 1, u };
  if (level) packed.l = level;
  return encodeState(packed);
}

export function decodeBoard(value: string | null | undefined, index?: StaticIndex): { board: BuilderBoard; level: number | null } {
  const packed = decodeState<Packed>(value);
  const board: BuilderBoard = {};
  if (!packed || !Array.isArray(packed.u)) return { board, level: null };
  for (const entry of packed.u.slice(0, HEXES)) {
    if (!Array.isArray(entry)) continue;
    const [hex, key, star, items] = entry;
    if (!Number.isInteger(hex) || hex < 0 || hex >= HEXES || typeof key !== 'string') continue;
    const champion = index ? index.champion(key) : null;
    if (index && !champion) continue;
    board[hex] = {
      key: champion ? champion.key : key.toLowerCase(),
      star: Number.isInteger(star) && star >= 1 && star <= 4 ? star : 1,
      items: Array.isArray(items)
        ? items
            .filter((i): i is string => typeof i === 'string' && (!index || Boolean(index.item(i))))
            .map((i) => i.toLowerCase())
            .slice(0, MAX_ITEMS)
        : [],
    };
  }
  const level = Number.isInteger(packed.l) && packed.l! >= 1 && packed.l! <= 11 ? packed.l! : null;
  return { board, level };
}

/** Columns ordered from the middle outwards, so auto-placed units cluster sensibly. */
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

export function firstFreeHex(board: BuilderBoard, preferred: number): number | null {
  const rows = [preferred, ...[0, 1, 2, 3].filter((r) => r !== preferred).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))];
  for (const row of rows) {
    for (const col of COLUMN_ORDER) {
      const hex = row * COLS + col;
      if (!board[hex]) return hex;
    }
  }
  return null;
}

/** Place a list of units on an empty board by their natural row. */
export function autoPlace(units: BuilderUnit[], index: StaticIndex): BuilderBoard {
  const board: BuilderBoard = {};
  for (const unit of units) {
    const champion = index.champion(unit.key);
    if (!champion) continue;
    const hex = firstFreeHex(board, preferredRow(champion));
    if (hex === null) break;
    board[hex] = { key: champion.key, star: unit.star || 1, items: unit.items.slice(0, MAX_ITEMS) };
  }
  return board;
}

export interface ActiveTrait {
  trait: Trait;
  count: number;
  /** 1-based breakpoint reached, 0 if none */
  tier: number;
  style: TraitStyle;
  next: number | null;
}

const lc = (s: string) => s.toLowerCase();

/** Team slots used, honoring units that take more than one slot. */
export function slotsUsed(board: BuilderBoard, index: StaticIndex): number {
  const extra = SET_RULES.extraSlots.map((r) => ({ trait: index.traitByName(r.holder)?.key, slots: r.slots }));
  let used = 0;
  for (const unit of Object.values(board)) {
    const champion = index.champion(unit.key);
    const traitKeys = (champion?.traits ?? []).map(lc);
    const rule = extra.find((r) => r.trait && traitKeys.includes(r.trait));
    used += rule ? rule.slots : 1;
  }
  return used;
}

/**
 * Trait counts for a board: each distinct champion counts once, emblems add
 * their trait to a holder that lacks it, and the set's special rules (the
 * Avatar's doubled trait, bonus trait credit) are applied.
 */
export function computeTraits(board: BuilderBoard, index: StaticIndex): ActiveTrait[] {
  const doubleHolder = index.traitByName(SET_RULES.doubleTraitHolder)?.key;
  const bonus = SET_RULES.bonusTraitCredit
    .map((b) => ({ holder: index.traitByName(b.holder)?.key, trait: index.traitByName(b.trait)?.key, total: b.total }))
    .filter((b) => b.holder && b.trait);

  // Credit per trait per distinct champion (max over copies of the same champion).
  const credit = new Map<string, Map<string, number>>();
  const add = (traitKey: string, source: string, amount: number) => {
    const bySource = credit.get(traitKey) ?? new Map<string, number>();
    bySource.set(source, Math.max(bySource.get(source) ?? 0, amount));
    credit.set(traitKey, bySource);
  };

  for (const unit of Object.values(board)) {
    const champion = index.champion(unit.key);
    if (!champion) continue;
    const own = new Set(champion.traits.map(lc));
    const doubled = Boolean(doubleHolder && own.has(doubleHolder));
    for (const t of own) {
      let amount = doubled && t !== doubleHolder ? 2 : 1;
      for (const b of bonus) if (b.holder && own.has(b.holder) && b.trait === t) amount = Math.max(amount, b.total);
      add(t, champion.key, amount);
    }
    for (const b of bonus) {
      if (b.holder && b.trait && own.has(b.holder) && !own.has(b.trait)) add(b.trait, champion.key, b.total);
    }
    // Emblems: each distinct emblem trait on this unit adds one, if the unit doesn't already have it.
    const emblemTraits = new Set<string>();
    for (const itemKey of unit.items) {
      const item = index.item(itemKey);
      for (const t of item?.traits ?? []) emblemTraits.add(lc(t));
    }
    // Copies of the same champion still count once, emblem or not.
    for (const t of emblemTraits) {
      if (!own.has(t)) add(t, champion.key, 1);
    }
  }

  const out: ActiveTrait[] = [];
  for (const [traitKey, sources] of credit) {
    const trait = index.trait(traitKey);
    if (!trait || !trait.effects.length) continue;
    let count = 0;
    for (const v of sources.values()) count += v;
    let tier = 0;
    trait.effects.forEach((e, i) => {
      if (count >= e.minUnits) tier = i + 1;
    });
    const next = trait.effects.find((e) => e.minUnits > count)?.minUnits ?? null;
    const style: TraitStyle =
      tier === 0 ? 'inactive' : trait.kind === 'unique' ? 'unique' : (trait.effects[tier - 1]?.style ?? 'bronze');
    out.push({ trait, count, tier, style, next });
  }
  const rank: Record<TraitStyle, number> = { prismatic: 5, gold: 4, unique: 3, silver: 2, bronze: 1, inactive: 0 };
  return out.sort(
    (a, b) =>
      rank[b.style] - rank[a.style] ||
      (b.tier > 0 ? 1 : 0) - (a.tier > 0 ? 1 : 0) ||
      b.count - a.count ||
      a.trait.name.localeCompare(b.trait.name),
  );
}

/** The trait that allows only one distinct champion on the board (e.g. one Lux form). */
export function exclusiveConflict(board: BuilderBoard, candidateKey: string, index: StaticIndex, ignoreHex?: number): string | null {
  const exclusive = index.traitByName(SET_RULES.exclusiveTrait)?.key;
  if (!exclusive) return null;
  const candidate = index.champion(candidateKey);
  if (!candidate || !candidate.traits.map(lc).includes(exclusive)) return null;
  for (const [hex, unit] of Object.entries(board)) {
    if (Number(hex) === ignoreHex) continue;
    const c = index.champion(unit.key);
    if (c && c.key !== candidate.key && c.traits.map(lc).includes(exclusive)) return c.name;
  }
  return null;
}
