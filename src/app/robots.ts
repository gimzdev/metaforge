import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    // Filtered explorer views and shared builder boards are endless variants of their crawlable canonical pages.
    // /api/static/ is the game data pages load (a crawler that renders pages needs it); the rest of /api/ is not for crawling.
    rules: [{ userAgent: '*', allow: ['/', '/api/static/'], disallow: ['/api/', '/auth/', '/status', '/profile', '/explorer?', '/builder?'] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
