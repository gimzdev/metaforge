'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Crown, Flame, Medal, Sprout, Trophy } from '@/components/icons';
import { ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { BoardPreview } from '@/components/game/board-preview';
import { GameImage } from '@/components/game/game-image';
import { AvgPlace, CompRowCard, GRADE_TEXT } from '@/components/stats/bits';
import { ScopeBar } from '@/components/stats/table';
import { Chip, Segmented } from '@/components/ui';
import { currentIndex } from '@/lib/static';
import type { ItemCategory } from '@/lib/static/types';
import type { MetaViewData, TierRow } from '@/lib/stats/service';
import { gradeRows, itemMinSample, type Highlight } from '@/lib/stats/tiers';
import type { Tier, TieredComp } from '@/lib/stats/types';
import { cn, fmt, traitOf } from '@/lib/utils';

const GRADES: Tier[] = ['S', 'A', 'B', 'C', 'D'];
const GRADE_BG: Record<Tier, string> = { S: 'bg-tier-s/12', A: 'bg-tier-a/12', B: 'bg-tier-b/12', C: 'bg-tier-c/12', D: 'bg-tier-d/12' };
const GRADE_BLURB: Record<Tier, string> = {
  S: 'Best results this patch',
  A: 'Reliable top 4',
  B: 'Fine when it comes together',
  C: 'Situational',
  D: 'Struggling',
};

type ListKind = 'units' | 'items' | 'traits' | 'augments';
const ITEM_KINDS: Array<{ id: ItemCategory; label: string }> = [
  { id: 'completed', label: 'Completed' },
  { id: 'artifact', label: 'Artifacts' },
  { id: 'emblem', label: 'Emblems' },
  { id: 'radiant', label: 'Radiant' },
];

/** Name and page of a tier-list or standout entry; undefined when the static data does not know it. */
function entry(kind: ListKind, id: string, tier?: number): { name: string; href?: string } | undefined {
  const index = currentIndex();
  if (kind === 'units') {
    const c = index.champion(id);
    return c && { name: c.name, href: `/units/${c.slug}` };
  }
  if (kind === 'items') {
    const it = index.item(id);
    return it && { name: it.name, href: `/items/${it.slug}` };
  }
  if (kind === 'traits') {
    const t = index.trait(traitOf(id));
    return t && { name: `${t.effects[(tier ?? 1) - 1]?.minUnits ?? ''} ${t.name}`.trim(), href: `/traits/${t.slug}` };
  }
  return { name: index.augment(id)?.name ?? id };
}

function Tile({ kind, row }: { kind: ListKind; row: TierRow }) {
  const e = entry(kind, row.id, row.tier);
  if (!e) return null;
  const { name, href } = e;
  const icon =
    kind === 'units' ? (
      <ChampionIcon id={row.id} size="lg" link={false} />
    ) : kind === 'items' ? (
      <ItemIcon id={row.id} px={52} link={false} />
    ) : kind === 'traits' ? (
      <TraitBadge id={traitOf(row.id)} tier={row.tier} size={48} link={false} showCount={false} />
    ) : (
      <GameImage src={currentIndex().augment(row.id)?.icon} alt={name} className="size-[52px] rounded-xl" />
    );
  const body = (
    <>
      {icon}
      <span className="mt-1 w-full truncate text-center text-[11px] text-lichen">{name}</span>
      <AvgPlace value={row.avg} className="text-xs" />
    </>
  );
  const cls = 'group flex w-[74px] flex-col items-center rounded-xl px-1 py-2 transition hover:bg-white/[0.04]';
  return href ? (
    <Link href={href} className={cls} title={`${name}: ${fmt.place(row.avg)} avg from ${fmt.int(row.n)} games`}>
      {body}
    </Link>
  ) : (
    <div className={cls} title={`${name}: ${fmt.place(row.avg)} avg`}>
      {body}
    </div>
  );
}

function TierList({ kind, rows }: { kind: ListKind; rows: TierRow[] }) {
  const graded = rows.filter((r) => r.grade);
  if (!graded.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-lichen">
        Not enough games yet to grade these. Check back after the next collection run.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border hairline">
      {GRADES.map((g) => {
        const list = graded.filter((r) => r.grade === g);
        if (!list.length) return null;
        return (
          <div key={g} className="flex border-t hairline first:border-t-0">
            <div className={cn('flex w-16 shrink-0 flex-col items-center justify-center gap-1 sm:w-24', GRADE_BG[g])}>
              <span className={cn('font-display text-3xl font-semibold', GRADE_TEXT[g])}>{g}</span>
              <span className="hidden px-2 text-center text-[10px] leading-tight text-lichen sm:block">{GRADE_BLURB[g]}</span>
            </div>
            <div className="flex flex-1 flex-wrap gap-0.5 p-2">
              {list.map((r) => <Tile key={r.id} kind={kind} row={r} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const HIGHLIGHT_META: Record<Highlight['kind'], { label: string; icon: typeof Crown; value: (h: Highlight) => string }> = {
  best: { label: 'Best average', icon: Crown, value: (h) => `${fmt.place(h.row.avg)} avg` },
  top4: { label: 'Best top 4 rate', icon: Medal, value: (h) => `${fmt.pct(h.row.top4)} top 4` },
  win: { label: 'Most wins', icon: Trophy, value: (h) => `${fmt.pct(h.row.win)} wins` },
  popular: { label: 'Most played', icon: Flame, value: (h) => `${fmt.pct(h.row.freq, 0)} of boards` },
  sleeper: { label: 'Sleeper pick', icon: Sprout, value: (h) => `${fmt.place(h.row.avg)} avg at ${fmt.pct(h.row.freq, 1)}` },
};

function HighlightCard({ h, kind }: { h: Highlight; kind: 'units' | 'items' | 'traits' }) {
  const meta = HIGHLIGHT_META[h.kind];
  const e = entry(kind, h.id, h.row.tier);
  const name = e?.name ?? h.id;
  const icon =
    kind === 'units' ? (
      <ChampionIcon id={h.id} size="md" link={false} hover={false} />
    ) : kind === 'items' ? (
      <ItemIcon id={h.id} px={40} link={false} hover={false} />
    ) : (
      <TraitBadge id={traitOf(h.id)} tier={h.row.tier} size={38} link={false} hover={false} showCount={false} />
    );
  return (
    <Link href={e?.href ?? '#'} className="surface flex items-center gap-3 rounded-xl p-3.5 transition-colors hover:border-lichen/40">
      {icon}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] text-lichen">
          <meta.icon className="size-3.5 text-firefly" aria-hidden />
          {meta.label}
        </div>
        <div className="truncate text-sm font-semibold text-moon">{name}</div>
        <div className="num text-xs text-fog">{meta.value(h)}</div>
      </div>
    </Link>
  );
}

function TrendList({ list, up }: { list: Array<[string, number]>; up: boolean }) {
  const index = currentIndex();
  return (
    <div className="surface rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {up ? <ArrowUpRight className="size-4 text-good" /> : <ArrowDownRight className="size-4 text-bloom" />}
        {up ? 'Climbing' : 'Slipping'}
      </div>
      <ul className="space-y-2">
        {list.map(([id, d]) => {
          const c = index.champion(id)!;
          return (
            <li key={id}>
              <Link href={`/units/${c.slug}`} className="flex items-center gap-3 rounded-xl p-1 hover:bg-white/[0.04]">
                <ChampionIcon id={id} size="sm" link={false} hover={false} />
                <span className="flex-1 truncate text-sm">{c.name}</span>
                <span className={cn('num text-sm font-semibold', up ? 'text-good' : 'text-bloom')}>
                  {d > 0 ? '+' : ''}
                  {d.toFixed(2)}
                </span>
              </Link>
            </li>
          );
        })}
        {!list.length && <li className="text-sm text-fog">No big moves.</li>}
      </ul>
    </div>
  );
}

function Trends({ trends, previous, current }: { trends: Record<string, number>; previous: string; current: string }) {
  const index = currentIndex();
  const entries = Object.entries(trends).filter(([id]) => index.champion(id));
  const rising = [...entries].sort((a, b) => a[1] - b[1]).filter(([, d]) => d < -0.05).slice(0, 6);
  const falling = [...entries].sort((a, b) => b[1] - a[1]).filter(([, d]) => d > 0.05).slice(0, 6);
  if (!rising.length && !falling.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Since patch {previous}</h2>
        <p className="mt-1 text-sm text-lichen">Change in average placement from {previous} to {current}. Negative numbers mean better finishes.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TrendList list={rising} up />
        <TrendList list={falling} up={false} />
      </div>
    </section>
  );
}

export function MetaView({ data }: { data: MetaViewData }) {
  const [showAllComps, setShowAllComps] = useState(false);
  // Comps whose row shows the recommended board instead of the stats.
  const [boards, setBoards] = useState<Set<string>>(() => new Set());
  const toggleBoard = (id: string) =>
    setBoards((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [list, setList] = useState<ListKind>('units');
  const [itemKind, setItemKind] = useState<ItemCategory>('completed');
  const [highlightKind, setHighlightKind] = useState<'units' | 'items' | 'traits'>('units');
  const index = currentIndex();

  const graded = data.comps.filter((c) => c.grade);
  const topGrades = graded.filter((c) => c.grade === 'S' || c.grade === 'A' || c.grade === 'B');
  const shownComps: TieredComp[] = showAllComps ? graded : topGrades.length >= 4 ? topGrades : graded.slice(0, 8);

  const itemRows = useMemo(
    () => gradeRows(data.items.filter((r) => index.item(r.id)?.category === itemKind), itemMinSample(data.minN)),
    [data.items, data.minN, index, itemKind],
  );

  const rows: Record<ListKind, TierRow[]> = {
    units: data.units,
    items: itemRows,
    traits: data.traits.filter((r) => index.trait(traitOf(r.id))?.kind !== 'unique'),
    augments: data.augments,
  };

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="sr-only">Meta report</h1>
          <h2 className="text-xl font-semibold tracking-tight">Comps</h2>
          <ScopeBar scope={data.scope} meta={data.meta} />
        </div>
        {!graded.length ? (
          <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-lichen">
            Comps need at least {Math.max(12, data.minN)} games each before they get a grade.
          </div>
        ) : (
          <div className="space-y-8">
            {GRADES.map((g) => {
              const group = shownComps.filter((c) => c.grade === g);
              if (!group.length) return null;
              return (
                <div key={g} className="space-y-2.5">
                  <div className="flex items-baseline gap-3 pb-1">
                    <span className={cn('font-display text-2xl font-semibold leading-none', GRADE_TEXT[g])}>{g}</span>
                    <span className="text-sm text-lichen">{GRADE_BLURB[g]}</span>
                    <span className="h-px flex-1 self-center bg-line" />
                  </div>
                  {group.map((c) => (
                    <CompRowCard
                      key={c.id}
                      comp={c}
                      board={boards.has(c.id) ? <BoardPreview units={c.units} px={40} /> : undefined}
                      onToggleBoard={() => toggleBoard(c.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {graded.length > shownComps.length || showAllComps ? (
          <button
            type="button"
            aria-expanded={showAllComps}
            onClick={() => setShowAllComps((s) => !s)}
            className="w-full rounded-xl border hairline py-3 text-sm font-medium text-lichen hover:bg-white/[0.03] hover:text-moon"
          >
            {showAllComps ? 'Show top comps only' : `Show all ${graded.length} graded comps`}
          </button>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Tier lists</h2>
            <p className="mt-1 text-sm text-lichen">Graded against each other. Items are graded within their own category.</p>
          </div>
          <Segmented
            value={list}
            onChange={setList}
            options={[
              { value: 'units', label: 'Champions' },
              { value: 'items', label: 'Items' },
              { value: 'traits', label: 'Traits' },
              ...(data.meta.hasAugments ? [{ value: 'augments' as const, label: 'Augments' }] : []),
            ]}
          />
        </div>
        {list === 'items' && (
          <div className="flex flex-wrap gap-1.5">
            {ITEM_KINDS.map((k) => (
              <Chip key={k.id} active={itemKind === k.id} onClick={() => setItemKind(k.id)}>
                {k.label}
              </Chip>
            ))}
          </div>
        )}
        <TierList kind={list} rows={rows[list]} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Standouts</h2>
          <Segmented
            size="sm"
            value={highlightKind}
            onChange={setHighlightKind}
            options={[
              { value: 'units', label: 'Champions' },
              { value: 'items', label: 'Items' },
              { value: 'traits', label: 'Traits' },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {data.highlights[highlightKind].map((h) => <HighlightCard key={`${h.kind}-${h.id}`} h={h} kind={highlightKind} />)}
        </div>
      </section>

      {data.previousPatch && (
        <Trends
          trends={data.trends}
          previous={data.previousPatch}
          current={data.scope.patch === 'all' ? (data.meta.patches.at(-1)?.label ?? 'now') : data.scope.patch}
        />
      )}
    </div>
  );
}
