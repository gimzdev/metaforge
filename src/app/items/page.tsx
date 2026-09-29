import type { Metadata } from 'next';
import { CollectionPage } from '@/components/home/collection-page';
import { scopeFrom, type SearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Items', description: 'Every TFT item, emblem and artifact in the current set with stats from ranked games.' };

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CollectionPage
      tab="items"
      title="Items"
      description="Completed items, components, emblems, artifacts and radiants, with who holds them best."
      scope={scopeFrom(await searchParams)}
    />
  );
}
