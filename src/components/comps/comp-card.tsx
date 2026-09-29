import Link from 'next/link';
import { ChampionIcon, TraitBadge } from '@/components/game/entities';
import { AvgPlace, GradeBadge } from '@/components/stats/bits';
import type { CompRow, Tier } from '@/lib/stats/types';
import { cn, fmt } from '@/lib/utils';

type AnyComp = CompRow & { grade?: Tier | null };

/** Compact one-line comp, for dense lists. */
export function CompLine({
  comp,
  className,
  actions,
}: {
  comp: AnyComp;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 border-t hairline px-4 py-3 transition-colors first:border-t-0 hover:bg-white/[0.03]',
        className,
      )}
    >
      {comp.grade !== undefined && <GradeBadge grade={comp.grade} className="size-7 text-sm" />}
      <div className="w-44 min-w-0 shrink-0 sm:w-52">
        <Link href={`/comps/${comp.id}`} className="block truncate text-sm font-semibold text-moon after:absolute after:inset-0 group-hover:text-wisp">
          {comp.name}
        </Link>
        <div className="relative z-10 mt-1 flex gap-1.5">
          {comp.traits.slice(0, 4).map((t) => (
            <TraitBadge key={t.id} id={t.id} tier={t.tier} count={t.count} size={18} />
          ))}
        </div>
      </div>
      <div className="relative z-10 hidden min-w-0 flex-1 gap-1 overflow-hidden md:flex">
        {comp.units.slice(0, 8).map((u) => (
          <ChampionIcon key={u.id} id={u.id} size="md" star={u.star} items={u.items} even />
        ))}
      </div>
      <div className="ml-auto grid shrink-0 grid-cols-[3.5rem_3.5rem] gap-2 text-right sm:grid-cols-[3.5rem_3.5rem_3.5rem_4rem]">
        <AvgPlace value={comp.avg} />
        <span className="num text-sm text-lichen">{fmt.pct(comp.top4, 0)}</span>
        <span className="num hidden text-sm text-lichen sm:block">{fmt.pct(comp.freq, 1)}</span>
        <span className="num hidden text-sm text-fog sm:block">{fmt.int(comp.n)}</span>
      </div>
      {actions && <div className="relative z-10 shrink-0">{actions}</div>}
    </div>
  );
}

export function CompLineHeader({ withGrade, withActions }: { withGrade?: boolean; withActions?: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-canopy px-4 py-2.5 text-xs text-lichen">
      {withGrade && <span className="w-7 shrink-0" />}
      <span className="w-44 shrink-0 sm:w-52">Comp</span>
      <span className="hidden flex-1 md:block">Typical board</span>
      <span className="ml-auto grid shrink-0 grid-cols-[3.5rem_3.5rem] gap-2 text-right sm:grid-cols-[3.5rem_3.5rem_3.5rem_4rem]">
        <span>Avg</span>
        <span>Top 4</span>
        <span className="hidden sm:block">Play rate</span>
        <span className="hidden sm:block">Games</span>
      </span>
      {withActions && <span className="w-8 shrink-0" />}
    </div>
  );
}
