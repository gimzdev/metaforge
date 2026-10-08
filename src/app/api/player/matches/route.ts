import { NextResponse, type NextRequest } from 'next/server';
import { failure, json, limited, playerQuery } from '@/lib/http';
import { getPlayerMatches } from '@/lib/players';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_START = 180;

export async function GET(req: NextRequest) {
  const p = playerQuery(req);
  if (p instanceof NextResponse) return p;
  const start = Math.max(0, Math.min(MAX_START, Math.floor(Number(p.q.get('start')) || 0)));
  const count = Math.max(1, Math.min(20, Math.floor(Number(p.q.get('count')) || 10)));
  const blocked = limited(req, 'matches', 40);
  if (blocked) return blocked;
  try {
    const { matches, more } = await getPlayerMatches(p.puuid, p.platform, start, count);
    // No next page past MAX_START (it would clamp back to this one), nor after a short page.
    return json(req, { matches, next: more && start + count <= MAX_START ? start + count : null });
  } catch (error) {
    return failure(error, 'Failed to load matches');
  }
}
