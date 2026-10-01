import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Artwork is optional files in public/assets/app, picked up at build time so every host, Vercel
 * included, serves the same choice. Your own jpg/png/webp files win over the built-in .avif artwork.
 * The URL carries a hash of the file, so replaced artwork is never served from a cache.
 */
function publicAsset(candidates: string[]) {
  const found = candidates.find((file) => existsSync(path.join(process.cwd(), 'public', file)));
  if (!found) return '';
  const hash = createHash('sha1').update(readFileSync(path.join(process.cwd(), 'public', found))).digest('hex').slice(0, 10);
  return `/${found}?v=${hash}`;
}
const image = (name: string) => ['jpg', 'jpeg', 'png', 'webp', 'avif'].map((ext) => `assets/app/${name}.${ext}`);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pg has optional native bindings; keep it out of the server bundle.
  serverExternalPackages: ['pg'],
  // The artwork and champion art go through the optimizer (sized per screen, AVIF/WebP; see
  // components/art.tsx); item, trait and augment icons load straight from CommunityDragon.
  // Optimized copies are kept 30 days.
  images: {
    formats: ['image/avif', 'image/webp'],
    localPatterns: [{ pathname: '/assets/app/**' }],
    remotePatterns: [{ protocol: 'https', hostname: 'raw.communitydragon.org', pathname: '/latest/game/assets/characters/**' }],
    deviceSizes: [640, 828, 1080, 1440, 1920, 2560, 3840],
    imageSizes: [64, 128, 256],
    qualities: [75, 90],
    minimumCacheTTL: 2_592_000,
  },
  env: {
    MF_BRAND_LOGO: publicAsset(['assets/app/app.png', 'assets/app/logo.png', 'assets/app/app.webp', 'assets/app/app.svg', 'assets/app/logo.svg']),
    MF_BRAND_BG: publicAsset(image('bg')),
    MF_BRAND_FIGHT: publicAsset(image('fight_banner')),
    MF_BRAND_LEARN: publicAsset(image('learn_banner')),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
