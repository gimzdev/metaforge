'use client';

import Link from 'next/link';
import { useStatic } from '@/components/providers';
import { ChampionIcon } from '@/components/game/entities';
import { AvgPlace, PlacementBars } from '@/components/stats/bits';
import type { StaticIndex } from '@/lib/static-index';
import type { CompRow, Tier } from '@/lib/stats/types';
import { cn, fmt } from '@/lib/utils';

type AnyComp = CompRow & { grade?: Tier | null };

const GRADE_TEXT: Record<Tier, string> = {
  S: 'text-tier-s',
  A: 'text-tier-a',
  B: 'text-tier-b',
  C: 'text-tier-c',
  D: 'text-tier-d',
};

function traitLine(comp: AnyComp, index: StaticIndex) {
  return comp.traits
    .slice(0, 4)
    .map((t) => {
      const trait = index.trait(t.id);
      if (!trait) return null;
      const units = t.count ?? trait.effects[t.tier - 1]?.minUnits;
      return `${units ?? ''} ${trait.name}`.trim();
    })
    .filter(Boolean)
    .join(' · ');
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse lg:items-end">
      <dt className="mt-1.5 text-[11px] leading-none text-fog">{label}</dt>
      <dd className="num text-[15px] font-semibold leading-none text-moon">{children}</dd>
    </div>
  );
}

/**
 * One comp as one quiet card that links to the comp page: what it is (name, core
 * traits in words), the board it usually fields with the carries' items, four numbers
 * and how its placements spread from 1st to 8th. Same layout for every comp, so a
 * list of them reads at a glance while scrolling.
 *
 * Phones stack it (name and placements, then the board, then the numbers); wide
 * screens put everything on one line.
 */
export function CompRowCard({ comp, showGrade = false }: { comp: AnyComp; showGrade?: boolean }) {
  const index = useStatic();
  return (
    <Link
      href={`/comps/${comp.id}`}
      aria-label={`${comp.name}: ${fmt.place(comp.avg)} average place, ${fmt.pct(comp.top4, 0)} top 4`}
      className={cn(
        'surface group/comp grid rounded-xl px-4 py-4 transition-colors hover:border-lichen/35 sm:px-5',
        "grid-cols-[minmax(0,1fr)_auto] gap-x-4 [grid-template-areas:'name_bars'_'units_units'_'stats_stats']",
        "lg:grid-cols-[13rem_minmax(0,1fr)_auto_auto] lg:items-center lg:gap-x-8 lg:[grid-template-areas:'name_units_stats_bars']",
      )}
    >
      <div className="min-w-0 [grid-area:name]">
        <h3 className="flex min-w-0 items-baseline gap-2.5 text-[16px] font-semibold leading-tight text-moon">
          {showGrade && comp.grade && (
            <span className={cn('font-display text-[17px] leading-none', GRADE_TEXT[comp.grade])} title={`${comp.grade} tier`}>
              {comp.grade}
            </span>
          )}
          <span className="truncate transition-colors group-hover/comp:text-wisp">{comp.name}</span>
        </h3>
        <p className="mt-1.5 truncate text-[13px] text-fog">{traitLine(comp, index)}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-1 gap-y-4 pt-1.5 [grid-area:units] lg:mt-0">
        {comp.units.map((u) => (
          <ChampionIcon key={u.id} id={u.id} size="ml" star={u.star} items={u.items} link={false} even />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-x-4 [grid-area:stats] lg:mt-0 lg:w-[16.5rem]">
        <Figure label="Avg place">
          <AvgPlace value={comp.avg} />
        </Figure>
        <Figure label="Top 4">{fmt.pct(comp.top4, 0)}</Figure>
        <Figure label="Win">{fmt.pct(comp.win, 1)}</Figure>
        <Figure label="Played">{fmt.pct(comp.freq, comp.freq < 0.1 ? 1 : 0)}</Figure>
      </dl>

      <div className="self-start [grid-area:bars] lg:self-center" title="Share of finishes from 1st (left) to 8th (right)">
        <PlacementBars placements={comp.placements} height={26} className="w-24" />
        <div className="mt-1.5 flex justify-between text-[10px] leading-none text-fog">
          <span>1st</span>
          <span>8th</span>
        </div>
      </div>
    </Link>
  );
}
