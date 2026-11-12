// The link picture of a shared builder board (/builder?b=...): the board, its active traits and its level. The builder
// page points its og:image here with the same code (the name keeps it among the firewall's open paths).
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { computeTraits, decodeBoard } from '@/lib/builder';
import { BoardCard, OG_SIZE, portrait } from '@/lib/og-board';
import { indexStatic } from '@/lib/static';
import { getStaticData } from '@/lib/static/load';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('b');
  const index = indexStatic(await getStaticData());
  const { board, level } = decodeBoard(code && code.length < 4000 ? code : null, index);
  const entries = Object.entries(board);
  if (!entries.length) return new Response('Not found', { status: 404 });
  const units = await Promise.all(
    entries.map(async ([hex, u]) => {
      const c = index.champion(u.key);
      return { hex: Number(hex), star: u.star, cost: c?.cost ?? 0, name: c?.name ?? u.key, icon: await portrait(c?.icon) };
    }),
  );
  const active = computeTraits(board, index)
    .filter((t) => t.tier > 0 && t.trait.kind !== 'unique')
    .sort((a, b) => b.tier - a.tier || b.count - a.count)
    .slice(0, 4);
  const title = active.length ? active.slice(0, 2).map((t) => `${t.count} ${t.trait.name}`).join(', ') : `${entries.length} units`;
  return new ImageResponse(
    <BoardCard
      kicker={`TFT team builder · Set ${index.data.set.number}`}
      title={title}
      lines={[...(active.length > 2 ? [active.slice(2).map((t) => `${t.count} ${t.trait.name}`).join(', ')] : []), `${entries.length} units${level ? `, level ${level}` : ''}`]}
      units={units}
    />,
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400' } },
  );
}
