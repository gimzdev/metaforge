/** Small helpers shared by the server and the browser. */

type ClassPart = string | false | null | undefined | 0;

/** Joins class names. Pass classes that don't conflict: the stylesheet order decides, not this. */
export function cn(...parts: ClassPart[]): string {
  return parts.filter(Boolean).join(' ');
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const intFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmt = {
  int: (n: number) => intFormat.format(Math.round(n)),
  compact: (n: number) => compactFormat.format(n),
  /** 0.1234 → "12.3%" */
  pct: (ratio: number, digits = 1) => (Number.isFinite(ratio) ? `${(ratio * 100).toFixed(digits)}%` : '–'),
  place: (avg: number) => (Number.isFinite(avg) && avg > 0 ? avg.toFixed(2) : '–'),
  delta(d: number) {
    if (!Number.isFinite(d)) return '–';
    const s = d.toFixed(2);
    return d > 0 ? `+${s}` : s;
  },
  ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  },
  ago(ts: number, now = Date.now()) {
    const sec = Math.max(0, Math.round((now - ts) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  },
  date: (ts: number | string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  duration: (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`,
};

/** Tone for an average placement: lower is better, 4.5 is a coin flip. */
export function placementTone(avg: number): 'great' | 'good' | 'even' | 'poor' | 'bad' {
  if (!Number.isFinite(avg) || avg <= 0) return 'even';
  if (avg < 4.05) return 'great';
  if (avg < 4.35) return 'good';
  if (avg < 4.65) return 'even';
  return avg < 4.95 ? 'poor' : 'bad';
}

export const toneText: Record<ReturnType<typeof placementTone>, string> = {
  great: 'text-good',
  good: 'text-fern',
  even: 'text-moon',
  poor: 'text-ember',
  bad: 'text-bloom',
};

export function deltaTone(delta: number) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return 'text-lichen';
  return delta < 0 ? 'text-good' : 'text-bloom';
}

/** Trait stat rows are keyed "traitKey:tier". */
export const traitOf = (rowId: string) => rowId.slice(0, rowId.lastIndexOf(':'));

/**
 * A copy with every fractional number cut to 9 significant digits. Stats go to browsers as JSON, where
 * full doubles are mostly noise digits: payloads shrink by about a third and nothing shown changes.
 */
export function trimFloats<T>(value: T): T {
  if (typeof value === 'number') return (Number.isInteger(value) || !Number.isFinite(value) ? value : Number(value.toPrecision(9))) as T;
  if (Array.isArray(value)) return value.map(trimFloats) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimFloats(v)])) as T;
  return value;
}

/** Base64url JSON, used to keep filters and boards in shareable URLs. */
export function encodeState(value: unknown): string {
  let bin = '';
  for (const b of new TextEncoder().encode(JSON.stringify(value))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState<T>(encoded: string | null | undefined): T | null {
  if (!encoded) return null;
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as T;
  } catch {
    return null;
  }
}

/** "Name#TAG" ⇄ URL slug "Name-TAG" (tag lines never contain a dash). */
export const riotIdToSlug = (gameName: string, tagLine: string) => encodeURIComponent(`${gameName}-${tagLine}`);

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function slugToRiotId(slug: string): { gameName: string; tagLine: string } | null {
  const decoded = safeDecode(slug);
  const i = decoded.lastIndexOf('-');
  if (i <= 0 || i === decoded.length - 1) return null;
  return { gameName: decoded.slice(0, i), tagLine: decoded.slice(i + 1) };
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const i = trimmed.lastIndexOf('#');
  if (i <= 0 || i === trimmed.length - 1) return null;
  const gameName = trimmed.slice(0, i).trim();
  const tagLine = trimmed.slice(i + 1).trim();
  if (!gameName || !tagLine || tagLine.length > 5 || gameName.length > 16) return null;
  return { gameName, tagLine };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
