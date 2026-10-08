import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { FlaskConical, Hexagon } from '@/components/icons';
import { TypicalBoardPanel } from '@/components/game/board-expander';
import { ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { AvgPlace, CompName, GradeBadge, SummaryTiles } from '@/components/stats/bits';
import { EntityTable, ScopeBar } from '@/components/stats/table';
import { ButtonLink, DetailHero, Panel } from '@/components/ui';
import { encodeBoard } from '@/lib/builder';
import { compBoard } from '@/lib/placement';
import { scopeFrom, type SearchParams } from '@/lib/search-params';
import { indexStatic, splashSources } from '@/lib/static';
import { getStaticData } from '@/lib/static/load';
import { encodeFilters } from '@/lib/stats/filters';
import { getComp, resolveCompId } from '@/lib/stats/service';
import type { Filter } from '@/lib/stats/types';
import { fmt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const result = await getComp(id, scopeFrom(sp)).catch(() => null);
  if (!result) return { title: 'Comp not found' };
  return {
    title: result.comp.name,
    description: `How ${result.comp.name} performs in ranked TFT: core units, carry items, levels and placements.`,
    alternates: { canonical: `/comps/${id}` },
  };
}

export default async function CompPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[a-z0-9-]{1,200}$/.test(id)) notFound();
  const result = await getComp(id, scopeFrom(sp));
  if (!result) {
    // Comp ids are regrouped on every data refresh: send old links to the matching comp, or back to the tier list, not a 404.
    const current = await resolveCompId(id).catch(() => null);
    if (current && current !== id) redirect(`/comps/${current}`);
    redirect('/meta');
  }
  const index = indexStatic(await getStaticData());
  const { comp } = result;

  // The builder opens on the typical board the page shows, every unit of it (Lux keeps the trait she plays as).
  const builderHref = `/builder?b=${encodeBoard(compBoard(comp.units, index), Math.round(comp.level))}`;
  const filters: Filter[] = [];
  if (comp.trait) {
    const t = comp.traits.find((x) => x.id === comp.trait);
    filters.push({ k: 'trait', id: comp.trait, ...(t ? { min: t.tier } : {}) });
  }
  if (comp.carry) filters.push({ k: 'unit', id: comp.carry });
  const explorerHref = `/explorer?f=${encodeFilters(filters)}`;
  const carry = result.carry ? index.champion(result.carry) : undefined;
  // Banner art: the carry's, then units by item count; each lists its own fallbacks so one missing file can't leave it bare.
  const byWeight = [...comp.units].sort((a, b) => b.items.length - a.items.length || b.freq - a.freq);
  const artOrder = [result.carry, ...byWeight.map((u) => u.id)].filter((k, i, all): k is string => Boolean(k) && all.indexOf(k) === i);
  const backdrop = [
    ...artOrder.slice(0, 4).flatMap((k) => splashSources(index.champion(k), { portraits: false })),
    ...splashSources(index.champion(artOrder[0])), // last resort: the carry's small portraits
  ];
  const summary = { boards: comp.n, total: 0, avg: comp.avg, top4: comp.top4, win: comp.win, placements: comp.placements };

  return (
    <div className="space-y-8">
      <DetailHero
        backdrop={backdrop}
        icon={<GradeBadge grade={comp.grade} size="size-16 rounded-xl text-3xl" />}
        title={<CompName name={comp.name} />}
        aside={
          <>
            <ScopeBar scope={result.scope} meta={result.meta} />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={explorerHref} size="sm">
                <FlaskConical className="size-4" aria-hidden />
                Explore these boards
              </ButtonLink>
              <ButtonLink href={builderHref} size="sm" variant="primary">
                <Hexagon className="size-4" aria-hidden />
                Open in builder
              </ButtonLink>
            </div>
          </>
        }
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {comp.traits.map((t) => <TraitBadge key={t.id} id={t.id} tier={t.tier} count={t.count} size={26} showName />)}
        </div>
      </DetailHero>

      <SummaryTiles summary={summary} playRate={comp.freq} />

      <TypicalBoardPanel units={comp.units}>
        <div className="flex flex-wrap content-start gap-x-4 gap-y-6">
          {comp.units.map((u) => (
            <div key={u.id} className="flex w-[74px] flex-col items-center gap-1.5">
              {/* Same height with or without items, so the names underneath line up. */}
              <div className="flex h-[70px] items-start justify-center">
                <ChampionIcon id={u.id} size="lg" star={u.star} items={u.items} />
              </div>
              <span className="w-full truncate text-center text-[11px] text-lichen">{index.champion(u.id)?.name}</span>
              <span className="h-1 w-12 overflow-hidden rounded-full bg-bark">
                <span className="block h-full rounded-full bg-wisp/70" style={{ width: `${Math.round(u.freq * 100)}%` }} />
              </span>
              <span className="num text-[11px] text-fog">{fmt.pct(u.freq, 0)}</span>
            </div>
          ))}
        </div>
      </TypicalBoardPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {carry && (
          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <ChampionIcon id={carry.key} size="xs" link={false} />
                {carry.name} items
              </span>
            }
            flush
          >
            <EntityTable kind="item" rows={result.carryItems} minN={Math.max(3, Math.round(comp.n * 0.03))} freqLabel="Held" limit={10} defaultSort="freq" />
          </Panel>
        )}
        <div className="space-y-6">
          {result.carryBuilds.length > 0 && (
            <Panel title="Carry builds" flush>
              <ul>
                {result.carryBuilds.map((b) => (
                  <li key={b.items.join('+')} className="flex items-center gap-3 border-t hairline px-4 py-3 first:border-t-0 sm:px-5">
                    <span className="flex gap-1">
                      {b.items.map((it, i) => <ItemIcon key={`${it}-${i}`} id={it} px={32} />)}
                    </span>
                    <span className="ml-auto grid grid-cols-3 gap-4 text-right text-sm">
                      <AvgPlace value={b.avg} />
                      <span className="num text-lichen">{fmt.pct(b.top4, 0)}</span>
                      <span className="num text-fog">{fmt.int(b.n)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Final level" flush>
            <EntityTable kind="level" rows={result.levels.filter((l) => Number(l.id) > 0)} defaultSort="name" freqLabel="Share" link={false} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
