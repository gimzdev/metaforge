'use client';

import { createContext, use, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { HoverCards } from '@/components/game/hover';
import { setPageStatic } from '@/lib/static';
import type { StaticLite, StaticText } from '@/lib/static/types';

interface AppContext {
  session: { gameName: string; tagLine: string; puuid: string } | null;
  rsoEnabled: boolean;
}

const Ctx = createContext<AppContext>({ session: null, rsoEnabled: false });
export const useApp = () => useContext(Ctx);

// The catalog (every champion, trait, item and augment, without descriptions) from /api/static/<version>/lite. Pages
// used to carry it whole, 190 KB in each one; now the browser fetches it once per game data version and keeps it
// (the URL is versioned and cached for good), and a page carries only its own content. The page the server drew
// shows at once; its controls come alive when the catalog is in. The first script of the page asks for it (see
// catalogRequest in app/layout.tsx), so it is normally in before these scripts run.
declare global {
  interface Window {
    /** The request the page's first script started; null when it failed. */
    __mfCatalog?: Promise<StaticLite | null>;
    /** Its answer, with the version it is for. */
    __mfCatalogReady?: [string, StaticLite];
  }
}

/** A promise React can read without waiting once it has an answer (`status` and `value` are React's own protocol for use()). */
type Tracked = Promise<StaticLite> & { status?: string; value?: StaticLite };
const settled = (value: StaticLite): Tracked => Object.assign(Promise.resolve(value), { status: 'fulfilled', value });

/** One request per version, kept for the life of the page. */
const catalogs = new Map<string, Tracked>();

function loadCatalog(version: string): Tracked {
  let pending = catalogs.get(version);
  if (!pending) {
    // Never rejects: a failed request is tried again (after 1, 2, 4 ... seconds, 30 at most). Until it answers the
    // page stays as the server drew it, readable and with working links, instead of turning into an error page.
    const attempt = (n: number): Promise<StaticLite> =>
      fetch(`/api/static/${version}/lite`)
        .then((res) => (res.ok ? (res.json() as Promise<StaticLite>) : Promise.reject(new Error(`catalog ${res.status}`))))
        .catch(() => new Promise<StaticLite>((resolve) => setTimeout(() => resolve(attempt(n + 1)), Math.min(30_000, 1000 * 2 ** n))));
    // The page's own request first, when it is for this version; a failed one is asked again here.
    const early = window.__mfCatalog;
    const answer = early ? early.then((catalog) => (catalog && window.__mfCatalogReady?.[0] === version ? catalog : attempt(0)), () => attempt(0)) : attempt(0);
    const tracked: Tracked = answer.then((catalog) => {
      tracked.status = 'fulfilled';
      tracked.value = catalog;
      return catalog;
    });
    pending = tracked;
    catalogs.set(version, pending);
  }
  return pending;
}

/**
 * The catalog for this render, always through use() (React wants the same call on every pass). In the usual case
 * the page's first script already has it and nothing waits. Otherwise the first render in the browser (hydration)
 * waits for it: React keeps the server's markup until it is in. Later, when the game data has a new version while the
 * page is open, the catalog in use stays until the new one has arrived, so nothing on screen ever waits again.
 */
function useCatalog(version: string): StaticLite {
  const early = window.__mfCatalogReady;
  if (early && !catalogs.has(early[0])) catalogs.set(early[0], settled(early[1]));
  let current = catalogs.get(version) ?? loadCatalog(version);
  if (current.status !== 'fulfilled') {
    for (const other of catalogs.values()) if (other.status === 'fulfilled') current = other;
  }
  // React reads `status` and `value` off the promise itself; its types only know a plain promise here.
  return use(current as Promise<StaticLite>);
}

// Descriptions (abilities, items, traits, augments) from /api/static/<version>, fetched once per game data version.
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

export function Providers({ version, children, ...app }: AppContext & { version: string; children: ReactNode }) {
  // Set during render, so every client component below can look game data up. In the browser that is the catalog
  // (the first render waits for it, see useCatalog); on the server the components read the server's own copy
  // (currentIndex in lib/static).
  if (typeof window !== 'undefined') setPageStatic(useCatalog(version));
  textVersion = version;
  useEffect(() => {
    // Warm the descriptions once the page is idle, so hover cards open with them.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(loadStaticText);
  }, [version]);
  const value = useMemo(() => app, [app.session, app.rsoEnabled]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <HoverCards />
    </Ctx.Provider>
  );
}
