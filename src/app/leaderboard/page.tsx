import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Flame, KeyRound, TriangleAlert } from 'lucide-react';
import { RegionSelect } from '@/components/player/region-select';
import { PageHeader, Skeleton } from '@/components/ui/primitives';
import { brand } from '@/lib/brand';
import { env } from '@/lib/env';
import { getLeaderboard } from '@/lib/players';
import { rankLabel, tierColor } from '@/lib/ranks';
import { RiotError } from '@/lib/riot/client';
import { getPlatform, normalizePlatform, platformLabel } from '@/lib/riot/regions';
import { param, type SearchParams } from '@/lib/search-params';
import { fmt, riotIdToSlug } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ladder',
  description: 'The Teamfight Tactics ranked ladder for every region.',
};

async function Ladder({ platform }: { platform: string }) {
  let data: Awaited<ReturnType<typeof getLeaderboard>>;
  try {
    data = await getLeaderboard(platform, 100);
  } catch (error) {
    const message =
      error instanceof RiotError
        ? error.code === 'rate'
          ? 'The Riot API is rate limiting right now. Give it a minute and reload.'
          : error.code === 'key'
            ? 'The Riot API key was rejected. Development keys expire every 24 hours.'
            : error.message
        : 'The ladder could not be loaded.';
    return (
      <div className="flex items-start gap-3 rounded-xl border border-bloom/30 bg-bloom/10 p-5 text-sm">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bloom" aria-hidden />
        <div>
          <div className="font-semibold text-moon">Ladder unavailable</div>
          <div className="mt-1 text-lichen">{message}</div>
        </div>
      </div>
    );
  }

  if (!data.entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-lichen">
        No apex tier players on {platform === 'all' ? 'any server' : platformLabel(platform)} yet this set.
      </div>
    );
  }

  const unnamed = data.entries.filter((e) => !e.gameName).length;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border hairline">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-canopy text-xs text-lichen">
                <th className="h-10 w-14 px-4 text-left font-medium">#</th>
                <th className="h-10 px-3 text-left font-medium">Player</th>
                {data.platform === 'all' && <th className="h-10 px-3 text-left font-medium">Region</th>}
                <th className="h-10 px-3 text-left font-medium">Tier</th>
                <th className="h-10 px-3 text-right font-medium">LP</th>
                <th className="hidden h-10 px-3 text-right font-medium sm:table-cell">Games</th>
                <th className="hidden h-10 px-3 text-right font-medium md:table-cell" title="Top 4 finishes">
                  Top 4s
                </th>
                <th className="h-10 px-4 text-right font-medium" title="Share of games finished in the top 4">
                  Top 4 rate
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.puuid} className="border-t hairline transition-colors hover:bg-white/[0.03]">
                  <td className="num h-12 px-4 text-lichen">{e.rank}</td>
                  <td className="h-12 max-w-[240px] px-3">
                    {e.gameName && e.tagLine ? (
                      <Link
                        href={`/player/${e.platform}/${riotIdToSlug(e.gameName, e.tagLine)}`}
                        className="inline-flex max-w-full items-center gap-1.5 font-medium text-moon hover:text-wisp"
                      >
                        <span className="truncate">{e.gameName}</span>
                        <span className="shrink-0 text-fog">#{e.tagLine}</span>
                        {e.hotStreak && <Flame className="size-3.5 shrink-0 text-firefly" aria-label="Hot streak" />}
                      </Link>
                    ) : (
                      <span className="text-fog">Name pending</span>
                    )}
                  </td>
                  {data.platform === 'all' && <td className="h-12 px-3 text-[13px] text-lichen">{platformLabel(e.platform)}</td>}
                  <td className="h-12 px-3">
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: tierColor(e.tier) }}>
                      <span className="size-2 rounded-full" style={{ background: tierColor(e.tier) }} />
                      {rankLabel(e.tier)}
                    </span>
                  </td>
                  <td className="num h-12 px-3 text-right font-semibold">{fmt.int(e.lp)}</td>
                  <td className="num hidden h-12 px-3 text-right text-lichen sm:table-cell">{fmt.int(e.games)}</td>
                  <td className="num hidden h-12 px-3 text-right text-lichen md:table-cell">{fmt.int(e.wins)}</td>
                  <td className="num h-12 px-4 text-right">{e.games ? fmt.pct(e.wins / e.games, 1) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-fog">
        Updated {fmt.ago(data.updatedAt)}.
        {unnamed > 0 ? ` ${unnamed} Riot IDs are still being resolved and fill in over the next few loads.` : ''}
      </p>
    </div>
  );
}

function LadderSkeleton() {
  return (
    <div className="space-y-2 rounded-xl border hairline p-4">
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const region = param(sp, 'region');
  const platform = region?.toLowerCase() === 'all' ? 'all' : (getPlatform(normalizePlatform(region) ?? 'na1')?.id ?? 'na1');
  const where = platform === 'all' ? 'every server' : (getPlatform(platform)?.name ?? platformLabel(platform));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ladder"
        art={brand.fight}
        description={
          platform === 'all'
            ? 'The top 100 players across every server, ranked by LP.'
            : `The top 100 ranked players on ${where}.`
        }
      >
        <RegionSelect value={platform} allowAll />
      </PageHeader>
      {env.riotApiKey ? (
        <Suspense key={platform} fallback={<LadderSkeleton />}>
          <Ladder platform={platform} />
        </Suspense>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-firefly/30 bg-firefly/10 p-5 text-sm">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-firefly" aria-hidden />
          <div>
            <div className="font-semibold text-moon">A Riot API key is needed for the ladder</div>
            <div className="mt-1 text-lichen">Set RIOT_API_KEY in .env.local and restart the server.</div>
          </div>
        </div>
      )}
    </div>
  );
}
