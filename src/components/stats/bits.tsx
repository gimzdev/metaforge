import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { BoardButton } from '@/components/game/board-button';
import { AugmentIcon, ChampionIcon, ItemIcon, Stars, TraitBadge } from '@/components/game/entities';
import { costColor, currentIndex, traitKindLabel } from '@/lib/static';
import { ITEM_CATEGORY_LABEL } from '@/lib/static/types';
import type { CompRow, Summary, Tier } from '@/lib/stats/types';
import { cn, deltaTone, fmt, placementTone, toneText } from '@/lib/utils';

/** Small stat displays shared by server pages and the client apps (no hooks). */

export function AvgPlace({ value, className }: { value: number; className?: string }) {
  return <span className={cn('num font-semibold', toneText[placementTone(value)], className)}>{fmt.place(value)}</span>;
}

export function Delta({ value, className }: { value: number; className?: string }) {
  return <span className={cn('num text-[13px]', deltaTone(value), className)}>{fmt.delta(value)}</span>;
}

export function Pct({ value, className, digits = 1 }: { value: number; className?: string; digits?: number }) {
  return <span className={cn('num', className)}>{fmt.pct(value, digits)}</span>;
}

const PLACE_COLOR = ['firefly', 'good', 'good', 'good', 'fog', 'fog', 'fog', 'bloom'].map((c) => `var(--color-${c})`);

/** Eight bars: share of 1st…8th finishes. */
export function PlacementBars({ placements, className, height = 36, labels = false }: { placements: number[]; className?: string; height?: number; labels?: boolean }) {
  const total = placements.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...placements, 1);
  // The bars' tooltips reach a mouse only: screen readers get the shares as the picture's label.
  const summary = placements.map((v, i) => `${fmt.ordinal(i + 1)} ${fmt.pct(v / total)}`).join(', ');
  return (
    <div className={cn('flex items-end gap-[3px]', className)} role="img" aria-label={`Placements: ${summary}`}>
      {placements.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-end" style={{ height }}>
            <div
              title={`${fmt.ordinal(i + 1)}: ${fmt.pct(v / total)}`}
              className="w-full rounded-t-[3px] opacity-90"
              style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: PLACE_COLOR[i] }}
            />
          </div>
          {labels && <span className="num text-[10px] text-fog">{i + 1}</span>}
        </div>
      ))}
    </div>
  );
}

export function FreqBar({ value, max = 1, className }: { value: number; max?: number; className?: string }) {
  const width = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="num w-12 text-right">{fmt.pct(value, value < 0.1 ? 1 : 0)}</span>
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-bark sm:block">
        <span className="block h-full rounded-full bg-lichen/60" style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

export const GRADE_TEXT: Record<Tier, string> = { S: 'text-tier-s', A: 'text-tier-a', B: 'text-tier-b', C: 'text-tier-c', D: 'text-tier-d' };
const GRADE_STYLE: Record<Tier, string> = { S: 'bg-tier-s text-night', A: 'bg-tier-a text-night', B: 'bg-tier-b text-night', C: 'bg-tier-c text-night', D: 'bg-tier-d text-night' };

/** Letter grade tile; `size` replaces the default size, corner and text size. */
export function GradeBadge({ grade, size = 'size-8 rounded-md text-[17px]' }: { grade: Tier | null; size?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center font-display font-semibold', grade ? GRADE_STYLE[grade] : 'bg-bark text-fog', size)}
      title={grade ? `${grade} tier` : 'Not enough games yet'}
    >
      {grade ?? '–'}
    </span>
  );
}

/** Headline numbers for a set of boards. */
export function SummaryTiles({ summary, playRate, playLabel = 'Play rate' }: { summary: Summary; playRate?: number; playLabel?: string }) {
  const tiles: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Average place', value: fmt.place(summary.avg), tone: toneText[placementTone(summary.avg)] },
    { label: 'Top 4 rate', value: fmt.pct(summary.top4) },
    { label: 'Win rate', value: fmt.pct(summary.win) },
    playRate !== undefined ? { label: playLabel, value: fmt.pct(playRate, playRate < 0.1 ? 1 : 0) } : { label: 'Games', value: fmt.int(summary.boards) },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border hairline bg-lichen/10 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]">
      {tiles.map((t) => (
        <div key={t.label} className="bg-canopy px-4 py-3.5">
          <div className="text-xs text-lichen">{t.label}</div>
          <div className={cn('num mt-1 font-display text-[1.6rem] leading-none', t.tone)}>{t.value}</div>
        </div>
      ))}
      <div className="col-span-2 bg-canopy px-4 py-3 md:col-span-1">
        <div className="flex justify-between text-xs text-lichen">
          <span>Placements</span>
          {playRate !== undefined && <span className="num text-fog">{fmt.int(summary.boards)} games</span>}
        </div>
        <PlacementBars placements={summary.placements} height={30} labels className="mt-1.5" />
      </div>
    </div>
  );
}

