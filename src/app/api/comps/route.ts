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
  const set = configuredSetNumber();
  const [meta, { data }] = await Promise.all([getMeta({ region: 'all' }), tryGetStaticData()]);
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
}

const headers = (seconds: number) => ({
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': `public, max-age=300, s-maxage=${seconds}, stale-while-revalidate=86400`,
});
