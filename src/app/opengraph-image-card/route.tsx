// The link picture for installs without media/metaforge/metaforge-social-preview.jpg: the layout's metadata points
// og:image here, so a page never goes out without one. When the installer wrote app/opengraph-image.jpg, that file
// takes its place (Next lets a metadata file win over the layout's metadata). Drawn on request from the logo in
// public/assets/app: it names the set, which can change without a deploy, and a build must not load game data or
// touch the store for it. CDNs keep it a day. The name keeps it among the firewall's open paths, like the builder's
// board picture.
import { ImageResponse } from 'next/og';
import { getSetInfo, setTitle } from '@/config/game';
import { shownSetNumber } from '@/lib/static/load';
import { logoSource } from '@/lib/app-icon';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const INK = { night: '#0f0d0b', canopy: '#161411', moon: '#f1e9d8', lichen: '#b8ab94', fog: '#857a68', wisp: '#e2b86a' };

/** The site's address as people type it (APP_URL without its scheme), or nothing when APP_URL is not a URL. */
function address(): string {
  try {
    // The name people type: without the www the site may be served from.
    return new URL(env.appUrl).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function GET() {
  const set = getSetInfo(await shownSetNumber());
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 68px 48px',
          color: INK.moon,
          background: `radial-gradient(80% 70% at 85% 10%, rgba(226,184,106,0.18), transparent 60%), linear-gradient(160deg, ${INK.canopy}, ${INK.night})`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSource()} width={84} height={84} style={{ objectFit: 'contain' }} alt="" />
          <span style={{ marginLeft: 22, fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>MetaForge</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 26, color: INK.wisp, letterSpacing: 3 }}>{`TEAMFIGHT TACTICS · ${setTitle(set, ' · ').toUpperCase()}`}</span>
          <span style={{ marginTop: 18, fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>Forge your next climb.</span>
          <span style={{ marginTop: 26, maxWidth: 940, fontSize: 30, lineHeight: 1.35, color: INK.lichen }}>
            Tier lists, a stats explorer, a team builder and player lookup, built from ranked games.
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 24, color: INK.fog }}>
          <span>Meta report · Stats explorer · Team builder · Ladder · Patch notes</span>
          <span>{address()}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
