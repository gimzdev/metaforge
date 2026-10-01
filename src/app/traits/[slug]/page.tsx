import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlaskConical } from '@/components/icons';
import { TraitHex } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { RichText } from '@/components/game/rich-text';
import { AvgPlace, CompRowCard, SummaryTiles } from '@/components/stats/bits';
import { NoStatsNotice } from '@/components/stats/no-data';
import { EntityTable, ScopeBar } from '@/components/stats/table';
import { ButtonLink, DetailHero, Panel } from '@/components/ui';
import { scopeFrom, type SearchParams } from '@/lib/search-params';
import { costColor, indexStatic, styleFor, traitKindLabel } from '@/lib/static';
import { getStaticData } from '@/lib/static/load';
import { encodeFilters } from '@/lib/stats/filters';
import { getTraitStats } from '@/lib/stats/service';
import { cn, fmt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const t = indexStatic(await getStaticData()).trait(slug);
  if (!t) return { title: 'Trait not found' };
  return {
    title: t.name,
    description: `${t.name} breakpoints, champions, and comps in TFT with results from ranked games.`,
  };
}

export default async function TraitPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const index = indexStatic(await getStaticData());
  const trait = index.trait(slug);
  if (!trait) notFound();

  const stats = await getTraitStats(trait.key, scopeFrom(sp));
  const hasStats = stats.meta.total > 0 && stats.summary.boards > 0;
  const playRate = stats.total ? stats.summary.boards / stats.total : 0;
  const tierStats = new Map(stats.tiers.map((r) => [Number(r.id), r]));
  const unitStats = new Map(stats.units.map((r) => [r.id, r]));
  const members = trait.champions
    .map((k) => index.champion(k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  const memberKeys = new Set(members.map((m) => m.key));
  const companions = stats.units.filter((u) => !memberKeys.has(u.id));
  const minN = Math.max(3, Math.round(stats.summary.boards * 0.01));

  return (
    <div className="space-y-8">
      <DetailHero
        icon={<TraitHex trait={trait} style={styleFor(trait, trait.effects.length)} px={96} />}
        kicker={<span className="capitalize">{traitKindLabel(trait)}</span>}
        title={trait.name}
        aside={
          <>
            <ScopeBar scope={stats.scope} meta={stats.meta} />
            <ButtonLink href={`/explorer?f=${encodeFilters([{ k: 'trait', id: trait.key }])}`} size="sm">
              <FlaskConical className="size-4" aria-hidden />
              Explore boards
            </ButtonLink>
          </>
        }
      >
        {trait.desc.length > 0 && (
          <p className="max-w-2xl text-[15px] text-lichen">
            <RichText value={trait.desc} />
          </p>
        )}
      </DetailHero>

      {hasStats ? <SummaryTiles summary={stats.summary} playRate={playRate} playLabel="Active on" /> : <NoStatsNotice what={`${trait.name} stats`} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Breakpoints" flush>
          <ul>
            {trait.effects.map((e, i) => {
              const row = tierStats.get(i + 1);
              return (
                <li key={e.minUnits} className="flex gap-4 border-t hairline px-4 py-4 first:border-t-0 sm:px-5">
                  <span className="num grid size-10 shrink-0 place-items-center rounded-lg bg-bark text-base font-semibold" style={{ color: `var(--color-style-${e.style})` }}>
                    {e.minUnits}
                  </span>
                  <div className="min-w-0 flex-1 text-sm text-lichen">
                    <RichText value={e.desc} />
                  </div>
                  {row && (
                    <div className="shrink-0 text-right">
                      <AvgPlace value={row.avg} className="text-base" />
                      <div className="num text-[11px] text-fog">{fmt.pct(stats.total ? row.n / stats.total : 0, 1)} of boards</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Champions" bodyClassName="p-4 sm:p-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {members.map((c) => {
            const row = unitStats.get(c.key);
            return (
              <Link key={c.key} href={`/units/${c.slug}`} className="flex items-center gap-2.5 rounded-xl p-2 transition hover:bg-white/[0.04]">
                <span className="rounded-lg p-[2px]" style={{ background: costColor(c.cost) }}>
                  <GameImage src={c.icon} alt={c.name} px={40} className="size-10 rounded-[7px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className={cn('num block text-xs', row ? 'text-lichen' : 'text-fog')}>
                    {row ? `${fmt.place(row.avg)} avg, ${fmt.pct(row.freq, 0)}` : `${c.cost}-cost`}
                  </span>
                </span>
              </Link>
            );
          })}
        </Panel>
      </div>

      {hasStats && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel title="Results by breakpoint" flush>
            <EntityTable kind="tier" rows={stats.tiers} traitKey={trait.key} defaultSort="name" freqLabel="Share" showDelta link={false} />
          </Panel>
          <Panel title="Best companions" aside={<span className="text-xs">Non-{trait.name} units fielded alongside</span>} flush>
            <EntityTable kind="unit" rows={companions} minN={minN} freqLabel="Fielded" limit={10} />
          </Panel>
        </div>
      )}

      {stats.comps.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{trait.name} comps</h2>
          <div className="space-y-2.5">
            {stats.comps.slice(0, 6).map((comp) => (
              <CompRowCard key={comp.id} comp={comp} showGrade />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
