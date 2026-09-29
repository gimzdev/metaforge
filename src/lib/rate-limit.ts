import type { NextRequest } from 'next/server';
import { singleton, TtlCache } from '@/lib/cache';

/**
 * Small in-memory fixed-window limiter for public endpoints that cost Riot API
 * calls or heavy computation. Per server instance, which is enough to keep one
 * client from draining the shared Riot rate limit.
 */
const buckets = () => singleton('rate-limit', () => new TtlCache<{ n: number; reset: number }>(5000, 10 * 60_000));

export function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'local';
}

/** Returns seconds to wait when the caller is over the limit, otherwise 0. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const store = buckets();
  const hit = store.get(key);
  if (!hit || hit.reset <= now) {
    store.set(key, { n: 1, reset: now + windowMs }, windowMs);
    return 0;
  }
  hit.n++;
  if (hit.n > limit) return Math.max(1, Math.ceil((hit.reset - now) / 1000));
  return 0;
}
