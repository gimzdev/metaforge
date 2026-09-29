'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tooltip } from 'radix-ui';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { indexStatic, type StaticIndex } from '@/lib/static-index';
import type { StaticData } from '@/types/static';

interface AppContext {
  index: StaticIndex;
  session: { gameName: string; tagLine: string; puuid: string } | null;
  rsoEnabled: boolean;
  riotConfigured: boolean;
  currentPatch: string | null;
}

const Ctx = createContext<AppContext | null>(null);

export function Providers({
  staticData,
  session,
  rsoEnabled,
  riotConfigured,
  currentPatch,
  children,
}: {
  staticData: StaticData;
  session: AppContext['session'];
  rsoEnabled: boolean;
  riotConfigured: boolean;
  currentPatch: string | null;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  const value = useMemo(
    () => ({ index: indexStatic(staticData), session, rsoEnabled, riotConfigured, currentPatch }),
    [staticData, session, rsoEnabled, riotConfigured, currentPatch],
  );
  return (
    <QueryClientProvider client={client}>
      <Ctx.Provider value={value}>
        <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
          {children}
        </Tooltip.Provider>
      </Ctx.Provider>
    </QueryClientProvider>
  );
}

export function useApp(): AppContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <Providers>');
  return ctx;
}

export function useStatic(): StaticIndex {
  return useApp().index;
}
