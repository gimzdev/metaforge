import { NextResponse, type NextRequest } from 'next/server';
import { explore } from '@/lib/stats/service';
import { sanitizeFilters } from '@/lib/stats/filters';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { normalizePlatform } from '@/lib/riot/regions';

export const dynamic = 'force-dynamic';

function cleanScope(body: Record<string, unknown>) {
  const region = typeof body.region === 'string' && body.region !== 'all' ? normalizePlatform(body.region) ?? 'none' : 'all';
  const patch = typeof body.patch === 'string' && /^[\w.]{1,12}$/.test(body.patch) ? body.patch : undefined;
  return { region, patch };
}

export async function POST(req: NextRequest) {
  const wait = rateLimit(`explorer:${clientKey(req)}`, 240, 60_000);
  if (wait) {
    return NextResponse.json({ error: 'Too many requests. Slow down a little.' }, { status: 429, headers: { 'Retry-After': String(wait) } });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    const result = await explore(cleanScope(body), sanitizeFilters(body.filters));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Explorer failed' }, { status: 500 });
  }
}
