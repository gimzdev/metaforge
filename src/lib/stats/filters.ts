import { decodeState, encodeState } from '@/lib/utils';
import type { Filter } from './types';

/** Validation and URL encoding for explorer filters. Safe on server and client. */

const MAX_FILTERS = 16;
/** Raw entries looked at, per request and per list inside a filter: input is untrusted and can be huge. */
const MAX_SCAN = 64;
const KEY_RE = /^[a-z0-9_.:{}-]{1,96}$/;

/**
 * A champion, item, trait or augment key as filters take it (lowercase api name), or null. Names that
 * every object has ("constructor", "__proto__") are refused: results are looked up by key in plain objects.
 */
export function cleanKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const k = value.trim().toLowerCase();
  return KEY_RE.test(k) && !(k in Object.prototype) ? k : null;
}

function intIn(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

function sanitizeFilter(raw: unknown): Filter | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const not = f.not === true ? true : undefined;
  switch (f.k) {
    case 'unit': {
      const id = cleanKey(f.id);
      if (!id) return null;
      const stars = Array.isArray(f.stars)
        ? [...new Set(f.stars.slice(0, MAX_SCAN).map((s) => intIn(s, 1, 4)).filter((s): s is number => s !== undefined))].sort()
        : [];
      const items = Array.isArray(f.items)
        ? f.items.slice(0, MAX_SCAN).map((i) => cleanKey(i)).filter((i): i is string => Boolean(i)).slice(0, 3)
        : [];
      const minItems = intIn(f.minItems, 1, 3);
      return {
        k: 'unit',
        id,
        ...(stars.length && stars.length < 4 ? { stars } : {}),
        ...(items.length ? { items } : {}),
        ...(minItems ? { minItems } : {}),
        ...(not ? { not } : {}),
      };
    }
    case 'item': {
      const id = cleanKey(f.id);
      if (!id) return null;
      const min = intIn(f.min, 2, 9);
      return { k: 'item', id, ...(min ? { min } : {}), ...(not ? { not } : {}) };
    }
    case 'trait': {
      const id = cleanKey(f.id);
      if (!id) return null;
      const min = intIn(f.min, 1, 10);
      let max = intIn(f.max, 1, 10);
      if (min && max && max < min) max = min;
      return { k: 'trait', id, ...(min ? { min } : {}), ...(max ? { max } : {}), ...(not ? { not } : {}) };
    }
    case 'aug': {
      const id = cleanKey(f.id);
      return id ? { k: 'aug', id, ...(not ? { not } : {}) } : null;
    }
    case 'level': {
      const min = intIn(f.min, 1, 11);
      let max = intIn(f.max, 1, 11);
      if (!min && !max) return null;
      if (min && max && max < min) max = min;
      return { k: 'level', ...(min ? { min } : {}), ...(max ? { max } : {}), ...(not ? { not } : {}) };
    }
    default:
      return null;
  }
}

export function sanitizeFilters(raw: unknown): Filter[] {
  if (!Array.isArray(raw)) return [];
  const out: Filter[] = [];
  const seen = new Set<string>();
  for (const f of raw.slice(0, MAX_SCAN)) {
    const clean = sanitizeFilter(f);
    if (!clean) continue;
    // One condition per champion, item, trait, augment and level, as the explorer's chips edit them.
    const sig = filterKey(clean);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(clean);
    if (out.length >= MAX_FILTERS) break;
  }
  return out;
}

export function encodeFilters(filters: Filter[]): string {
  return filters.length ? encodeState(filters) : '';
}

export function decodeFilters(value: string | null | undefined): Filter[] {
  return sanitizeFilters(decodeState<unknown>(value));
}

export function filterSignature(filters: Filter[]): string {
  return JSON.stringify(filters);
}

/** Stable identity for a filter slot (used to update/remove a chip). */
export function filterKey(f: Filter): string {
  return f.k === 'level' ? 'level' : `${f.k}:${f.id}`;
}

/** Explorer tabs, shared by the server page and the client app. */
export type ExplorerTab = 'units' | 'items' | 'traits' | 'comps' | 'levels' | 'augments';
export const EXPLORER_TABS: ExplorerTab[] = ['units', 'items', 'traits', 'comps', 'levels', 'augments'];
