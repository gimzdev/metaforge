'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from '@/components/icons';
import { Select } from '@/components/ui';
import { platformLabel } from '@/lib/riot/regions';
import { currentIndex } from '@/lib/static';
import type { DatasetMeta, Scope, StatRow } from '@/lib/stats/types';
import { cn, fmt, traitOf } from '@/lib/utils';
import { AvgPlace, Delta, EntityCell, FreqBar, Pct, StarLabel } from './bits';

export interface Column<R> {
  key: string;
  label: ReactNode;
  title?: string;
  align?: 'left' | 'right';
  sort?: (row: R) => number | string;
  /** Default direction when this column is first sorted */
  desc?: boolean;
  render: (row: R) => ReactNode;
  className?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

/** Columns hide by the table's own width (container queries), so tables fit narrow panels too. */
const HIDE = { sm: 'hidden @md:table-cell', md: 'hidden @xl:table-cell', lg: 'hidden @3xl:table-cell' } as const;

export function StatsTable<R extends { id: string }>({
  rows,
  columns,
  defaultSort,
  defaultDesc = false,
  onRowClick,
  rowClassName,
  empty,
  limit = 60,
  caption,
  bare = false,
}: {
  rows: R[];
  columns: Column<R>[];
  defaultSort?: string;
  defaultDesc?: boolean;
  onRowClick?: (row: R) => void;
  rowClassName?: (row: R) => string | undefined;
  empty?: ReactNode;
  limit?: number;
  caption?: string;
  /** Drop the outer frame when the table sits inside a panel. */
  bare?: boolean;
}) {
  const [sortKey, setSortKey] = useState(defaultSort ?? columns.find((c) => c.sort)?.key ?? '');
  const [desc, setDesc] = useState(defaultDesc);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    const get = columns.find((c) => c.key === sortKey)?.sort;
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const cmp = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return desc ? -cmp : cmp;
    });
  }, [rows, columns, sortKey, desc]);

  if (!rows.length) {
    return <div className={cn('p-10 text-center text-sm text-lichen', !bare && 'rounded-xl border border-dashed border-line-strong')}>{empty ?? 'Nothing to show.'}</div>;
  }

  const align = (c: Column<R>) => (c.align === 'right' ? 'text-right' : 'text-left');
  return (
    <div className={cn('@container', !bare && 'overflow-hidden rounded-xl border hairline')}>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-canopy text-xs text-lichen">
              {columns.map((c) => {
                const active = c.key === sortKey;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.title}
                    aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}
                    className={cn('sticky top-0 h-10 whitespace-nowrap px-3 font-medium first:pl-4 last:pr-4', align(c), c.hideBelow && HIDE[c.hideBelow])}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (active) setDesc((d) => !d);
                          else {
                            setSortKey(c.key);
                            setDesc(Boolean(c.desc));
                          }
                        }}
                        className={cn('inline-flex items-center gap-1 hover:text-moon', active && 'text-moon')}
                      >
                        {c.label}
                        {active && (desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(showAll ? sorted : sorted.slice(0, limit)).map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-t hairline transition-colors', onRowClick && 'cursor-pointer hover:bg-white/[0.035]', rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('h-14 whitespace-nowrap px-3 first:pl-4 last:pr-4', align(c), c.hideBelow && HIDE[c.hideBelow], c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="w-full border-t hairline py-3 text-sm font-medium text-lichen hover:bg-white/[0.03] hover:text-moon"
        >
          {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

/** The columns every stats table shares: play rate, average place, Δ, top 4, win (and games). */
export function statColumns(
  rows: StatRow[],
  opts: { freqLabel?: string; freqTitle?: string; avgTitle?: string; deltaTitle?: string; fadeBelow?: number; showDelta?: boolean } = {},
): Column<StatRow>[] {
  const maxFreq = Math.max(0.0001, ...rows.map((r) => r.freq));
  const cols: Column<StatRow>[] = [
    {
      key: 'freq',
      label: opts.freqLabel ?? 'Play rate',
      title: opts.freqTitle,
      align: 'right',
      sort: (r) => r.freq,
      desc: true,
      render: (r) => <FreqBar value={r.freq} max={maxFreq} className="justify-end" />,
    },
    {
      key: 'avg',
      label: 'Avg place',
      title: opts.avgTitle,
      align: 'right',
      sort: (r) => r.avg,
      render: (r) => <AvgPlace value={r.avg} className={r.n < (opts.fadeBelow ?? 20) ? 'opacity-60' : undefined} />,
    },
  ];
  if (opts.showDelta !== false) {
    cols.push({ key: 'delta', label: 'Δ', title: opts.deltaTitle, align: 'right', sort: (r) => r.delta, hideBelow: 'sm', render: (r) => <Delta value={r.delta} /> });
  }
  cols.push(
    { key: 'top4', label: 'Top 4', align: 'right', sort: (r) => r.top4, desc: true, hideBelow: 'md', render: (r) => <Pct value={r.top4} /> },
    { key: 'win', label: 'Win', align: 'right', sort: (r) => r.win, desc: true, hideBelow: 'md', render: (r) => <Pct value={r.win} /> },
  );
  return cols;
}

export const gamesColumn: Column<StatRow> = {
  key: 'n',
  label: 'Games',
  align: 'right',
  sort: (r) => r.n,
  desc: true,
  hideBelow: 'lg',
  render: (r) => <span className="num text-lichen">{fmt.int(r.n)}</span>,
};

type TableKind = 'unit' | 'item' | 'trait' | 'aug' | 'level' | 'star' | 'count' | 'tier';

const NAME_LABEL: Record<TableKind, string> = {
  unit: 'Champion',
  item: 'Item',
  trait: 'Trait',
  aug: 'Augment',
  level: 'Level',
  star: 'Stars',
  count: 'Items held',
  tier: 'Breakpoint',
};

function Label({ kind, row, traitKey }: { kind: TableKind; row: StatRow; traitKey?: string }) {
  if (kind === 'unit' || kind === 'item' || kind === 'aug' || kind === 'level') return <EntityCell kind={kind} id={row.id} />;
  if (kind === 'trait') return <EntityCell kind="trait" id={traitOf(row.id)} tier={row.tier} />;
  if (kind === 'star') return <StarLabel star={Number(row.id)} />;
  if (kind === 'count') {
    const n = Number(row.id);
    return (
      <span className="flex items-center gap-3">
        <span className="flex h-[30px] w-10 items-center justify-center gap-0.5 rounded-lg bg-bark">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < n ? 'size-2 rounded-sm bg-firefly' : 'size-2 rounded-sm bg-moss'} />
          ))}
        </span>
        <span className="font-medium text-moon">{n === 0 ? 'No items' : n === 1 ? '1 item' : `${n} items`}</span>
      </span>
    );
  }
  // A trait breakpoint.
  const trait = traitKey ? currentIndex().trait(traitKey) : undefined;
  const tier = Number(row.id);
  const effect = trait?.effects[tier - 1];
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-[30px] w-10 place-items-center rounded-md bg-bark text-sm font-semibold" style={{ color: effect ? `var(--color-style-${effect.style})` : undefined }}>
        {effect?.minUnits ?? tier}
      </span>
      <span className="font-medium text-moon">{effect ? `${effect.minUnits} ${trait?.name}` : `Breakpoint ${tier}`}</span>
    </span>
  );
}

