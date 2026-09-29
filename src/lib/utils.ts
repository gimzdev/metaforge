import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export const fmt = {
  int(n: number) {
    return new Intl.NumberFormat('en-US').format(Math.round(n));
  },
  compact(n: number) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  },
  /** 0.1234 → "12.3%" */
  pct(ratio: number, digits = 1) {
    if (!Number.isFinite(ratio)) return '–';
    return `${(ratio * 100).toFixed(digits)}%`;
  },
  place(avg: number) {
    return Number.isFinite(avg) && avg > 0 ? avg.toFixed(2) : '–';
  },
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
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  },
  date(ts: number | string) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  },
  duration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },
};

/** Tone for an average placement: lower is better, 4.5 is a coin flip. */
export function placementTone(avg: number): 'great' | 'good' | 'even' | 'poor' | 'bad' {
  if (!Number.isFinite(avg) || avg <= 0) return 'even';
  if (avg < 4.05) return 'great';
  if (avg < 4.35) return 'good';
  if (avg < 4.65) return 'even';
  if (avg < 4.95) return 'poor';
  return 'bad';
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

/** Base64url encode/decode JSON — used to keep filters and boards in shareable URLs. */
export function encodeState(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState<T>(encoded: string | null | undefined): T | null {
  if (!encoded) return null;
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** "Name#TAG" ⇄ URL slug "Name-TAG" (tag lines never contain a dash). */
export function riotIdToSlug(gameName: string, tagLine: string) {
  return encodeURIComponent(`${gameName}-${tagLine}`);
}

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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
