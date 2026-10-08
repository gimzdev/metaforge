import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlaskConical } from '@/components/icons';
import { ItemIcon, TraitBadge } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { RichText } from '@/components/game/rich-text';
import { SummaryTiles } from '@/components/stats/bits';
import { NoStatsNotice } from '@/components/stats/no-data';
import { EntityTable, ScopeBar } from '@/components/stats/table';
import { ButtonLink, DetailHero, Panel } from '@/components/ui';
import { scopeFrom, type SearchParams } from '@/lib/search-params';
import { indexStatic } from '@/lib/static';
import { getStaticData } from '@/lib/static/load';
import { ITEM_CATEGORY_LABEL } from '@/lib/static/types';
import { encodeFilters } from '@/lib/stats/filters';
import { getItemStats } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const item = indexStatic(await getStaticData()).item(slug);
  if (!item) return { title: 'Item not found' };
  return {
    title: item.name,
    description: `Who should hold ${item.name} in TFT, what it pairs with and how it performs in ranked games.`,
    // The page also answers to api names and match-data aliases; the slug is the address to index.
    alternates: { canonical: `/items/${item.slug}` },
  };
}

export default async function ItemPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await getStaticData();
  const item = indexStatic(data).item(slug);
  if (!item) notFound();

  const stats = await getItemStats(item.key, scopeFrom(sp));
  const hasStats = stats.meta.total > 0 && stats.summary.boards > 0;
  const playRate = stats.total ? stats.summary.boards / stats.total : 0;
  const explorerHref = `/explorer?tab=units&f=${encodeFilters([{ k: 'item', id: item.key }])}`;
  const minN = Math.max(3, Math.round(stats.summary.boards * 0.01));

  const buildsInto =
    item.category === 'component'
      ? data.items
          .filter((i) => i.composition.length === 2 && i.composition.includes(item.key))
          .map((i) => ({ result: i, other: i.composition[i.composition.indexOf(item.key) === 0 ? 1 : 0] }))
          .sort((a, b) => a.result.name.localeCompare(b.result.name))
      : [];

  return (
    <div className="space-y-8">
      <DetailHero
        icon={<GameImage src={item.icon} alt={item.name} className="size-20 rounded-xl ring-1 ring-black/40 sm:size-24" eager />}
        kicker={<span>{ITEM_CATEGORY_LABEL[item.category]}</span>}
        title={item.name}
        aside={
          <>
            <ScopeBar scope={stats.scope} meta={stats.meta} />
            <ButtonLink href={explorerHref} size="sm">
              <FlaskConical className="size-4" aria-hidden />
              Explore boards with it
            </ButtonLink>
          </>
        }
      >
        {item.composition.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-lichen">
            {item.composition.map((c, i) => (
              <span key={`${c}-${i}`} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-fog">+</span>}
                <ItemIcon id={c} px={30} />
              </span>
            ))}
            <span className="ml-1">recipe</span>
          </div>
        )}
      </DetailHero>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {hasStats ? <SummaryTiles summary={stats.summary} playRate={playRate} /> : <NoStatsNotice what={`${item.name} stats`} />}
          {hasStats && (
            <>
              <Panel title="Best holders" aside={<span className="text-xs">Share of boards with the item</span>} flush>
                <EntityTable kind="unit" rows={stats.holders} minN={minN} freqLabel="Holds it" limit={15} />
              </Panel>
              <Panel title="Paired with" aside={<span className="text-xs">Other items on the same champion</span>} flush>
                <EntityTable kind="item" rows={stats.partners} minN={minN} freqLabel="Paired" limit={15} />
              </Panel>
            </>
          )}
        </div>
        <aside className="space-y-6">
          <Panel title="Effect">
            <div className="text-sm text-lichen">
              <RichText value={item.desc} />
            </div>
            {item.unique && <div className="mt-3 text-xs text-fog">Unique: one per champion.</div>}
            {item.traits.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.traits.map((t) => <TraitBadge key={t} id={t} tier={1} size={24} showName showCount={false} />)}
              </div>
            )}
          </Panel>
          {buildsInto.length > 0 && (
            <Panel title="Builds into" bodyClassName="p-2 sm:p-5">
              <ul>
                {buildsInto.map(({ result, other }) => (
                  <li key={result.key}>
                    <Link href={`/items/${result.slug}`} className="flex items-center gap-2 rounded-xl p-2 hover:bg-white/[0.04]">
                      <ItemIcon id={other} px={26} link={false} />
                      <span className="text-fog">=</span>
                      <ItemIcon id={result.key} px={30} link={false} />
                      <span className="truncate text-sm">{result.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