/** Link target of a stats row, if its entity has a page. */
export function rowHref(kind: string, id: string): string | undefined {
  const index = currentIndex();
  if (kind === 'unit') return index.champion(id) && `/units/${index.champion(id)!.slug}`;
  if (kind === 'item') return index.item(id) && `/items/${index.item(id)!.slug}`;
  if (kind === 'trait') return index.trait(traitOf(id)) && `/traits/${index.trait(traitOf(id))!.slug}`;
  return undefined;
}

/** Sort-able name of a stats row. */
export function rowName(kind: string, r: StatRow): string {
  const index = currentIndex();
  if (kind === 'unit') return index.champion(r.id)?.name ?? r.id;
  if (kind === 'item') return index.item(r.id)?.name ?? r.id;
  if (kind === 'aug') return index.augment(r.id)?.name ?? r.id;
  if (kind === 'trait') return `${index.trait(traitOf(r.id))?.name ?? r.id} ${String(r.tier ?? 0).padStart(2, '0')}`;
  return r.id.padStart(4, '0');
}

/** Sortable stats table for entity pages. */
export function EntityTable({
  kind,
  rows,
  traitKey,
  minN = 1,
  limit = 12,
  defaultSort = 'avg',
  freqLabel = 'Play rate',
  showDelta = true,
  link = true,
}: {
  kind: TableKind;
  rows: StatRow[];
  traitKey?: string;
  minN?: number;
  limit?: number;
  defaultSort?: 'avg' | 'freq' | 'name' | 'n';
  freqLabel?: string;
  showDelta?: boolean;
  link?: boolean;
}) {
  const router = useRouter();
  const list = rows.filter((r) => r.n >= minN);
  const columns: Column<StatRow>[] = [
    {
      key: 'name',
      label: NAME_LABEL[kind],
      sort: (r) => (kind === 'unit' || kind === 'item' || kind === 'aug' ? rowName(kind, r) : r.id.padStart(4, '0')),
      render: (r) => <Label kind={kind} row={r} traitKey={traitKey} />,
      className: 'min-w-[132px] @lg:min-w-[180px]',
    },
    ...statColumns(list, { freqLabel, showDelta, deltaTitle: 'Change in average placement (negative is better)' }),
    gamesColumn,
  ];
  const clickable = link && (kind === 'unit' || kind === 'item' || kind === 'trait');
  return (
    <StatsTable
      rows={list}
      columns={columns}
      defaultSort={defaultSort}
      defaultDesc={defaultSort === 'freq' || defaultSort === 'n'}
      limit={limit}
      onRowClick={
        clickable
          ? (r) => {
              const href = rowHref(kind, r.id);
              if (href) router.push(href);
            }
          : undefined
      }
      empty="Not enough games yet."
      bare
    />
  );
}

/** Patch and region pickers; they update ?patch=&region= unless onChange handles them. */
export function ScopeBar({ scope, meta, onChange }: { scope: Scope; meta: DatasetMeta; onChange?: (scope: Scope) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const update = (next: Partial<Scope>) => {
    const merged = { ...scope, ...next };
    if (onChange) return onChange(merged);
    const q = new URLSearchParams(params.toString());
    q.set('region', merged.region);
    q.set('patch', merged.patch);
    start(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }));
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-2', pending && 'opacity-60')}>
      <Select label="Patch" value={scope.patch} onChange={(e) => update({ patch: e.target.value })}>
        <option value="all">Whole set ({fmt.compact(meta.total)})</option>
        {[...meta.patches].reverse().map((p) => (
          <option key={p.label} value={p.label} disabled={p.boards === 0}>
            Patch {p.label}
            {p.label === meta.currentPatch ? ' live' : ''} ({fmt.compact(p.boards)})
          </option>
        ))}
      </Select>
      <Select label="Region" value={scope.region} onChange={(e) => update({ region: e.target.value })}>
        <option value="all">All regions</option>
        {meta.regions.map((r) => (
          <option key={r.id} value={r.id}>
            {platformLabel(r.id)} ({fmt.compact(r.boards)})
          </option>
        ))}
      </Select>
    </div>
  );
}
