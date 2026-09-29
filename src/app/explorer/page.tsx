import type { Metadata } from 'next';
import { ExplorerApp } from '@/components/explorer/explorer-app';
import { EXPLORER_TABS, type ExplorerTab } from '@/components/explorer/tabs';
import { NoData } from '@/components/stats/no-data';
import { PageHeader } from '@/components/ui/primitives';
import { param, scopeFrom, type SearchParams } from '@/lib/search-params';
import { decodeFilters } from '@/lib/stats/filters';
import { explore } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stats explorer',
  description:
    'Filter ranked TFT boards by champions, stars, items, trait breakpoints and level, and see how everything does on the boards that match.',
};

export default async function ExplorerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = decodeFilters(param(sp, 'f'));
  const result = await explore(scopeFrom(sp), filters);

  if (!result.meta.total) {
    return (
      <>
        <PageHeader
          title="Stats explorer"
          description="Filter boards by champions, items, traits and level, and see how everything does on the boards that match."
        />
        <NoData error={result.meta.error} />
      </>
    );
  }

  const tabParam = param(sp, 'tab') as ExplorerTab | undefined;
  const tab: ExplorerTab = tabParam && EXPLORER_TABS.includes(tabParam) ? tabParam : 'units';
  const heldParam = param(sp, 'held');
  const held = heldParam && /^[\w.-]{1,80}$/.test(heldParam) ? heldParam.toLowerCase() : null;
  return <ExplorerApp initial={result} initialFilters={filters} initialTab={tab} initialHeld={held} />;
}
