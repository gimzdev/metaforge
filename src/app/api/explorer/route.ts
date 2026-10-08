import { NextResponse, type NextRequest } from 'next/server';
import { failure, json, limited } from '@/lib/http';
import { normalizePlatform } from '@/lib/riot/regions';
import { sanitizeFilters } from '@/lib/stats/filters';
import { explore } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const blocked = limited(req, 'explorer', 240, 'Too many requests. Slow down a little.');
  if (blocked) return blocked;
  // A filter set is a few hundred bytes; refuse far bigger bodies before parsing.
  const MAX_BODY = 16_384;
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const region = typeof body.region === 'string' && body.region !== 'all' ? (normalizePlatform(body.region) ?? 'none') : 'all';
  const patch = typeof body.patch === 'string' && /^[\w.]{1,12}$/.test(body.patch) ? body.patch : undefined;
  try {
    return json(req, await explore({ region, patch }, sanitizeFilters(body.filters)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error, 'Explorer failed');
  }
}
