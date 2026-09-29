import { normalizePlatform } from '@/lib/riot/regions';
import type { Scope } from '@/lib/stats/types';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Resolved = Awaited<SearchParams>;

export function param(sp: Resolved, key: string): string | undefined {
  const v = sp[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
}

/** Stats scope from ?region=&patch= (unknown regions resolve to an empty scope). */
export function scopeFrom(sp: Resolved): Partial<Scope> {
  const region = param(sp, 'region');
  const patch = param(sp, 'patch');
  return {
    region: region && region !== 'all' ? (normalizePlatform(region) ?? 'none') : 'all',
    patch: patch && /^[\w.]{1,12}$/.test(patch) ? patch : undefined,
  };
}
