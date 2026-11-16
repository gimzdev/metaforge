import { NextResponse } from 'next/server';
import { configuredSetNumber } from '@/config/game';
import { compBoard } from '@/lib/placement';
import { indexStatic } from '@/lib/static';
import { tryGetStaticData } from '@/lib/static/load';
import { getMeta } from '@/lib/stats/service';

export const dynamic = 'force-dynamic';

// The tier list's comps, each with the board players stand it on, for Patchlab (patchlab.metaforge.lol): its Comps
// list puts them on the board in one move. Read from the same shared cache as /meta; the CDN keeps each answer an hour.
// A board is [champion, stars, hex, ...items], hexes counted from the front row (row * 7 + column).
export async function GET() {
  let set = configuredSetNumber();
  try {
    const [meta, { data }] = await Promise.all([getMeta({ region: 'all' }), tryGetStaticData()]);
    // The set of the game data in use: the one the comps are from (the site moves to a new set by itself).
    set = data?.set.number ?? configuredSetNumber();
    if (!data || !meta.meta.total) return NextResponse.json({ set, comps: [] }, { headers: headers(300) });
    const index = indexStatic(data);
    const comps = meta.comps.map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      avg: c.avg,
      top4: c.top4,
      win: c.win,
      n: c.n,
      level: Math.round(c.level),
      board: Object.entries(compBoard(c.units, index)).map(([hex, u]) => [u.key, u.star, Number(hex), ...u.items]),
    }));
    return NextResponse.json({ set, patch: meta.scope.patch, updated: meta.meta.builtAt, comps }, { headers: headers(3600) });
  } catch (error) {
    // Game data or the store could not be read: a program still gets JSON of the same shape (and the CORS header),
    // not an empty 500, and nothing caches the failure.
    console.error('[metaforge] /api/comps failed:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { set, comps: [], error: 'unavailable' },
      { status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } },
    );
  }
}

const headers = (seconds: number) => ({
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': `public, max-age=300, s-maxage=${seconds}, stale-while-revalidate=86400`,
});
