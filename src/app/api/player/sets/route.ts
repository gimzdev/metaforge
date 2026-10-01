import { NextResponse, type NextRequest } from 'next/server';
import { failure, json, limited, playerQuery } from '@/lib/http';
import { playedSets } from '@/lib/player-sets';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** The sets a player has games in, for the set menu. */
export async function GET(req: NextRequest) {
  const p = playerQuery(req);
  if (p instanceof NextResponse) return p;
  const blocked = limited(req, 'sets', 30);
  if (blocked) return blocked;
  try {
    return json(req, { sets: await playedSets(p.puuid, p.platform) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error, 'Failed to load sets');
  }
}
