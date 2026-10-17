import { unstable_cache } from 'next/cache';

/**
 * Results shared by every server instance through Next's data cache (Vercel's on Vercel, .next/cache elsewhere), so a
 * page view is answered from the cache instead of a fresh read of Postgres. Collection runs refresh the tagged entries
 * (revalidateTag in /api/cron/ingest); `revalidate` is only the fallback age.
 *
 * Outside a Next request (scripts/ingest.ts, the local collection timer) there is no data cache: the function runs as is.
 */

/** Stats pages: the meta, champion, item, trait and comp results and the explorer. */
export const STATS_TAG = 'mf-stats';
/** /api/status, the header's data line. */
export const STATUS_TAG = 'mf-status';

/** Bump when a cached result's shape changes, so a deploy never reads entries written by older code. */
const VERSION = 'v1';

// The data cache stores JSON; NaN, ±Infinity and undefined inside arrays would come back as null.
const MARK = '\u0000mf:';
const pack = (value: unknown) =>
  JSON.stringify(value === undefined ? null : value, (_key, v) =>
    typeof v === 'number' && !Number.isFinite(v) ? `${MARK}${v}` : v === undefined ? `${MARK}u` : v,
  );
const unpack = <T>(text: string): T =>
  JSON.parse(text, (_key, v) => {
    if (typeof v !== 'string' || !v.startsWith(MARK)) return v;
    const tag = v.slice(MARK.length);
    return tag === 'u' ? undefined : Number(tag);
  }) as T;

// Thrown out of the cached function so nothing is stored. Next logs these when a background refresh hits one, so they
// are short errors: the payload is not enumerable and never printed.
/** The function threw: rethrown as is, and nothing is cached. */
class Failed extends Error {
  declare readonly error: unknown;
  constructor(error: unknown) {
    super(`shared cache: not stored (${error instanceof Error ? error.message : String(error)})`);
    Object.defineProperty(this, 'error', { value: error });
  }
}
/** A result not worth sharing (it carries a read error): returned once, not cached. */
class Unshared extends Error {
  declare readonly value: unknown;
  constructor(value: unknown) {
    super('shared cache: result not stored (it carries a read error)');
    Object.defineProperty(this, 'value', { value });
  }
}

export function shared<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string[],
  options: { tags: string[]; revalidate: number; keep?: (result: R) => boolean },
): (...args: A) => Promise<R> {
  const cached = unstable_cache(
    async (...args: A) => {
      let result: R;
      try {
        result = await fn(...args);
      } catch (error) {
        throw new Failed(error);
      }
      if (options.keep && !options.keep(result)) throw new Unshared(result);
      return pack(result);
    },
    ['metaforge', VERSION, ...key],
    { tags: options.tags, revalidate: options.revalidate },
  );
  return async (...args: A) => {
    try {
      return unpack<R>(await cached(...args));
    } catch (error) {
      if (error instanceof Failed) throw error.error;
      if (error instanceof Unshared) return error.value as R;
      // No data cache here (a script, or the local timer): run it directly.
      return fn(...args);
    }
  };
}
