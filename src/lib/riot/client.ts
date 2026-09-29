import { env } from '@/lib/env';
import { singleton } from '@/lib/cache';
import { sleep } from '@/lib/utils';

export type RiotErrorCode = 'config' | 'key' | 'not_found' | 'rate' | 'server' | 'network' | 'budget' | 'bad_request';

export class RiotError extends Error {
  constructor(
    public code: RiotErrorCode,
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = 'RiotError';
  }
}

/**
 * Sliding-window limiter per routing host (na1, americas, ...). Riot applies app
 * rate limits per routing value, so each host gets its own windows. Limits are
 * taken from RIOT_RATE_LIMITS and updated from X-App-Rate-Limit headers.
 */
class HostLimiter {
  private windows: Array<{ limit: number; ms: number; hits: number[] }>;
  private blockedUntil = 0;
  private signature: string;

  constructor(limits: Array<[number, number]>) {
    this.windows = limits.map(([limit, ms]) => ({ limit, ms, hits: [] }));
    this.signature = limits.map(([l, ms]) => `${l}:${ms / 1000}`).join(',');
  }

  /** Update windows from a "100:120,20:1" header, keeping a 10% safety margin. */
  adopt(header: string | null) {
    if (!header || header === this.signature) return;
    const parsed = header
      .split(',')
      .map((p) => p.split(':').map(Number))
      .filter(([l, s]) => l > 0 && s > 0);
    if (!parsed.length) return;
    this.signature = header;
    this.windows = parsed.map(([l, s]) => ({ limit: Math.max(1, Math.floor(l * 0.9)), ms: s * 1000, hits: [] }));
  }

  block(ms: number) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
  }

  async acquire(deadline: number) {
    for (;;) {
      const now = Date.now();
      let wait = Math.max(0, this.blockedUntil - now);
      for (const w of this.windows) {
        while (w.hits.length && w.hits[0] <= now - w.ms) w.hits.shift();
        if (w.hits.length >= w.limit) wait = Math.max(wait, w.hits[0] + w.ms - now + 5);
      }
      if (wait <= 0) {
        for (const w of this.windows) w.hits.push(now);
        return;
      }
      if (now + wait > deadline) throw new RiotError('budget', 'Rate-limit wait would exceed the time budget');
      await sleep(Math.min(wait, 5_000));
    }
  }
}

const state = () =>
  singleton('riot-client', () => ({
    limiters: new Map<string, HostLimiter>(),
    inflight: new Map<string, Promise<unknown>>(),
    lastKeyError: 0,
  }));

function limiterFor(host: string) {
  const s = state();
  let limiter = s.limiters.get(host);
  if (!limiter) {
    limiter = new HostLimiter(env.riotRateLimits);
    s.limiters.set(host, limiter);
  }
  return limiter;
}

const HOST_RE = /^[a-z0-9]{2,12}$/;

export interface RiotGetOptions {
  /** Absolute epoch ms after which the call gives up instead of waiting. */
  deadline?: number;
  retries?: number;
  token?: string;
}

export function riotConfigured() {
  return Boolean(env.riotApiKey);
}

export function lastKeyErrorAt() {
  return state().lastKeyError || null;
}

export async function riotGet<T>(host: string, path: string, opts: RiotGetOptions = {}): Promise<T> {
  const key = env.riotApiKey;
  if (!key && !opts.token) throw new RiotError('config', 'RIOT_API_KEY is not configured');
  if (!HOST_RE.test(host)) throw new RiotError('bad_request', `Invalid routing host "${host}"`);
  const base = env.riotApiBase;
  const url = `${base.includes('{host}') ? base.replace('{host}', host) : `${base}/${host}`}${path}`;
  const s = state();
  const dedupeKey = opts.token ? '' : url;
  if (dedupeKey && s.inflight.has(dedupeKey)) return s.inflight.get(dedupeKey) as Promise<T>;

  const run = async (): Promise<T> => {
    const deadline = opts.deadline ?? Date.now() + 60_000;
    const retries = opts.retries ?? 3;
    const limiter = limiterFor(host);
    for (let attempt = 0; ; attempt++) {
      await limiter.acquire(deadline);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : { 'X-Riot-Token': key },
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        if (attempt < retries && Date.now() + 1_000 * 2 ** attempt < deadline) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        throw new RiotError('network', `Could not reach Riot API (${(error as Error).message})`);
      }
      limiter.adopt(res.headers.get('x-app-rate-limit'));
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) throw new RiotError('not_found', 'Not found', 404);
      if (res.status === 400) throw new RiotError('bad_request', 'Bad request', 400);
      if (res.status === 401 || res.status === 403) {
        if (!opts.token) s.lastKeyError = Date.now();
        throw new RiotError(
          'key',
          opts.token
            ? 'Riot rejected the sign-in token'
            : 'Riot rejected the API key — development keys expire after 24 hours',
          res.status,
        );
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** (attempt + 1)) * 1000;
        limiter.block(waitMs);
        if (attempt < retries + 2 && Date.now() + waitMs < deadline) continue;
        throw new RiotError('rate', 'Riot API rate limit reached', 429);
      }
      if (res.status >= 500 && attempt < retries && Date.now() + 1_000 * 2 ** attempt < deadline) {
        await sleep(1_000 * 2 ** attempt);
        continue;
      }
      throw new RiotError('server', `Riot API error ${res.status}`, res.status);
    }
  };

  const promise = run();
  if (dedupeKey) {
    s.inflight.set(dedupeKey, promise);
    promise.finally(() => s.inflight.delete(dedupeKey)).catch(() => undefined);
  }
  return promise;
}
