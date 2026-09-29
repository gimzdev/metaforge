import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/auth/', '/status', '/profile'] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
