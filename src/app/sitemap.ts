import type { MetadataRoute } from 'next';
import { getStaticData } from '@/lib/cdragon';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const pages = ['', '/meta', '/explorer', '/builder', '/leaderboard', '/news', '/guides', '/units', '/items', '/traits'];
  const out: MetadataRoute.Sitemap = pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'hourly', priority: p === '' ? 1 : 0.8 }));
  try {
    const data = await getStaticData();
    for (const c of data.champions) out.push({ url: `${base}/units/${c.slug}`, changeFrequency: 'daily', priority: 0.6 });
    for (const t of data.traits) out.push({ url: `${base}/traits/${t.slug}`, changeFrequency: 'daily', priority: 0.5 });
    for (const i of data.items) {
      if (i.category === 'completed' || i.category === 'emblem' || i.category === 'artifact') {
        out.push({ url: `${base}/items/${i.slug}`, changeFrequency: 'daily', priority: 0.5 });
      }
    }
  } catch {
    /* game data unavailable: core pages only */
  }
  return out;
}
