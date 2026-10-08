import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Optional artwork in public/assets/app, found at build time so every host serves the same choice; your jpg/png/webp
 * win over the built-in .avif. The URL carries a file hash, so replaced artwork is never served from a cache.
 */
function publicAsset(candidates: string[]) {
  const found = candidates.find((file) => existsSync(path.join(process.cwd(), 'public', file)));
  if (!found) return '';
  const hash = createHash('sha1').update(readFileSync(path.join(process.cwd(), 'public', found))).digest('hex').slice(0, 10);
  return `/${found}?v=${hash}`;
}
const image = (name: string) => ['jpg', 'jpeg', 'png', 'webp', 'avif'].map((ext) => `assets/app/${name}.${ext}`);

const BRAND = {
  MF_BRAND_LOGO: publicAsset(['assets/app/app.png', 'assets/app/logo.png', 'assets/app/app.webp', 'assets/app/app.svg', 'assets/app/logo.svg']),
  MF_BRAND_BG: publicAsset(image('bg')),
  MF_BRAND_FIGHT: publicAsset(image('fight_banner')),
  MF_BRAND_LEARN: publicAsset(image('learn_banner')),
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The installer's builds skip type checking: these sources are checked before release (npm run build still checks).
  typescript: { ignoreBuildErrors: process.env.MF_SKIP_TYPECHECK === '1' },
  // pg has optional native bindings; keep it out of the server bundle.
  serverExternalPackages: ['pg'],
  // Artwork and champion art go through the optimizer (components/art.tsx); other icons load straight from CommunityDragon.
  images: {
    formats: ['image/avif', 'image/webp'],
    // Exact files and query strings only: each new query string would be a new source image to encode
    // (and bill), so ?v=<anything> must not reach the optimizer. Champion art never has a query string.
    localPatterns: Object.values(BRAND).filter(Boolean).map((url) => ({ pathname: url.slice(0, url.indexOf('?')), search: url.slice(url.indexOf('?')) })),
    remotePatterns: [{ protocol: 'https', hostname: 'raw.communitydragon.org', pathname: '/latest/game/assets/characters/**', search: '' }],
    deviceSizes: [640, 828, 1080, 1440, 1920, 2560, 3840],
    imageSizes: [64, 128, 256],
    qualities: [75, 90],
    minimumCacheTTL: 2_592_000,
  },
  env: BRAND,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Only the directives that cannot break the page. script-src would need per-request nonces for
          // Next's inline scripts and the image fallback in the layout, so scripts and styles are left open.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          // Browsers ignore it over plain http, so a local `npm start` is unaffected; not sent by `next dev`.
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }] : []),
        ],
      },
      { source: '/fonts/:file', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  async redirects() {
    // Keep links from the first MetaForge working.
    return [
      { source: '/meta-report', destination: '/meta', permanent: true },
      { source: '/stats-explorer', destination: '/explorer', permanent: true },
      { source: '/team-builder', destination: '/builder', permanent: true },
      { source: '/login', destination: '/profile', permanent: false },
      ...['units', 'items', 'traits', 'comps'].map((k) => ({ source: `/entity/${k}/:id`, destination: `/${k}/:id`, permanent: false })),
    ];
  },
};

export default nextConfig;
