'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Crown, Flame, Medal, Sprout, Trophy } from 'lucide-react';
import { useStatic } from '@/components/providers';
import { CompRowCard } from '@/components/comps/comp-row';
import { ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { AvgPlace } from '@/components/stats/bits';
import { ScopeBar } from '@/components/stats/scope-bar';
import { Chip, Segmented } from '@/components/ui/primitives';
import type { MetaResult } from '@/lib/stats/service';
import { gradeRows, type Highlight } from '@/lib/stats/tiers';
import type { Tier, TieredComp, TieredRow } from '@/lib/stats/types';
import { cn, fmt } from '@/lib/utils';
import type { ItemCategory } from '@/types/static';

const GRADES: Tier[] = ['S', 'A', 'B', 'C', 'D'];
const GRADE_TEXT: Record<Tier, string> = {
  S: 'text-tier-s',
  A: 'text-tier-a',
  B: 'text-tier-b',
  C: 'text-tier-c',
  D: 'text-tier-d',
};
const GRADE_BG: Record<Tier, string> = {
  S: 'bg-tier-s/12',
  A: 'bg-tier-a/12',
  B: 'bg-tier-b/12',
  C: 'bg-tier-c/12',
  D: 'bg-tier-d/12',
};
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

function Tile({ kind, row }: { kind: ListKind; row: TieredRow }) {
  const index = useStatic();
  let icon: React.ReactNode = null;
  let href: string | undefined;
  let name = row.id;
  if (kind === 'units') {
    const c = index.champion(row.id);
    if (!c) return null;
    name = c.name;
    href = `/units/${c.slug}`;
    icon = <ChampionIcon id={row.id} size="lg" link={false} />;
  } else if (kind === 'items') {
    const it = index.item(row.id);
    if (!it) return null;
    name = it.name;
    href = `/items/${it.slug}`;
    icon = <ItemIcon id={row.id} px={52} link={false} />;
  } else if (kind === 'traits') {
    const key = row.id.slice(0, row.id.lastIndexOf(':'));
    const t = index.trait(key);
    if (!t) return null;
    name = `${t.effects[(row.tier ?? 1) - 1]?.minUnits ?? ''} ${t.name}`.trim();
    href = `/traits/${t.slug}`;
    icon = <TraitBadge id={key} tier={row.tier} size={48} link={false} showCount={false} />;
  } else {
    const a = index.augment(row.id);
    name = a?.name ?? row.id;
    icon = <GameImage src={a?.icon} alt={name} className="size-[52px] rounded-xl" />;
  }
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

function TierList({ kind, rows }: { kind: ListKind; rows: TieredRow[] }) {
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
              {list.map((r) => (
                <Tile key={r.id} kind={kind} row={r} />
              ))}
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
  const index = useStatic();
  const meta = HIGHLIGHT_META[h.kind];
  let icon: React.ReactNode = null;
  let name = h.id;
  let href = '#';
  if (kind === 'units') {
    const c = index.champion(h.id);
    name = c?.name ?? h.id;
    href = c ? `/units/${c.slug}` : '#';
    icon = <ChampionIcon id={h.id} size="md" link={false} hover={false} />;
  } else if (kind === 'items') {
    const it = index.item(h.id);
    name = it?.name ?? h.id;
    href = it ? `/items/${it.slug}` : '#';
    icon = <ItemIcon id={h.id} px={40} link={false} hover={false} />;
  } else {
    const key = h.id.slice(0, h.id.lastIndexOf(':'));
    const t = index.trait(key);
    name = t ? `${t.effects[(h.row.tier ?? 1) - 1]?.minUnits ?? ''} ${t.name}`.trim() : h.id;
    href = t ? `/traits/${t.slug}` : '#';
    icon = <TraitBadge id={key} tier={h.row.tier} size={38} link={false} hover={false} showCount={false} />;
  }
  return (
    <Link href={href} className="surface flex items-center gap-3 rounded-xl p-3.5 transition-colors hover:border-lichen/40">
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

function Trends({ trends, previous, current }: { trends: Record<string, number>; previous: string; current: string }) {
  const index = useStatic();
  const entries = Object.entries(trends).filter(([id]) => index.champion(id));
  const rising = [...entries].sort((a, b) => a[1] - b[1]).filter(([, d]) => d < -0.05).slice(0, 6);
  const falling = [...entries].sort((a, b) => b[1] - a[1]).filter(([, d]) => d > 0.05).slice(0, 6);
  if (!rising.length && !falling.length) return null;
  const List = ({ list, up }: { list: Array<[string, number]>; up: boolean }) => (
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
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Since patch {previous}</h2>
        <p className="mt-1 text-sm text-lichen">
          Change in average placement from {previous} to {current}. Negative numbers mean better finishes.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <List list={rising} up />
        <List list={falling} up={false} />
      </div>
    </section>
  );
}

export function MetaView({ data }: { data: MetaResult }) {
  const [showAllComps, setShowAllComps] = useState(false);
  const [list, setList] = useState<ListKind>('units');
  const [itemKind, setItemKind] = useState<ItemCategory>('completed');
  const [highlightKind, setHighlightKind] = useState<'units' | 'items' | 'traits'>('units');
  const index = useStatic();

  const graded = data.comps.filter((c) => c.grade);
  const topGrades = graded.filter((c) => c.grade === 'S' || c.grade === 'A' || c.grade === 'B');
  const shownComps: TieredComp[] = showAllComps ? graded : topGrades.length >= 4 ? topGrades : graded.slice(0, 8);

  const itemRows = useMemo(() => {
    const rows = data.items.filter((r) => index.item(r.id)?.category === itemKind);
    const minN = Math.max(5, Math.round(data.minN * 0.6));
    return gradeRows(rows, minN);
  }, [data.items, data.minN, index, itemKind]);

  const rows: Record<ListKind, TieredRow[]> = {
    units: data.units,
    items: itemRows,
    traits: data.traits.filter((r) => index.trait(r.id.slice(0, r.id.lastIndexOf(':')))?.kind !== 'unique'),
    augments: data.augments,
  };

  const scopeLabel = data.scope.patch === 'all' ? 'the whole set' : `patch ${data.scope.patch}`;

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Meta report</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-lichen">
            Tier lists for {scopeLabel} from {fmt.int(data.summary.boards)} ranked boards. Anything with only a few games
            is pulled toward an average finish before it gets a grade.
          </p>
        </div>
        <ScopeBar scope={data.scope} meta={data.meta} />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Comps</h2>
          <p className="mt-1 text-sm text-lichen">Grouped by their carries, with the board they usually play and who holds the items.</p>
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
                    <CompRowCard key={c.id} comp={c} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {graded.length > shownComps.length || showAllComps ? (
          <button
            type="button"
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
            <p className="mt-1 text-sm text-lichen">
              Graded against each other. Items are graded within their own category.
            </p>
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
          {data.highlights[highlightKind].map((h) => (
            <HighlightCard key={`${h.kind}-${h.id}`} h={h} kind={highlightKind} />
          ))}
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
