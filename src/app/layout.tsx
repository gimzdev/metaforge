import '@fontsource-variable/onest';
import '@fontsource-variable/fraunces/standard.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/footer';
import { Wordmark } from '@/components/logo';
import { Providers } from '@/components/providers';
import { SiteBackdrop, SiteHeader } from '@/components/site-header';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { brand } from '@/lib/site';
import { liteStatic, staticTextVersion, tryGetStaticData } from '@/lib/static/load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: 'MetaForge | Tools for Tacticians', template: 'MetaForge | %s' },
  description:
    'Teamfight Tactics meta report, comp tier list, stats explorer, team builder and player lookup, built from ranked games.',
  openGraph: { siteName: 'MetaForge', type: 'website' },
  icons: { icon: brand.logo || '/icon.svg', apple: brand.logo || undefined },
};

export const viewport: Viewport = { themeColor: '#0f0d0b', colorScheme: 'dark' };

/**
 * Runs before any image loads. A picture the image optimizer fails to deliver (an outage, a plan's
 * limit) quietly loads its original instead, unseen by the page's own handlers; game art that
 * still fails shows its monogram (see GameImage).
 */
const IMAGE_FALLBACK = `(function(){function f(e,b){var t=e.target;if(!t||t.tagName!=='IMG')return;var m=b&&/^\\/_next\\/image\\?url=([^&]+)/.exec(t.getAttribute('src')||'');if(m){t.removeAttribute('srcset');t.src=decodeURIComponent(m[1]);e.stopPropagation();return}var p=t.parentNode;if(p&&p.classList&&p.classList.contains('gi')){if(b)p.setAttribute('data-broken','');else p.removeAttribute('data-broken')}}addEventListener('error',function(e){f(e,1)},true);addEventListener('load',function(e){f(e,0)},true)})()`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ data, error }, session] = await Promise.all([tryGetStaticData(), getSession()]);
  return (
    <html lang="en">
      <head>
        {/* Nearly every page shows game art from CommunityDragon: open the connection before the first picture asks. */}
        <link rel="preconnect" href="https://raw.communitydragon.org" />
        <script dangerouslySetInnerHTML={{ __html: IMAGE_FALLBACK }} />
      </head>
      <body className="min-h-dvh">
        <SiteBackdrop />
        {data ? (
          <Providers
            staticData={liteStatic(data)}
            version={staticTextVersion(data)}
            session={session ? { puuid: session.puuid, gameName: session.gameName, tagLine: session.tagLine } : null}
            rsoEnabled={env.rsoEnabled}
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
              MetaForge loads champions, traits and items from CommunityDragon on startup and could not reach it. Check that this
              server has internet access, then reload.
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
