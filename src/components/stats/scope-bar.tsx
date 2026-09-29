'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from '@/components/ui/primitives';
import { platformLabel } from '@/lib/riot/regions';
import { cn, fmt } from '@/lib/utils';
import type { DatasetMeta, Scope } from '@/lib/stats/types';

export function ScopeBar({
  scope,
  meta,
  onChange,
  className,
}: {
  scope: Scope;
  meta: DatasetMeta;
  onChange?: (scope: Scope) => void;
  className?: string;
}) {
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

  const patches = [...meta.patches].reverse();
  return (
    <div className={cn('flex flex-wrap items-center gap-2', pending && 'opacity-60', className)}>
      <Select label="Patch" value={scope.patch} onChange={(e) => update({ patch: e.target.value })}>
        <option value="all">Whole set ({fmt.compact(meta.total)})</option>
        {patches.map((p) => (
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
