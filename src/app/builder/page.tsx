import type { Metadata } from 'next';
import { BuilderApp } from '@/components/builder/builder';
import { param, type SearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Team builder',
  description: 'Plan TFT boards with drag and drop, live synergies, items and emblems, then share them with a link.',
  // Shared boards (?b=) are variants of this page.
  alternates: { canonical: '/builder' },
};

export default async function BuilderPage({ searchParams }: { searchParams: SearchParams }) {
  const code = param(await searchParams, 'b') ?? null;
  return <BuilderApp initialCode={code && code.length < 4000 ? code : null} />;
}
