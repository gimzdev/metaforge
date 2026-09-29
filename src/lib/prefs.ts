'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface RecentPlayer {
  gameName: string;
  tagLine: string;
  platform: string;
}

interface Prefs {
  platform: string;
  recent: RecentPlayer[];
  setPlatform: (platform: string) => void;
  addRecent: (player: RecentPlayer) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      platform: 'na1',
      recent: [],
      setPlatform: (platform) => set({ platform }),
      addRecent: (player) =>
        set((s) => ({
          recent: [
            player,
            ...s.recent.filter(
              (r) => `${r.gameName}#${r.tagLine}`.toLowerCase() !== `${player.gameName}#${player.tagLine}`.toLowerCase(),
            ),
          ].slice(0, 6),
        })),
    }),
    { name: 'metaforge-prefs', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
