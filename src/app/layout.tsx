import '@fontsource-variable/onest';
import '@fontsource-variable/fraunces/standard.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SiteFooter } from '@/components/footer';
import { Providers } from '@/components/providers';
import { SiteBackdrop, SiteHeader } from '@/components/site-header';
import { getSetInfo, liveSetNumber, setTitle } from '@/config/game';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { staticTextVersion, tryGetStaticData } from '@/lib/static/load';

export const dynamic = 'force-dynamic';

/** Canonical links and link previews are built on APP_URL; a value that is not a URL must not take every page down. */
function siteUrl(): URL | undefined {
  try {
    return new URL(env.appUrl);
  } catch {
    console.error(`[metaforge] APP_URL "${env.appUrl}" is not a URL (it needs https://)`);
    return undefined;
  }
}

const OG_CARD = {
  url: '/opengraph-image-card',
  width: 1200,
  height: 630,
  alt: 'MetaForge: forge your next climb. Teamfight Tactics tier lists, stats explorer, team builder and player lookup, built from ranked games',
};

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: 'MetaForge | Tools for Tacticians', template: 'MetaForge | %s' },
  description: 'Teamfight Tactics meta report, comp tier list, stats explorer, team builder and player lookup, built from ranked games.',
  // The preview image is app/opengraph-image.jpg (media/metaforge/metaforge-social-preview.jpg, copied in by the installer); X/Twitter shows it large.
  // An install without that file (MF_OG_FILE is empty, see next.config.ts) points every page at the card drawn by
  // app/opengraph-image-card instead, so no page goes out without a picture. With the file, nothing is set here: a
  // picture named in this metadata would replace the file on every page but the home page.
  openGraph: { siteName: 'MetaForge', type: 'website', ...(process.env.MF_OG_FILE ? {} : { images: [OG_CARD] }) },
  twitter: { card: 'summary_large_image' },
  // Tab icon: src/app/favicon.ico (16/32/48). Phones use app/apple-icon.tsx, rendered from your logo. Next adds the <link> tags itself.
  appleWebApp: { title: 'MetaForge', capable: true, statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0f0d0b', colorScheme: 'dark' };

/** Runs before any image loads: an optimizer failure falls back to the original; game art that still fails shows its monogram (GameImage). */
const IMAGE_FALLBACK = `(function(){function f(e,b){var t=e.target;if(!t||t.tagName!=='IMG')return;var m=b&&/^\\/_next\\/image\\?url=([^&]+)/.exec(t.getAttribute('src')||'');if(m){t.removeAttribute('srcset');t.src=decodeURIComponent(m[1]);e.stopPropagation();return}var p=t.parentNode;if(p&&p.classList&&p.classList.contains('gi')){if(b)p.setAttribute('data-broken','');else p.removeAttribute('data-broken')}}addEventListener('error',function(e){f(e,1)},true);addEventListener('load',function(e){f(e,0)},true)})()`;

/** Starts the catalog request and keeps its answer where components/providers.tsx finds it; a failure is left to the retry there. */
const catalogRequest = (version: string) =>
  `self.__mfCatalog=fetch(${JSON.stringify(`/api/static/${version}/lite`)}).then(function(r){return r.ok?r.json():null}).then(function(c){if(c)self.__mfCatalogReady=[${JSON.stringify(version)},c];return c}).catch(function(){return null})`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ data, error }, session] = await Promise.all([tryGetStaticData(), getSession()]);
  // Without game data no page can be drawn. This used to answer 200 with a notice, which a monitor or a search engine
  // took for a healthy page: it is an error now (status 500, drawn by app/global-error.tsx, not indexed). /api/status
  // still answers and says why.
  if (!data) throw new Error(`Game data is unreachable: ${error ?? 'no copy and no answer from CommunityDragon'}`);
  const version = staticTextVersion(data);
  // Ranked play has moved to a set whose champions and items MetaForge does not have yet (its games can arrive hours
  // before CommunityDragon's files): the pages still show the set before it, and say so.
  const ahead = liveSetNumber() > data.set.number ? liveSetNumber() : null;
  return (
    <html lang="en">
      <head>
        {/* Nearly every page shows game art from CommunityDragon: open the connection before the first picture asks. */}
        <link rel="preconnect" href="https://raw.communitydragon.org" />
        {/* The catalog every page reads (components/providers.tsx), kept by the browser for good. It is asked for by the
            first script of the page, so it is in before the page's own scripts start: they then start the page in the
            usual small steps. (Waiting for it inside React made the whole start one long task on big pages.) */}
        <script dangerouslySetInnerHTML={{ __html: catalogRequest(version) }} />
        <script dangerouslySetInnerHTML={{ __html: IMAGE_FALLBACK }} />
      </head>
      <body className="min-h-dvh">
        <SiteBackdrop />
        {/* No Suspense boundary here: inside one the answer would start before the page has run, and a page that is
            not found or redirects would go out with status 200. Providers waits for the catalog in the browser all
            the same (hydration pauses on it and the server's markup stays on screen). */}
        <>
          <Providers
            version={version}
            session={session ? { puuid: session.puuid, gameName: session.gameName, tagLine: session.tagLine } : null}
            rsoEnabled={env.rsoEnabled}
          >
            <a href="#main" className="fixed left-4 top-3 z-50 -translate-y-24 rounded-lg bg-wisp px-4 py-2 text-sm font-semibold text-[#1b1306] focus:translate-y-0">
              Skip to content
            </a>
            <SiteHeader />
            <main id="main" className="mx-auto min-h-[70vh] max-w-[1400px] scroll-mt-28 px-4 pb-10 pt-10 sm:px-6">
              {ahead && (
                <p role="status" className="surface mb-10 rounded-xl px-5 py-3 text-sm leading-relaxed text-lichen">
                  <span className="font-semibold text-moon">Set {ahead} is live.</span> MetaForge does not have its champions and items yet, so these
                  pages still show {setTitle(getSetInfo(data.set.number))}. They move to Set {ahead} by themselves.
                </p>
              )}
              {children}
            </main>
            <SiteFooter />
          </Providers>
        </>
        <Analytics />
      </body>
    </html>
  );
}
