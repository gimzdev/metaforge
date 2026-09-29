import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Brand assets are optional files in public/assets/app (the same place MetaForge v1 kept them).
 * They are detected at build time so every host, Vercel included, serves the same choice.
 */
function publicAsset(candidates: string[]): string {
  const found = candidates.find((file) => existsSync(path.join(process.cwd(), 'public', file)));
  return found ? `/${found}` : '';
}
const image = (name: string) => ['jpg', 'jpeg', 'png', 'webp'].map((ext) => `assets/app/${name}.${ext}`);
const brandLogo = publicAsset(['assets/app/app.png', 'assets/app/logo.png', 'assets/app/app.webp', 'assets/app/app.svg', 'assets/app/logo.svg']);
const brandBackground = publicAsset(image('bg'));
const fightBanner = publicAsset(image('fight_banner'));
const learnBanner = publicAsset(image('learn_banner'));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pg has optional native bindings; keep it out of the server bundle.
  serverExternalPackages: ['pg'],
  images: { unoptimized: true },
  env: {
    MF_BRAND_LOGO: brandLogo,
    MF_BRAND_BG: brandBackground,
    MF_BRAND_FIGHT: fightBanner,
    MF_BRAND_LEARN: learnBanner,
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
    ];
  },
  async redirects() {
    // Keep links from MetaForge v1 working.
    return [
      { source: '/meta-report', destination: '/meta', permanent: true },
      { source: '/stats-explorer', destination: '/explorer', permanent: true },
      { source: '/team-builder', destination: '/builder', permanent: true },
      { source: '/login', destination: '/profile', permanent: false },
      { source: '/entity/units/:id', destination: '/units/:id', permanent: false },
      { source: '/entity/items/:id', destination: '/items/:id', permanent: false },
      { source: '/entity/traits/:id', destination: '/traits/:id', permanent: false },
      { source: '/entity/comps/:id', destination: '/comps/:id', permanent: false },
    ];
  },
};

export default nextConfig;
