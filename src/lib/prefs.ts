'use client';

import { useSyncExternalStore } from 'react';
import { getPlatform } from '@/lib/riot/regions';

interface RecentPlayer {
  gameName: string;
  tagLine: string;
  platform: string;
}

interface Prefs {
  platform: string;
  recent: RecentPlayer[];
}

const KEY = 'metaforge-prefs';
const DEFAULTS: Prefs = { platform: 'na1', recent: [] };
let state: Prefs | null = null;
const listeners = new Set<() => void>();

/** Saved values from an older version (or hand-edited) are dropped rather than turned into broken links. */
const isRegion = (id: unknown): id is string => typeof id === 'string' && getPlatform(id)?.id === id;
const isPlayer = (p: unknown): p is RecentPlayer => {
  const r = p as Partial<RecentPlayer> | null;
  return typeof r?.gameName === 'string' && typeof r.tagLine === 'string' && isRegion(r.platform);
};

function read(): Prefs {
  if (state) return state;
  state = DEFAULTS;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')?.state;
    if (saved) {
      state = {
        platform: isRegion(saved.platform) ? saved.platform : DEFAULTS.platform,
        recent: Array.isArray(saved.recent) ? saved.recent.filter(isPlayer).slice(0, 6) : [],
      };
    }
  } catch {
    /* storage unavailable */
  }
  return state;
}

function write(next: Prefs) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ state: next, version: 1 }));
  } catch {
    /* storage unavailable */
  }
  for (const listener of listeners) listener();
}

// Another tab saved: read again, so this one shows it and doesn't write its old copy back over it.
const onStorage = (e: StorageEvent) => {
  if (e.key !== KEY && e.key !== null) return;
  state = null;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
};

export const setPlatform = (platform: string) => write({ ...read(), platform });

export function addRecent(player: RecentPlayer) {
  const id = (p: RecentPlayer) => `${p.gameName}#${p.tagLine}`.toLowerCase();
  const current = read();
  write({ ...current, recent: [player, ...current.recent.filter((r) => id(r) !== id(player))].slice(0, 6) });
}

/** Saved preferences; the server render and hydration use the defaults, then the saved values apply. */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
