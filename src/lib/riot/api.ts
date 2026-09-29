import { TtlCache, singleton } from '@/lib/cache';
import { getPlatform, normalizePlatform, PLATFORMS, type Platform } from './regions';
import { riotGet, RiotError, type RiotGetOptions } from './client';
import type {
  AccountDto,
  AccountRegionDto,
  LeagueEntryDto,
  LeagueListDto,
  MatchDto,
  SummonerDto,
} from './types';

const MIN = 60_000;
const caches = () =>
  singleton('riot-caches', () => ({
    account: new TtlCache<AccountDto>(2000, 60 * MIN),
    region: new TtlCache<string>(2000, 6 * 60 * MIN),
    summoner: new TtlCache<SummonerDto>(2000, 30 * MIN),
    league: new TtlCache<LeagueEntryDto[]>(2000, 2 * MIN),
    ladder: new TtlCache<LeagueListDto>(60, 10 * MIN),
    matchIds: new TtlCache<string[]>(2000, 2 * MIN),
    match: new TtlCache<MatchDto>(3000, 24 * 60 * MIN),
  }));

function platformOrThrow(id: string): Platform {
  const p = getPlatform(normalizePlatform(id) ?? '');
  if (!p) throw new RiotError('bad_request', `Unknown region "${id}"`);
  return p;
}

async function cached<T>(
  cache: TtlCache<T>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await load();
  cache.set(key, value);
  return value;
}

export async function getAccountByRiotId(gameName: string, tagLine: string, opts?: RiotGetOptions) {
  const key = `${gameName}#${tagLine}`.toLowerCase();
  return cached(caches().account, key, () =>
    riotGet<AccountDto>(
      'americas',
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      opts,
    ),
  );
}

export async function getAccountByPuuid(puuid: string, routing = 'americas', opts?: RiotGetOptions) {
  return cached(caches().account, puuid, () =>
    riotGet<AccountDto>(routing, `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`, opts),
  );
}

/** The platform where a player is active for TFT (e.g. "na1"), or null. */
export async function getActivePlatform(puuid: string, opts?: RiotGetOptions): Promise<string | null> {
  const hit = caches().region.get(puuid);
  if (hit !== undefined) return hit || null;
  try {
    const res = await riotGet<AccountRegionDto>(
      'americas',
      `/riot/account/v1/region/by-game/tft/by-puuid/${encodeURIComponent(puuid)}`,
      opts,
    );
    const platform = normalizePlatform(res.region) ?? '';
    caches().region.set(puuid, platform);
    return platform || null;
  } catch (error) {
    if (error instanceof RiotError && error.code === 'not_found') return null;
    throw error;
  }
}

export async function getSummoner(platform: string, puuid: string, opts?: RiotGetOptions) {
  const p = platformOrThrow(platform);
  return cached(caches().summoner, `${p.id}:${puuid}`, () =>
    riotGet<SummonerDto>(p.id, `/tft/summoner/v1/summoners/by-puuid/${encodeURIComponent(puuid)}`, opts),
  );
}

export async function getLeagueEntries(platform: string, puuid: string, opts?: RiotGetOptions) {
  const p = platformOrThrow(platform);
  return cached(caches().league, `${p.id}:${puuid}`, () =>
    riotGet<LeagueEntryDto[]>(p.id, `/tft/league/v1/by-puuid/${encodeURIComponent(puuid)}`, opts),
  );
}

export type LadderTier = 'challenger' | 'grandmaster' | 'master';

export async function getLadder(platform: string, tier: LadderTier, opts?: RiotGetOptions) {
  const p = platformOrThrow(platform);
  return cached(caches().ladder, `${p.id}:${tier}`, () =>
    riotGet<LeagueListDto>(p.id, `/tft/league/v1/${tier}?queue=RANKED_TFT`, opts),
  );
}

export async function getMatchIds(
  platform: string,
  puuid: string,
  params: { count?: number; start?: number; startTime?: number } = {},
  opts?: RiotGetOptions,
) {
  const p = platformOrThrow(platform);
  const q = new URLSearchParams();
  q.set('count', String(Math.min(200, Math.max(1, params.count ?? 20))));
  if (params.start) q.set('start', String(params.start));
  if (params.startTime) q.set('startTime', String(Math.floor(params.startTime / 1000)));
  const key = `${p.match}:${puuid}:${q.toString()}`;
  return cached(caches().matchIds, key, () =>
    riotGet<string[]>(p.match, `/tft/match/v1/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${q}`, opts),
  );
}

export function routingForMatchId(matchId: string): string | null {
  const prefix = matchId.split('_')[0]?.toLowerCase();
  return getPlatform(normalizePlatform(prefix) ?? '')?.match ?? null;
}

export async function getMatch(matchId: string, opts?: RiotGetOptions) {
  const routing = routingForMatchId(matchId);
  if (!routing) throw new RiotError('bad_request', `Cannot route match ${matchId}`);
  return cached(caches().match, matchId, () =>
    riotGet<MatchDto>(routing, `/tft/match/v1/matches/${encodeURIComponent(matchId)}`, opts),
  );
}

export function peekMatch(matchId: string) {
  return caches().match.get(matchId);
}

export { PLATFORMS };
