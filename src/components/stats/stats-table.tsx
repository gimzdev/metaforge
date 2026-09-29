'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<R> {
  key: string;
  label: ReactNode;
  title?: string;
  align?: 'left' | 'right' | 'center';
  sort?: (row: R) => number | string;
  /** Default direction when this column is first sorted */
  desc?: boolean;
  render: (row: R) => ReactNode;
  className?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

/** Columns hide by the table's own width (container queries), so tables fit narrow panels too. */
const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden @md:table-cell',
  md: 'hidden @xl:table-cell',
  lg: 'hidden @3xl:table-cell',
};

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
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const cmp = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return desc ? -cmp : cmp;
    });
  }, [rows, columns, sortKey, desc]);

  const visible = showAll ? sorted : sorted.slice(0, limit);

  const toggle = (col: Column<R>) => {
    if (!col.sort) return;
    if (col.key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(col.key);
      setDesc(Boolean(col.desc));
    }
  };

  if (!rows.length) {
    return (
      <div className={cn('p-10 text-center text-sm text-lichen', !bare && 'rounded-xl border border-dashed border-line-strong')}>
        {empty ?? 'Nothing to show.'}
      </div>
    );
  }

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
                    className={cn(
                      'sticky top-0 h-10 whitespace-nowrap px-3 font-medium first:pl-4 last:pr-4',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      c.hideBelow && HIDE[c.hideBelow],
                    )}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => toggle(c)}
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
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-t hairline transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-white/[0.035]',
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'h-14 whitespace-nowrap px-3 first:pl-4 last:pr-4',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
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
