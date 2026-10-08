import type { Metadata } from 'next';
import { MetaView } from '@/components/meta-view';
import { NoData } from '@/components/stats/no-data';
import { PageHeader } from '@/components/ui';
import { scopeFrom, type SearchParams } from '@/lib/search-params';
import { getMeta, metaViewData } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meta report',
  description: 'TFT comp tier list plus champion, item and trait tier lists from ranked games on the live patch.',
  // ?region= and ?patch= views are variants of this page.
  alternates: { canonical: '/meta' },
};

export default async function MetaPage({ searchParams }: { searchParams: SearchParams }) {
  const data = await getMeta(scopeFrom(await searchParams));
  if (!data.meta.total) {
    return (
      <>
        <PageHeader title="Meta report" />
        <NoData error={data.meta.error} />
      </>
    );
  }
  return <MetaView data={metaViewData(data)} />;
}
