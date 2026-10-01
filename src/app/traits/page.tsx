import type { Metadata } from 'next';
import { CollectionPage } from '@/components/home';
import { scopeFrom, type SearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Traits', description: 'Every TFT trait in the current set with breakpoint stats from ranked games.' };

export default async function TraitsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CollectionPage
      tab="traits"
      title="Traits"
      description="Origins, classes and one-unit traits with how each breakpoint performs."
      scope={scopeFrom(await searchParams)}
    />
  );
}
