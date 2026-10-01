import { NextResponse, type NextRequest } from 'next/server';
import { configuredSetNumber } from '@/config/game';
import { failure, json, limited, playerQuery } from '@/lib/http';
import { advanceTotals } from '@/lib/player-totals';
import { publicTotals } from '@/lib/totals';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** One step of a player's ranked totals; the page keeps asking until `done`. */
export async function GET(req: NextRequest) {
  const p = playerQuery(req);
  if (p instanceof NextResponse) return p;
  const current = configuredSetNumber();
  const set = p.q.has('set') ? Number(p.q.get('set')) : current;
  if (!Number.isInteger(set) || set < 1 || set > current) return NextResponse.json({ error: 'Unknown set' }, { status: 400 });
  const blocked = limited(req, 'totals', 90);
  if (blocked) return blocked;
  try {
    const step = await advanceTotals(p.puuid, p.platform, set);
    return json(req, { totals: publicTotals(step.totals), done: step.done, retryIn: step.retryIn }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error, 'Failed to load totals');
  }
}
