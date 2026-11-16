import type { Metadata } from 'next';
import { BuilderApp, type StarterComp } from '@/components/builder/builder';
import { encodeBoard } from '@/lib/builder';
import { compBoard } from '@/lib/placement';
import { param, type SearchParams } from '@/lib/search-params';
import { indexStatic } from '@/lib/static';
import { getStaticData } from '@/lib/static/load';
import { getMeta } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const code = param(await searchParams, 'b');
  // A shared board's link shows that board (opengraph-image-board/route.tsx draws it from the same code)
  const shared = code && code.length < 4000 && /^[\w-]+$/.test(code) ? code : null;
  const image = shared ? { url: `/builder/opengraph-image-board?b=${shared}`, width: 1200, height: 630, alt: 'A TFT board from the MetaForge team builder' } : null;
  return {
    title: shared ? 'A TFT board' : 'Team builder',
    description: 'Plan TFT boards with drag and drop, live synergies, items and emblems, then share them with a link.',
    // Shared boards (?b=) are variants of this page.
    alternates: { canonical: '/builder' },
    ...(image ? { openGraph: { images: [image] }, twitter: { card: 'summary_large_image', images: [image] } } : {}),
  };
}

/**
 * The best graded comps of the tier list, each as the board its comp page shows: an empty builder offers them as a
 * starting point. Read from the same cached report as /meta and the home page; none while there are no stats.
 */
async function starterComps(): Promise<StarterComp[]> {
  try {
    const [meta, data] = await Promise.all([getMeta({}), getStaticData()]);
    if (!meta.meta.total) return [];
    const index = indexStatic(data);
    return meta.comps
      .filter((c) => c.grade)
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name, grade: c.grade, avg: c.avg, code: encodeBoard(compBoard(c.units, index), Math.round(c.level)) }));
  } catch {
    return [];
  }
}

export default async function BuilderPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, starters] = await Promise.all([searchParams, starterComps()]);
  const code = param(sp, 'b') ?? null;
  return <BuilderApp initialCode={code && code.length < 4000 ? code : null} starters={starters} />;
}
