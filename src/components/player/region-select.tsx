'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from '@/components/ui/primitives';
import { usePrefs } from '@/lib/prefs';
import { PLATFORMS } from '@/lib/riot/regions';
import { cn } from '@/lib/utils';

/** Region dropdown that updates ?region= and remembers the choice (optionally with an "All regions" entry). */
export function RegionSelect({ value, allowAll = false }: { value: string; allowAll?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const setPlatform = usePrefs((s) => s.setPlatform);
  const [pending, start] = useTransition();
  return (
    <Select
      label="Region"
      value={value}
      className={cn(pending && 'opacity-60')}
      onChange={(e) => {
        const q = new URLSearchParams(params.toString());
        q.set('region', e.target.value);
        if (e.target.value !== 'all') setPlatform(e.target.value);
        start(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }));
      }}
    >
      {allowAll && <option value="all">All regions</option>}
      {PLATFORMS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.label})
        </option>
      ))}
    </Select>
  );
}
