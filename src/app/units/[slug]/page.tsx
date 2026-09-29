import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlaskConical, Hexagon } from 'lucide-react';
import { CompRowCard } from '@/components/comps/comp-row';
import { ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { RichText } from '@/components/game/rich-text';
import { DetailHero } from '@/components/layout/detail-hero';
import { AvgPlace } from '@/components/stats/bits';
import { EntityTable } from '@/components/stats/entity-table';
import { NoStatsNotice } from '@/components/stats/no-data';
import { ScopeBar } from '@/components/stats/scope-bar';
import { SummaryTiles } from '@/components/stats/summary-tiles';
import { ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/primitives';
import { autoPlace, encodeBoard } from '@/lib/builder';
import { getStaticData } from '@/lib/cdragon';
import { scopeFrom, type SearchParams } from '@/lib/search-params';
import { costColor, indexStatic } from '@/lib/static-index';
import { encodeFilters } from '@/lib/stats/filters';
import { getUnitStats } from '@/lib/stats/service';
import { fmt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const c = indexStatic(await getStaticData()).champion(slug);
  if (!c) return { title: 'Champion not found' };
  return {
    title: c.name,
    description: `Items, builds, star levels and comps for ${c.name} in TFT from ranked games.`,
  };
}

function StatLine({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between border-t hairline py-2 text-sm first:border-t-0">
      <span className="text-lichen">{label}</span>
      <span className="num font-medium text-moon">{value}</span>
    </div>
  );
}

export default async function UnitPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await getStaticData();
  const index = indexStatic(data);
  const c = index.champion(slug);
  if (!c) notFound();

  const stats = await getUnitStats(c.key, scopeFrom(sp));
  const hasStats = stats.meta.total > 0 && stats.summary.boards > 0;
  const playRate = stats.total ? stats.summary.boards / stats.total : 0;
  const topBuild = stats.builds.filter((b) => b.n >= 5).sort((a, b) => a.avg - b.avg)[0] ?? stats.builds[0];
  const builderHref = `/builder?b=${encodeBoard(autoPlace([{ key: c.key, star: 2, items: topBuild?.items ?? [] }], index))}`;
  const explorerHref = `/explorer?f=${encodeFilters([{ k: 'unit', id: c.key }])}`;
  const itemMin = Math.max(3, Math.round(stats.summary.boards * 0.01));
  const s = c.stats;

  return (
    <div className="space-y-8">
      <DetailHero
        backdrop={c.splash}
        icon={
          <span
            className="block rounded-xl p-[3px]"
            style={{ background: `linear-gradient(160deg, ${costColor(c.cost)}, transparent)` }}
          >
            <GameImage src={c.tile ?? c.icon} alt={c.name} className="size-24 rounded-[19px] sm:size-28" eager />
          </span>
        }
        kicker={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-night/70 px-2.5 py-0.5 text-xs font-semibold" style={{ color: costColor(c.cost) }}>
              <span className="size-1.5 rounded-full" style={{ background: costColor(c.cost) }} />
              {c.cost}-cost
            </span>
            {c.role && <span className="capitalize">{c.role.replace(/[_-]/g, ' ').toLowerCase()}</span>}
          </>
        }
        title={c.name}
        aside={
          <>
            <ScopeBar scope={stats.scope} meta={stats.meta} />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={explorerHref} size="sm">
                <FlaskConical className="size-4" aria-hidden />
                Explore boards
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
          {c.traits.map((t) => (
            <TraitBadge key={t} id={t} tier={1} size={28} showName showCount={false} />
          ))}
        </div>
      </DetailHero>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {hasStats ? (
            <SummaryTiles summary={stats.summary} playRate={playRate} />
          ) : (
            <NoStatsNotice what={`${c.name} stats`} />
          )}

          {hasStats && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Panel title="By star level" flush>
                <EntityTable kind="star" rows={stats.stars} defaultSort="name" freqLabel="Share" showDelta={false} link={false} />
              </Panel>
              <Panel title="By items held" flush>
                <EntityTable kind="count" rows={stats.itemCounts} defaultSort="name" freqLabel="Share" showDelta={false} link={false} />
              </Panel>
            </div>
          )}

          {hasStats && (
            <Panel title="Best items" aside={<span className="text-xs">Share of boards where {c.name} holds it</span>} flush>
              <EntityTable kind="item" rows={stats.items} minN={itemMin} freqLabel="Held" limit={15} />
            </Panel>
          )}

          {hasStats && stats.builds.length > 0 && (
            <Panel title="Full builds" aside={<span className="text-xs">Three-item sets, most played first</span>} flush>
              <ul>
                {stats.builds.slice(0, 10).map((b) => (
                  <li key={b.items.join('+')} className="flex items-center gap-4 border-t hairline px-4 py-3 first:border-t-0 sm:px-5">
                    <span className="flex gap-1">
                      {b.items.map((it, i) => (
                        <ItemIcon key={`${it}-${i}`} id={it} px={34} />
                      ))}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-sm text-lichen md:block">
                      {b.items.map((it) => index.item(it)?.name ?? it).join(', ')}
                    </span>
                    <span className="ml-auto grid grid-cols-3 gap-4 text-right text-sm">
                      <AvgPlace value={b.avg} />
                      <span className="num text-lichen">{fmt.pct(b.top4, 0)}</span>
                      <span className="num text-fog">{fmt.int(b.n)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-4 border-t hairline px-5 py-2 text-[11px] text-fog">
                <span>avg place, top 4, games</span>
              </div>
            </Panel>
          )}
        </div>

        <aside className="space-y-6">
          <Panel title={c.ability.name || 'Ability'}>
            <div className="flex gap-3">
              {c.ability.icon && <GameImage src={c.ability.icon} alt={c.ability.name} className="size-11 shrink-0 rounded-xl" />}
              <div className="text-sm text-lichen">
                <RichText value={c.ability.desc} />
              </div>
            </div>
            {(s.mana !== null || s.initialMana !== null) && (
              <div className="mt-3 text-xs text-fog">
                Mana {s.initialMana ?? 0} / {s.mana ?? '?'}
              </div>
            )}
          </Panel>
          <Panel title="Base stats" bodyClassName="px-4 py-2 sm:px-5">
            <StatLine label="Health" value={s.hp !== null ? fmt.int(s.hp) : null} />
            <StatLine label="Attack damage" value={s.damage !== null ? fmt.int(s.damage) : null} />
            <StatLine label="Attack speed" value={s.attackSpeed !== null ? s.attackSpeed.toFixed(2) : null} />
            <StatLine label="Armor" value={s.armor} />
            <StatLine label="Magic resist" value={s.magicResist} />
            <StatLine label="Range" value={s.range !== null ? `${s.range} hex${s.range === 1 ? '' : 'es'}` : null} />
            <StatLine label="Crit chance" value={s.critChance !== null ? fmt.pct(s.critChance, 0) : null} />
          </Panel>
          <Panel title="Traits" bodyClassName="space-y-3">
            {c.traits.map((t) => {
              const trait = index.trait(t);
              if (!trait) return null;
              return (
                <Link key={t} href={`/traits/${trait.slug}`} className="block rounded-xl p-2 hover:bg-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <TraitBadge id={t} tier={trait.effects.length} size={24} link={false} hover={false} showCount={false} />
                    <span className="font-medium">{trait.name}</span>
                    <span className="ml-auto text-xs text-fog">{trait.effects.map((e) => e.minUnits).join(' / ')}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {trait.champions
                      .filter((k) => k.toLowerCase() !== c.key)
                      .slice(0, 10)
                      .map((k) => (
                        <ChampionIcon key={k} id={k} size="xs" link={false} />
                      ))}
                  </div>
                </Link>
              );
            })}
          </Panel>
        </aside>
      </div>

      {stats.comps.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Comps with {c.name}</h2>
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
