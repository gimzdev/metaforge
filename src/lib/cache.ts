/** Small in-process caches and limits, shared across requests (and dev hot reloads). */

export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(
    private maxEntries = 500,
    private defaultTtlMs = 60_000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    if (hit.expires < Date.now()) return undefined;
    this.map.set(key, hit); // most recently used last
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value as string);
  }
}

/** Process-wide singleton, surviving module reloads in development. */
export function singleton<T>(key: string, create: () => T): T {
  const bag = ((globalThis as { __metaforge?: Record<string, unknown> }).__metaforge ??= {});
  if (!(key in bag)) bag[key] = create();
  return bag[key] as T;
}

/** Memoize an async loader (concurrent callers share one promise); failures are not cached. */
export function cachedAsync<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const store = singleton('async-cache', () => ({ values: new TtlCache<unknown>(200), inflight: new Map<string, Promise<unknown>>() }));
  const hit = store.values.get(key);
  if (hit !== undefined) return Promise.resolve(hit as T);
  let pending = store.inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load()
      .then((value) => (store.values.set(key, value, ttlMs), value))
      .finally(() => store.inflight.delete(key));
    store.inflight.set(key, pending);
  }
  return pending;
}
