/** Small in-process caches shared across requests (and across dev hot reloads). */

interface Entry<V> {
  value: V;
  expires: number;
}

export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  constructor(
    private maxEntries = 500,
    private defaultTtlMs = 60_000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

type GlobalBag = Record<string, unknown>;
const bag = globalThis as unknown as { __metaforge?: GlobalBag };

/** Process-wide singleton, surviving module reloads in development. */
export function singleton<T>(key: string, create: () => T): T {
  bag.__metaforge ??= {};
  if (!(key in bag.__metaforge)) bag.__metaforge[key] = create();
  return bag.__metaforge[key] as T;
}

/**
 * Memoize an async loader: concurrent callers share one in-flight promise and
 * results are reused until the TTL expires. Failures are not cached.
 */
export function cachedAsync<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const store = singleton('async-cache', () => ({
    values: new TtlCache<unknown>(200, ttlMs),
    inflight: new Map<string, Promise<unknown>>(),
  }));
  const hit = store.values.get(key);
  if (hit !== undefined) return Promise.resolve(hit as T);
  const pending = store.inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = load()
    .then((value) => {
      store.values.set(key, value, ttlMs);
      return value;
    })
    .finally(() => store.inflight.delete(key));
  store.inflight.set(key, promise);
  return promise;
}

export function invalidateAsync(prefix: string) {
  const store = singleton('async-cache', () => ({
    values: new TtlCache<unknown>(200, 60_000),
    inflight: new Map<string, Promise<unknown>>(),
  }));
  // TtlCache has no key iteration on purpose; clearing is cheap and rare.
  if (prefix) store.values.clear();
}
