'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { HoverCards } from '@/components/game/hover';
import { setPageStatic } from '@/lib/static';
import type { StaticLite, StaticText } from '@/lib/static/types';

interface AppContext {
  session: { gameName: string; tagLine: string; puuid: string } | null;
  rsoEnabled: boolean;
}

const Ctx = createContext<AppContext>({ session: null, rsoEnabled: false });
export const useApp = () => useContext(Ctx);

/*
 * Descriptions (abilities, items, traits, augments) come from /api/static/<version>, fetched once
 * per version of the game data (a new version, after a refresh, loads again).
 */
let textVersion = '';
let text: StaticText | null = null;
let textFor = '';
let loadingFor = '';
const listeners = new Set<() => void>();

function loadStaticText() {
  const version = textVersion;
  if (!version || textFor === version || loadingFor === version) return;
  loadingFor = version;
  fetch(`/api/static/${version}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((json: StaticText) => {
      text = json;
      textFor = version;
      for (const l of listeners) l();
    })
    .catch(() => undefined)
    .finally(() => {
      if (loadingFor === version) loadingFor = ''; // after a failure, try again next time
    });
}

/** The descriptions once loaded (null until then; always null on the server render). */
export function useStaticText(): StaticText | null {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => text,
    () => null,
  );
  useEffect(() => loadStaticText(), []);
  return value;
}

export function Providers({
  staticData,
  version,
  children,
  ...app
}: AppContext & { staticData: StaticLite; version: string; children: ReactNode }) {
  // Set during render, so every client component below (on the server too) can look game data up.
  setPageStatic(staticData);
  textVersion = version;
  useEffect(() => {
    // Warm the descriptions once the page is idle, so hover cards open with them.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(loadStaticText);
  }, [version]);
  const value = useMemo(() => app, [app.session, app.rsoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Ctx.Provider value={value}>
      {children}
      <HoverCards />
    </Ctx.Provider>
  );
}
