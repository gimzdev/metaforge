import type { MetadataRoute } from 'next';
import { PATCH_NOTES } from '@/content/news';
import { env } from '@/lib/env';
import { getStaticData } from '@/lib/static/load';
import type { ItemCategory } from '@/lib/static/types';
import { getMeta } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

/** Item kinds the items page lists (consumables and special ids from match data have no tile there). */
const LISTED_ITEMS = new Set<ItemCategory>(['completed', 'component', 'emblem', 'artifact', 'radiant', 'support']);

/** Site pages, champions, traits, items and the graded comps. Player pages stay out: there are far too many. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const pages = ['', '/meta', '/explorer', '/builder', '/leaderboard', '/news', '/guides', '/units', '/items', '/traits'];
  const out: MetadataRoute.Sitemap = pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'hourly', priority: p === '' ? 1 : 0.8 }));
  // Earlier patch notes; the newest are /news itself.
  for (const n of PATCH_NOTES.slice(1)) out.push({ url: `${base}/news?p=${n.id}`, changeFrequency: 'monthly', priority: 0.4 });
  try {
    const data = await getStaticData();
    for (const c of data.champions) out.push({ url: `${base}/units/${c.slug}`, changeFrequency: 'daily', priority: 0.6 });
    for (const t of data.traits) out.push({ url: `${base}/traits/${t.slug}`, changeFrequency: 'daily', priority: 0.5 });
    for (const i of data.items) {
      if (LISTED_ITEMS.has(i.category)) out.push({ url: `${base}/items/${i.slug}`, changeFrequency: 'daily', priority: 0.5 });
    }
  } catch {
    /* game data unavailable: no entity pages */
  }
  try {
    // Comp ids follow the stored boards, so only the comps graded right now.
    for (const c of (await getMeta({})).comps) out.push({ url: `${base}/comps/${c.id}`, changeFrequency: 'daily', priority: 0.6 });
  } catch {
    /* no stats yet */
  }
  return out;
}
