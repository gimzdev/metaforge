import { ImageResponse } from 'next/og';
import { configuredSetNumber, currentPatch } from '@/config/game';
import { BoardCard, OG_SIZE, TIER, portrait } from '@/lib/og-board';
import { compBoard } from '@/lib/placement';
import { scopeFrom } from '@/lib/search-params';
import { indexStatic } from '@/lib/static';
import { getStaticData } from '@/lib/static/load';
import { getComp } from '@/lib/stats/service';
import { fmt } from '@/lib/utils';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'The comp’s board as players stand it, with its grade and numbers';

/** A comp's link picture: its typical board, grade, average place, top 4 rate and games, on the live patch. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = /^[a-z0-9-]{1,200}$/.test(id) ? await getComp(id, scopeFrom({})).catch(() => null) : null;
  if (!result) return new Response('Not found', { status: 404 });
  const index = indexStatic(await getStaticData());
  const { comp } = result;
  const units = await Promise.all(
    Object.entries(compBoard(comp.units, index)).map(async ([hex, u]) => {
      const c = index.champion(u.key);
      return { hex: Number(hex), star: u.star, cost: c?.cost ?? 0, name: c?.name ?? u.key, icon: await portrait(c?.icon) };
    }),
  );
  const patch = result.scope.patch !== 'all' ? result.scope.patch : currentPatch(configuredSetNumber())?.label;
  return new ImageResponse(
    (
      <BoardCard
        kicker={`TFT comp${patch ? ` · patch ${patch}` : ''}`}
        title={comp.name}
        badge={comp.grade ? { text: comp.grade, color: TIER[comp.grade] ?? TIER.A } : undefined}
        lines={[`${comp.avg.toFixed(2)} average place`, `${fmt.pct(comp.top4, 0)} top 4, ${fmt.int(comp.n)} games`]}
        units={units}
      />
    ),
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' } },
  );
}
