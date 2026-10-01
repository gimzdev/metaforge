'use client';

import { useSyncExternalStore } from 'react';

/** Region and recent player searches, remembered in this browser (same storage key and shape as before). */

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

function read(): Prefs {
  if (state) return state;
  state = DEFAULTS;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')?.state;
    if (saved) {
      state = {
        platform: typeof saved.platform === 'string' ? saved.platform : DEFAULTS.platform,
        recent: Array.isArray(saved.recent) ? saved.recent.slice(0, 6) : [],
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

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
