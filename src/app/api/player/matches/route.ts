import { NextResponse, type NextRequest } from 'next/server';
import { getPlayerMatches } from '@/lib/players';
import { RiotError } from '@/lib/riot/client';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { normalizePlatform } from '@/lib/riot/regions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const puuid = q.get('puuid') ?? '';
  const platform = normalizePlatform(q.get('platform'));
  const start = Math.max(0, Math.min(180, Number(q.get('start')) || 0));
  const count = Math.max(1, Math.min(20, Number(q.get('count')) || 10));
  if (!/^[\w-]{40,90}$/.test(puuid) || !platform) {
    return NextResponse.json({ error: 'Missing or invalid player' }, { status: 400 });
  }
  const wait = rateLimit(`matches:${clientKey(req)}`, 40, 60_000);
  if (wait) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(wait) } },
    );
  }
  try {
    const matches = await getPlayerMatches(puuid, platform, start, count);
    return NextResponse.json({ matches, next: matches.length === count ? start + count : null });
  } catch (error) {
    const status = error instanceof RiotError ? (error.code === 'rate' ? 429 : error.code === 'key' ? 503 : 502) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load matches' }, { status });
  }
}
