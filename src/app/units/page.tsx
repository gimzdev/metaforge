import type { Metadata } from 'next';
import { CollectionPage } from '@/components/home/collection-page';
import { scopeFrom, type SearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Champions', description: 'Every TFT champion in the current set with stats from ranked games.' };

export default async function UnitsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CollectionPage
      tab="champions"
      title="Champions"
      description="Every champion in the set. Click a row or a portrait for builds, items and comps."
      scope={scopeFrom(await searchParams)}
    />
  );
}
