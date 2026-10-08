import { gzipSync } from 'node:zlib';
import { NextResponse, type NextRequest } from 'next/server';
import { singleton, TtlCache } from '@/lib/cache';
import { RiotError } from '@/lib/riot/api';
import { normalizePlatform } from '@/lib/riot/regions';

/** Per-instance fixed-window limiter (enough to stop one client draining the Riot limit): the 429 to send, or null. */
export function limited(req: Request, name: string, limit: number, message = 'Too many requests. Try again in a moment.') {
  const client = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const buckets = singleton('rate-limit', () => new TtlCache<{ n: number; reset: number }>(5000, 10 * 60_000));
  const key = `${name}:${client}`;
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || hit.reset <= now) {
    buckets.set(key, { n: 1, reset: now + 60_000 }, 60_000);
    return null;
  }
  if (++hit.n <= limit) return null;
  return NextResponse.json({ error: message }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((hit.reset - now) / 1000))) } });
}

/** The player a /api/player route asks about (?puuid=&platform=), or the 400 to send. */
export function playerQuery(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const puuid = q.get('puuid') ?? '';
  const platform = normalizePlatform(q.get('platform'));
  if (!/^[\w-]{40,90}$/.test(puuid) || !platform) return NextResponse.json({ error: 'Missing or invalid player' }, { status: 400 });
  return { q, puuid, platform };
}

const RIOT_STATUS: Partial<Record<RiotError['code'], number>> = { rate: 429, key: 503, config: 503, budget: 503, not_found: 404, bad_request: 400 };

/** Riot errors keep their message; anything else (DB errors can name hosts and users) is logged and answered with `fallback`. */
export function failure(error: unknown, fallback: string) {
  if (error instanceof RiotError) return NextResponse.json({ error: error.message }, { status: RIOT_STATUS[error.code] ?? 502 });
  console.error(`[metaforge] ${fallback}:`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** JSON, gzipped when accepted (Next does not compress route handlers); `body` reuses a serialization across requests. */
export function json(req: Request, data: unknown, init: { status?: number; headers?: Record<string, string>; body?: { text: string; gzip?: Buffer } } = {}) {
  const body = init.body ?? { text: JSON.stringify(data) };
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Vary', 'Accept-Encoding');
  if (body.text.length < 1024 || !acceptsGzip(req.headers.get('accept-encoding'))) return new Response(body.text, { status: init.status, headers });
  body.gzip ??= gzipSync(body.text);
  headers.set('Content-Encoding', 'gzip');
  return new Response(new Uint8Array(body.gzip), { status: init.status, headers });
}

/** Whether an Accept-Encoding header allows gzip ("gzip;q=0" refuses it; "*" covers it unless listed). */
function acceptsGzip(header: string | null) {
  let any = false;
  for (const part of (header ?? '').toLowerCase().split(',')) {
    const [name, ...params] = part.split(';').map((s) => s.trim());
    const q = params.find((p) => p.startsWith('q='));
    const ok = !q || Number(q.slice(2)) > 0;
    if (name === 'gzip' || name === 'x-gzip') return ok;
    if (name === '*') any = ok;
  }
  return any;
}
