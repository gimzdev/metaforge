import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Flame, KeyRound, SearchX, TriangleAlert } from '@/components/icons';
import { GameImage } from '@/components/game/game-image';
import { MatchHistory } from '@/components/player/match-history';
import { PlayerSearch, RememberPlayer } from '@/components/player/player-search';
import { configuredSetNumber, getSetInfo } from '@/config/game';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { lookupPlayer, profileIconUrl, rankLabel, tierColor, type PlayerProfile } from '@/lib/players';
import { getAccountByRiotId, RiotError, type LeagueEntryDto } from '@/lib/riot/api';
import { getStore } from '@/lib/store';
import type { LpPoint } from '@/lib/store/types';
import { getPlatform, normalizePlatform, platformLabel } from '@/lib/riot/regions';
import { cn, fmt, riotIdToSlug, safeDecode, slugToRiotId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = Promise<{ region: string; riotId: string }>;

/** The Riot ID in the address, or null. Looser than Riot's 16/5 limits so no real name is refused, but junk costs no Riot call. */
function riotIdFrom(slug: string) {
  const id = slugToRiotId(slug);
  return id && [...id.gameName].length <= 32 && [...id.tagLine].length <= 10 ? id : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region, riotId } = await params;
  const id = riotIdFrom(riotId);
  const platform = normalizePlatform(region);
  if (!id || !platform) return { title: 'Player', robots: { index: false } };
  const name = `${id.gameName}#${id.tagLine}`;
  // Only a real player's page is indexable. Metadata reaches the <head> although the page streams, and this lookup
  // is the page's own first call (cached and shared).
  const indexable =
    Boolean(env.riotApiKey) &&
    (await getAccountByRiotId(id.gameName, id.tagLine, { deadline: Date.now() + 8_000 }).then(
      () => true,
      () => false,
    ));
  return {
    title: name,
    description: `${name} on ${platformLabel(platform)}: Teamfight Tactics rank and recent match history.`,
    alternates: { canonical: `/player/${platform}/${riotIdToSlug(id.gameName, id.tagLine)}` },
    ...(indexable ? {} : { robots: { index: false } }),
  };
}

function RankRow({ label, entry }: { label: string; entry?: LeagueEntryDto }) {
  const hyper = Boolean(entry?.ratedTier);
  const tier = entry ? (hyper ? entry.ratedTier : entry.tier) : null;
  const name = !entry || !tier ? null : hyper ? `${tier.charAt(0)}${tier.slice(1).toLowerCase()}` : rankLabel(entry.tier, entry.rank);
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-lichen">{label}</dt>
      <dd className="flex items-baseline gap-2 text-right">
        {entry && name ? (
          <>
            <span className="font-semibold" style={{ color: tierColor(tier) }}>{name}</span>
            <span className="num text-sm text-lichen">{hyper ? `${fmt.int(entry.ratedRating ?? 0)} rating` : `${fmt.int(entry.leaguePoints ?? 0)} LP`}</span>
            {entry.hotStreak && <Flame className="size-3.5 self-center text-firefly" role="img" aria-label="Hot streak" />}
          </>
        ) : (
          <span className="text-sm text-fog">Unranked</span>
        )}
      </dd>
    </div>
  );
}

/** The ranked queues of one set. */
function RankList({ entries }: { entries: LeagueEntryDto[] }) {
  const queue = (...types: string[]) => entries.find((r) => types.includes(r.queueType));
  return (
    <dl className="divide-y divide-line">
      <RankRow label="Ranked" entry={queue('RANKED_TFT')} />
      <RankRow label="Hyper Roll" entry={queue('RANKED_TFT_TURBO')} />
      <RankRow label="Double Up" entry={queue('RANKED_TFT_DOUBLE_UP', 'RANKED_TFT_PAIRS')} />
    </dl>
  );
}

function Problem({ icon: Icon, title, body, tone = 'bloom' }: { icon: typeof TriangleAlert; title: string; body: string; tone?: 'bloom' | 'firefly' }) {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10 text-center">
      {/* A missing player or a Riot hiccup answers 200: keep it out of search results (React puts this in the head). */}
      <meta name="robots" content="noindex" />
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
  const id = riotIdFrom(riotId);
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
    } else if (error instanceof RiotError && (error.code === 'rate' || error.code === 'budget')) {
      failure = { title: 'The Riot API is busy', body: 'Too many requests right now. Try again in a minute.' };
    } else if (error instanceof RiotError && (error.code === 'key' || error.code === 'config')) {
      failure = { title: 'Player lookup is unavailable', body: 'MetaForge cannot reach the Riot API right now. Try again later.' };
    } else {
      // Riot's own messages are safe to show; anything else stays in the server log.
      if (!(error instanceof RiotError)) console.error('[metaforge] player lookup failed:', error);
      failure = { title: 'Lookup failed', body: error instanceof RiotError ? error.message : 'Something went wrong talking to Riot. Try again in a moment.' };
    }
  }

  if (failure || !profile) {
    return <Problem icon={failure?.notFound ? SearchX : TriangleAlert} title={failure?.title ?? 'Lookup failed'} body={failure?.body ?? ''} />;
  }

  const canonical = riotIdToSlug(profile.gameName, profile.tagLine);
  if (profile.platform !== platform || safeDecode(canonical) !== safeDecode(riotId)) redirect(`/player/${profile.platform}/${canonical}`);

  const session = await getSession();
  const isMe = session?.puuid === profile.puuid;
  const icon = profileIconUrl(profile.profileIconId);
  const main = profile.ranked.find((r) => r.queueType === 'RANKED_TFT');
  const setNumber = configuredSetNumber();
  const since = Date.parse(`${getSetInfo(setNumber).start}T00:00:00Z`) || 0;
  const lp = await getStore()
    .lpHistory(profile.puuid, since)
    .catch((): LpPoint[] => []);
  const tail = lp.at(-1);
  if (main?.tier && !(tail && tail.tier === main.tier && tail.division === (main.rank ?? null) && tail.lp === main.leaguePoints)) {
    lp.push({ at: Date.now(), tier: main.tier, division: main.rank ?? null, lp: main.leaguePoints ?? 0 });
  }
  const totals = main && main.wins + main.losses > 0 ? { games: main.wins + main.losses, top4: main.wins / (main.wins + main.losses) } : null;

  return (
    <div className="space-y-8">
      <RememberPlayer gameName={profile.gameName} tagLine={profile.tagLine} platform={profile.platform} />
      <MatchHistory
        key={`${profile.puuid}|${profile.platform}`}
        puuid={profile.puuid}
        platform={profile.platform}
        setNumber={setNumber}
        totals={totals}
        lp={lp}
        identity={
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative shrink-0">
              <GameImage src={icon} alt="" className="size-16 rounded-xl ring-2 ring-wisp/30" eager />
              {profile.summonerLevel !== null && (
                <span className="num absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-night px-2 py-0.5 text-[11px] font-semibold text-lichen ring-1 ring-lichen/20">
                  {profile.summonerLevel}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {profile.gameName}
                <span className="text-fog">#{profile.tagLine}</span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-bark px-2.5 py-0.5 text-xs font-semibold text-moon">
                  {getPlatform(profile.platform)?.label ?? profile.platform.toUpperCase()}
                </span>
                {isMe && <span className="rounded-full bg-wisp/15 px-2.5 py-0.5 text-xs font-semibold text-wisp">You</span>}
              </div>
            </div>
          </div>
        }
        ranks={<RankList entries={profile.ranked} />}
      />
    </div>
  );
}
