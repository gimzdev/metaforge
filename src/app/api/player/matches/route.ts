import { NextResponse, type NextRequest } from 'next/server';
import { failure, json, limited, playerQuery } from '@/lib/http';
import { getPlayerMatches } from '@/lib/players';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const p = playerQuery(req);
  if (p instanceof NextResponse) return p;
  const start = Math.max(0, Math.min(180, Number(p.q.get('start')) || 0));
  const count = Math.max(1, Math.min(20, Number(p.q.get('count')) || 10));
  const blocked = limited(req, 'matches', 40);
  if (blocked) return blocked;
  try {
    const matches = await getPlayerMatches(p.puuid, p.platform, start, count);
    return json(req, { matches, next: matches.length === count ? start + count : null });
  } catch (error) {
    return failure(error, 'Failed to load matches');
  }
}