export type EntityKind = 'unit' | 'item' | 'trait' | 'aug' | 'level';

function Named({ icon, name, sub, subStyle = 'text-fog', color }: { icon: ReactNode; name: ReactNode; sub: ReactNode; subStyle?: string; color?: string }) {
  return (
    <span className="flex items-center gap-3">
      {icon}
      <span className="min-w-0 max-w-[9.5rem] @md:max-w-[15rem] @3xl:max-w-none">
        <span className="block truncate font-medium text-moon">{name}</span>
        <span className={cn('block text-xs', subStyle)} style={color ? { color } : undefined}>
          {sub}
        </span>
      </span>
    </span>
  );
}

/** Icon + name + subtitle for a stats row. */
export function EntityCell({ kind, id, tier }: { kind: EntityKind; id: string; tier?: number }) {
  const index = currentIndex();
  if (kind === 'unit') {
    const c = index.champion(id);
    if (!c) return <span className="text-fog">{id}</span>;
    return <Named icon={<ChampionIcon id={id} size="sm" link={false} />} name={c.name} sub={`${c.cost}-cost`} subStyle="" color={costColor(c.cost)} />;
  }
  if (kind === 'item') {
    const i = index.item(id);
    if (!i) return <span className="text-fog">{id}</span>;
    return <Named icon={<ItemIcon id={id} size="sm" link={false} />} name={i.name} sub={ITEM_CATEGORY_LABEL[i.category]} />;
  }
  if (kind === 'trait') {
    const t = index.trait(id);
    if (!t) return <span className="text-fog">{id}</span>;
    const units = tier ? t.effects[tier - 1]?.minUnits : undefined;
    return (
      <Named
        icon={<TraitBadge id={id} tier={tier ?? 1} size={30} link={false} showCount={false} />}
        name={
          <>
            {units !== undefined && <span className="num mr-1.5 text-lichen">{units}</span>}
            {t.name}
          </>
        }
        sub={traitKindLabel(t)}
        subStyle="capitalize text-fog"
      />
    );
  }
  if (kind === 'aug') {
    const a = index.augment(id);
    const tier = a && a.tier !== 'unknown' ? a.tier : 'augment';
    return <Named icon={<AugmentIcon id={id} px={30} />} name={a?.name ?? id} sub={tier} subStyle="capitalize text-fog" />;
  }
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-[30px] place-items-center rounded-md bg-bark text-sm font-semibold">{id}</span>
      <span className="font-medium text-moon">Level {id}</span>
    </span>
  );
}

/** Row labels for star levels, item counts and trait breakpoints. */
export function StarLabel({ star }: { star: number }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-[30px] w-10 place-items-center rounded-lg bg-bark text-sm">
        {star >= 2 ? <Stars star={star} className="text-sm" /> : <span className="text-[#b8a58a]">★</span>}
      </span>
      <span className="font-medium text-moon">{star}-star</span>
    </span>
  );
}

type AnyComp = CompRow & { grade?: Tier | null };

