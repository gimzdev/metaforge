import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Flame, KeyRound, SearchX, TriangleAlert } from 'lucide-react';
import { GameImage } from '@/components/game/game-image';
import { MatchHistory } from '@/components/player/match-history';
import { PlayerSearch } from '@/components/player/player-search';
import { RememberPlayer } from '@/components/player/remember-player';
import { configuredSetNumber } from '@/config/game';
import { getSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { lookupPlayer, type PlayerProfile } from '@/lib/players';
import { profileIconUrl, queueTypeLabel, rankLabel, tierColor } from '@/lib/ranks';
import { RiotError } from '@/lib/riot/client';
import { getPlatform, normalizePlatform } from '@/lib/riot/regions';
import type { LeagueEntryDto } from '@/lib/riot/types';
import { cn, fmt, riotIdToSlug, safeDecode, slugToRiotId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = Promise<{ region: string; riotId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { riotId } = await params;
  const id = slugToRiotId(riotId);
  return { title: id ? `${id.gameName}#${id.tagLine}` : 'Player' };
}

function RankCard({ entry }: { entry: LeagueEntryDto }) {
  const hyper = Boolean(entry.ratedTier);
  const tier = hyper ? entry.ratedTier : entry.tier;
  const games = entry.wins + entry.losses;
  return (
    <div className="surface relative overflow-hidden rounded-xl p-4">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tierColor(tier) }} aria-hidden />
      <div className="text-xs text-lichen">{queueTypeLabel(entry.queueType)}</div>
      <div className="mt-1 font-display text-xl font-semibold" style={{ color: tierColor(tier) }}>
        {hyper ? `${(tier ?? '').charAt(0)}${(tier ?? '').slice(1).toLowerCase()}` : rankLabel(entry.tier, entry.rank)}
      </div>
      <div className="num mt-0.5 text-sm text-moon">
        {hyper ? `${fmt.int(entry.ratedRating ?? 0)} rating` : `${fmt.int(entry.leaguePoints ?? 0)} LP`}
        {entry.hotStreak && <Flame className="ml-1.5 inline size-4 text-firefly" aria-label="Hot streak" />}
      </div>
      {!hyper && games > 0 && (
        <div className="num mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-lichen">
          <span>{fmt.int(games)} games</span>
          <span title="Riot counts a top 4 finish as a win in ranked TFT">{fmt.int(entry.wins)} top 4s</span>
          <span>{fmt.pct(entry.wins / games, 1)} top 4 rate</span>
        </div>
      )}
    </div>
  );
}

function Problem({ icon: Icon, title, body, tone = 'bloom' }: { icon: typeof TriangleAlert; title: string; body: string; tone?: 'bloom' | 'firefly' }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10 text-center">
      <Icon className={cn('mx-auto size-10', tone === 'bloom' ? 'text-bloom' : 'text-firefly')} aria-hidden />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[15px] text-lichen">{body}</p>
      </div>
      <PlayerSearch className="text-left" />
    </div>
  );
}

export default async function PlayerPage({ params }: { params: Params }) {
  const { region, riotId } = await params;
  const id = slugToRiotId(riotId);
  const platform = normalizePlatform(region);
  if (!id || !platform) notFound();

  if (!env.riotApiKey) {
    return (
      <Problem
        icon={KeyRound}
        tone="firefly"
        title="Player lookups need a Riot API key"
        body="Set RIOT_API_KEY in .env.local and restart the server to search players and match history."
      />
    );
  }

  let profile: PlayerProfile | null = null;
  let failure: { title: string; body: string; notFound?: boolean } | null = null;
  try {
    profile = await lookupPlayer(id.gameName, id.tagLine, platform);
  } catch (error) {
    if (error instanceof RiotError && error.code === 'not_found') {
      failure = { title: 'Player not found', body: `No Riot account named ${id.gameName}#${id.tagLine}. Check the spelling and the tag.`, notFound: true };
    } else if (error instanceof RiotError && error.code === 'rate') {
      failure = { title: 'The Riot API is busy', body: 'Too many requests right now. Try again in a minute.' };
    } else if (error instanceof RiotError && error.code === 'key') {
      failure = { title: 'API key rejected', body: 'The Riot API key was rejected. Development keys expire every 24 hours.' };
    } else {
      failure = { title: 'Lookup failed', body: error instanceof Error ? error.message : 'Something went wrong talking to Riot.' };
    }
  }

  if (failure || !profile) {
    return <Problem icon={failure?.notFound ? SearchX : TriangleAlert} title={failure?.title ?? 'Lookup failed'} body={failure?.body ?? ''} />;
  }

  const canonical = riotIdToSlug(profile.gameName, profile.tagLine);
  if (profile.platform !== platform || safeDecode(canonical) !== safeDecode(riotId)) {
    redirect(`/player/${profile.platform}/${canonical}`);
  }

  const session = await getSession();
  const isMe = session?.puuid === profile.puuid;
  const icon = profileIconUrl(profile.profileIconId);
  const ranked = [...profile.ranked].sort((a, b) => (a.queueType === 'RANKED_TFT' ? -1 : b.queueType === 'RANKED_TFT' ? 1 : 0));

  return (
    <div className="space-y-8">
      <RememberPlayer gameName={profile.gameName} tagLine={profile.tagLine} platform={profile.platform} />
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-5">
          <div className="relative">
            <GameImage src={icon} alt="" className="size-20 rounded-xl ring-2 ring-wisp/30 sm:size-24" eager />
            {profile.summonerLevel !== null && (
              <span className="num absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-night px-2 py-0.5 text-[11px] font-semibold text-lichen ring-1 ring-lichen/20">
                {profile.summonerLevel}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-lichen">
              <span className="rounded-full bg-bark px-2.5 py-0.5 text-xs font-semibold text-moon">
                {getPlatform(profile.platform)?.label ?? profile.platform.toUpperCase()}
              </span>
              {isMe && <span className="rounded-full bg-wisp/15 px-2.5 py-0.5 text-xs font-semibold text-wisp">You</span>}
              {isMe && (
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="text-xs font-medium text-lichen underline-offset-4 hover:text-bloom hover:underline">
                    Sign out
                  </button>
                </form>
              )}
            </div>
            <h1 className="mt-1.5 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
              {profile.gameName}
              <span className="text-fog">#{profile.tagLine}</span>
            </h1>
          </div>
        </div>
        <PlayerSearch className="w-full lg:w-[420px]" />
      </section>

      {ranked.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ranked.map((e) => (
            <RankCard key={e.queueType} entry={e} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong px-5 py-4 text-sm text-lichen">
          Unranked this set.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Recent games</h2>
        <MatchHistory puuid={profile.puuid} platform={profile.platform} setNumber={configuredSetNumber()} />
      </section>
    </div>
  );
}
