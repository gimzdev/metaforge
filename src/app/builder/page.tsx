import type { Metadata } from 'next';
import { BuilderApp } from '@/components/builder/builder';
import { param, type SearchParams } from '@/lib/search-params';

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

export default async function BuilderPage({ searchParams }: { searchParams: SearchParams }) {
  const code = param(await searchParams, 'b') ?? null;
  return <BuilderApp initialCode={code && code.length < 4000 ? code : null} />;
}