/** A comp name for serif headings: the display face's ampersand is a flourish, so it gets the text face's. */
export function CompName({ name }: { name: string }) {
  return (
    <>
      {name.split('&').map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="font-sans text-[0.78em] font-normal">&amp;</span>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse lg:items-end">
      <dt className="mt-1.5 text-[11px] leading-none text-fog">{label}</dt>
      <dd className="num text-[15px] font-semibold leading-none text-moon">{children}</dd>
    </div>
  );
}

/**
 * One comp as a card linking to its page; phones stack it, wide screens put everything on one line. With `onToggleBoard` the
 * row gets a Positioning button that swaps its stats for `board` (the recommended board) and back.
 */
export function CompRowCard({
  comp,
  showGrade = false,
  board,
  onToggleBoard,
}: {
  comp: AnyComp;
  showGrade?: boolean;
  board?: ReactNode;
  onToggleBoard?: () => void;
}) {
  const index = currentIndex();
  const traits = comp.traits
    .slice(0, 4)
    .map((t) => {
      const trait = index.trait(t.id);
      return trait ? `${t.count ?? trait.effects[t.tier - 1]?.minUnits ?? ''} ${trait.name}`.trim() : null;
    })
    .filter(Boolean)
    .join(' · ');
  const showBoard = Boolean(board);
  return (
    <Link
      href={`/comps/${comp.id}`}
      aria-label={`${comp.name}: ${fmt.place(comp.avg)} average place, ${fmt.pct(comp.top4, 0)} top 4`}
      className={cn(
        'surface group/comp grid rounded-xl px-4 py-4 transition-colors hover:border-lichen/35 sm:px-5',
        'grid-cols-[minmax(0,1fr)_auto] gap-x-4',
        showBoard
          ? "[grid-template-areas:'name_toggle'_'units_units'_'board_board']"
          : "[grid-template-areas:'name_bars'_'units_units'_'stats_toggle']",
        onToggleBoard
          ? showBoard
            ? "lg:grid-cols-[13rem_minmax(0,1fr)_auto_auto_auto] lg:items-center lg:gap-x-8 lg:[grid-template-areas:'name_units_board_board_toggle']"
            : "lg:grid-cols-[13rem_minmax(0,1fr)_auto_auto_auto] lg:items-center lg:gap-x-8 lg:[grid-template-areas:'name_units_stats_bars_toggle']"
          : "lg:grid-cols-[13rem_minmax(0,1fr)_auto_auto] lg:items-center lg:gap-x-8 lg:[grid-template-areas:'name_units_stats_bars']",
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
        <p className="mt-1.5 truncate text-[13px] text-fog">{traits}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-1 gap-y-4 pt-1.5 [grid-area:units] lg:mt-0">
        {comp.units.map((u) => (
          <ChampionIcon key={u.id} id={u.id} size="ml" star={u.star} items={u.items} link={false} even />
        ))}
      </div>

      {showBoard ? (
        <div className="mt-4 min-w-0 [grid-area:board] lg:mt-0">{board}</div>
      ) : (
        <>
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
        </>
      )}

      {onToggleBoard && (
        <div className="mt-4 self-center justify-self-end [grid-area:toggle] lg:mt-0">
          <BoardButton open={showBoard} onClick={onToggleBoard} />
        </div>
      )}
    </Link>
  );
}

/** Compact one-line comp, for dense lists (the explorer). */
export function CompLine({ comp, actions }: { comp: AnyComp; actions?: ReactNode }) {
  return (
    <div className="group relative flex items-center gap-3 border-t hairline px-4 py-3 transition-colors first:border-t-0 hover:bg-white/[0.03]">
      {comp.grade !== undefined && <GradeBadge grade={comp.grade} size="size-7 rounded-md text-sm" />}
      {/* Fixed width once the board shows (sm and up); on phones it takes what is left, or the row overflows 360 px. */}
      <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
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

export function CompLineHeader() {
  return (
    <div className="flex items-center gap-3 bg-canopy px-4 py-2.5 text-xs text-lichen">
      <span className="min-w-0 flex-1 sm:w-52 sm:flex-none">Comp</span>
      <span className="hidden flex-1 md:block">Typical board</span>
      <span className="ml-auto grid shrink-0 grid-cols-[3.5rem_3.5rem] gap-2 text-right sm:grid-cols-[3.5rem_3.5rem_3.5rem_4rem]">
        <span>Avg</span>
        <span>Top 4</span>
        <span className="hidden sm:block">Play rate</span>
        <span className="hidden sm:block">Games</span>
      </span>
      <span className="w-8 shrink-0" />
    </div>
  );
}
