'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useStatic } from '@/components/providers';
import { Stars } from '@/components/game/entities';
import { AvgPlace, Delta, FreqBar, Pct } from './bits';
import { EntityCell } from './entity-cell';
import { StatsTable, type Column } from './stats-table';
import type { StatRow } from '@/lib/stats/types';
import { fmt } from '@/lib/utils';

export type TableKind = 'unit' | 'item' | 'trait' | 'aug' | 'level' | 'star' | 'count' | 'tier';

function Label({ kind, row, traitKey }: { kind: TableKind; row: StatRow; traitKey?: string }) {
  const index = useStatic();
  if (kind === 'unit' || kind === 'item' || kind === 'aug' || kind === 'level') {
    return <EntityCell kind={kind} id={row.id} />;
  }
  if (kind === 'trait') {
    const key = row.id.slice(0, row.id.lastIndexOf(':'));
    return <EntityCell kind="trait" id={key} tier={row.tier} />;
  }
  if (kind === 'star') {
    const star = Number(row.id);
    return (
      <span className="flex items-center gap-3">
        <span className="grid h-[30px] w-10 place-items-center rounded-lg bg-bark text-sm">
          {star >= 2 ? <Stars star={star} className="text-sm" /> : <span className="text-[#b8a58a]">★</span>}
        </span>
        <span className="font-medium text-moon">{star}-star</span>
      </span>
    );
  }
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
  // tier: breakpoint of a trait
  const trait = traitKey ? index.trait(traitKey) : undefined;
  const tier = Number(row.id);
  const effect = trait?.effects[tier - 1];
  return (
    <span className="flex items-center gap-3">
      <span
        className="grid h-[30px] w-10 place-items-center rounded-md bg-bark text-sm font-semibold"
        style={{ color: effect ? `var(--color-style-${effect.style})` : undefined }}
      >
        {effect?.minUnits ?? tier}
      </span>
      <span className="font-medium text-moon">
        {effect ? `${effect.minUnits} ${trait?.name}` : `Breakpoint ${tier}`}
      </span>
    </span>
  );
}

/** Sortable stats table for entity pages (built client-side so column renderers stay in the browser). */
export function EntityTable({
  kind,
  rows,
  traitKey,
  minN = 1,
  limit = 12,
  defaultSort = 'avg',
  freqLabel = 'Play rate',
  freqTitle,
  showDelta = true,
  link = true,
  empty,
  bare = true,
}: {
  kind: TableKind;
  rows: StatRow[];
  traitKey?: string;
  minN?: number;
  limit?: number;
  defaultSort?: 'avg' | 'freq' | 'name' | 'n';
  freqLabel?: string;
  freqTitle?: string;
  showDelta?: boolean;
  link?: boolean;
  empty?: ReactNode;
  bare?: boolean;
}) {
  const index = useStatic();
  const router = useRouter();
  const list = rows.filter((r) => r.n >= minN);
  const maxFreq = Math.max(0.0001, ...list.map((r) => r.freq));

  const hrefOf = (r: StatRow): string | null => {
    if (!link) return null;
    if (kind === 'unit') {
      const c = index.champion(r.id);
      return c ? `/units/${c.slug}` : null;
    }
    if (kind === 'item') {
      const i = index.item(r.id);
      return i ? `/items/${i.slug}` : null;
    }
    if (kind === 'trait') {
      const t = index.trait(r.id.slice(0, r.id.lastIndexOf(':')));
      return t ? `/traits/${t.slug}` : null;
    }
    return null;
  };

  const nameOf = (r: StatRow) => {
    if (kind === 'unit') return index.champion(r.id)?.name ?? r.id;
    if (kind === 'item') return index.item(r.id)?.name ?? r.id;
    if (kind === 'aug') return index.augment(r.id)?.name ?? r.id;
    return r.id.padStart(4, '0');
  };

  const columns: Column<StatRow>[] = [
    {
      key: 'name',
      label: { unit: 'Champion', item: 'Item', trait: 'Trait', aug: 'Augment', level: 'Level', star: 'Stars', count: 'Items held', tier: 'Breakpoint' }[kind],
      sort: nameOf,
      render: (r) => <Label kind={kind} row={r} traitKey={traitKey} />,
      className: 'min-w-[132px] @lg:min-w-[180px]',
    },
    {
      key: 'freq',
      label: freqLabel,
      title: freqTitle,
      align: 'right',
      sort: (r) => r.freq,
      desc: true,
      render: (r) => <FreqBar value={r.freq} max={maxFreq} className="justify-end" />,
    },
    {
      key: 'avg',
      label: 'Avg place',
      align: 'right',
      sort: (r) => r.avg,
      render: (r) => <AvgPlace value={r.avg} className={r.n < 20 ? 'opacity-60' : undefined} />,
    },
  ];
  if (showDelta) {
    columns.push({
      key: 'delta',
      label: 'Δ',
      title: 'Change in average placement (negative is better)',
      align: 'right',
      sort: (r) => r.delta,
      hideBelow: 'sm',
      render: (r) => <Delta value={r.delta} />,
    });
  }
  columns.push(
    { key: 'top4', label: 'Top 4', align: 'right', sort: (r) => r.top4, desc: true, hideBelow: 'md', render: (r) => <Pct value={r.top4} /> },
    { key: 'win', label: 'Win', align: 'right', sort: (r) => r.win, desc: true, hideBelow: 'md', render: (r) => <Pct value={r.win} /> },
    {
      key: 'n',
      label: 'Games',
      align: 'right',
      sort: (r) => r.n,
      desc: true,
      hideBelow: 'lg',
      render: (r) => <span className="num text-lichen">{fmt.int(r.n)}</span>,
    },
  );

  return (
    <StatsTable
      rows={list}
      columns={columns}
      defaultSort={defaultSort}
      defaultDesc={defaultSort === 'freq' || defaultSort === 'n'}
      limit={limit}
      onRowClick={link && (kind === 'unit' || kind === 'item' || kind === 'trait') ? (r) => {
        const href = hrefOf(r);
        if (href) router.push(href);
      } : undefined}
      empty={empty ?? 'Not enough games yet.'}
      bare={bare}
    />
  );
}
