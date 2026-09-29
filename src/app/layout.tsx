import '@fontsource-variable/onest';
import '@fontsource-variable/fraunces/standard.css';
import '@fontsource-variable/fraunces/standard-italic.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { currentPatch } from '@/config/game';
import { Wordmark } from '@/components/layout/logo';
import { SiteBackdrop } from '@/components/layout/site-backdrop';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Providers } from '@/components/providers';
import { getSession } from '@/lib/auth/session';
import { tryGetStaticData } from '@/lib/cdragon';
import { brand } from '@/lib/brand';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: 'MetaForge | Tools for Tacticians', template: 'MetaForge | %s' },
  description:
    'Teamfight Tactics meta report, comp tier list, stats explorer, team builder and player lookup, built from ranked games.',
  openGraph: { siteName: 'MetaForge', type: 'website' },
  icons: { icon: brand.logo || '/icon.svg', apple: brand.logo || undefined },
};

export const viewport: Viewport = {
  themeColor: '#0f0d0b',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ data, error }, session] = await Promise.all([tryGetStaticData(), getSession()]);
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <SiteBackdrop />
        {data ? (
          <Providers
            staticData={data}
            session={session ? { puuid: session.puuid, gameName: session.gameName, tagLine: session.tagLine } : null}
            rsoEnabled={env.rsoEnabled}
            riotConfigured={Boolean(env.riotApiKey)}
            currentPatch={currentPatch(data.set.number)?.label ?? null}
          >
            <SiteHeader />
            <main className="mx-auto min-h-[70vh] max-w-[1400px] px-4 pb-10 pt-10 sm:px-6">{children}</main>
            <SiteFooter />
          </Providers>
        ) : (
          <main className="mx-auto grid min-h-dvh max-w-xl place-content-center px-6 text-center">
            <Wordmark size="lg" className="mx-auto" />
            <h1 className="mt-8 text-3xl">Game data is unreachable</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-lichen">
              MetaForge loads champions, traits and items from CommunityDragon on startup and could not reach it. Check
              that this server has internet access, then reload.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-lg border border-line bg-canopy p-3 text-left text-xs text-fog">{error}</pre>
            <a href="" className="mx-auto mt-6 inline-flex h-10 items-center rounded-lg bg-wisp px-5 text-sm font-semibold text-[#1b1306]">
              Try again
            </a>
          </main>
        )}
      </body>
    </html>
  );
}
