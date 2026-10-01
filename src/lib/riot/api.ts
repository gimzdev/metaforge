import { singleton, TtlCache } from '@/lib/cache';
import { env } from '@/lib/env';
import { sleep } from '@/lib/utils';
import { getPlatform, normalizePlatform, type Platform } from './regions';

/* ── DTOs (only the fields MetaForge reads) ─────────────── */

export interface AccountDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

export interface LeagueItemDto {
  puuid: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
}

interface LeagueListDto {
  tier: string;
  entries: LeagueItemDto[];
}

export interface LeagueEntryDto {
  queueType: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
  ratedTier?: string;
  ratedRating?: number;
}

export interface MatchParticipantDto {
  puuid: string;
  placement: number;
  level: number;
  gold_left?: number;
  last_round?: number;
  total_damage_to_players?: number;
  traits?: Array<{ name: string; num_units: number; style?: number; tier_current: number }>;
  units?: Array<{ character_id: string; itemNames?: string[]; tier?: number }>;
  augments?: string[] | null;
  riotIdGameName?: string;
  riotIdTagline?: string;
  partner_group_id?: number;
}

export interface MatchDto {
  metadata: { match_id: string };
  info: {
    game_datetime: number;
    game_length: number;
    game_version: string;
    queue_id?: number;
    queueId?: number;
    tft_game_type?: string;
    tft_set_number: number;
    participants: MatchParticipantDto[];
  };
}

/* ── Client ─────────────────────────────────────────────── */

type RiotErrorCode = 'config' | 'key' | 'not_found' | 'rate' | 'server' | 'network' | 'budget' | 'bad_request';

export class RiotError extends Error {
  constructor(
    public code: RiotErrorCode,
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = 'RiotError';
  }
}

/**
 * Sliding-window limiter per routing host (na1, americas, ...): Riot applies app rate
 * limits per routing value. Starts from RIOT_RATE_LIMITS and follows X-App-Rate-Limit.
 */
/** Drop the requests that have left a window, in one pass (a production key keeps tens of thousands). */
function expire(w: { ms: number; hits: number[] }, now: number) {
  let k = 0;
  while (k < w.hits.length && w.hits[k] <= now - w.ms) k++;
  if (k) w.hits.splice(0, k);
}

class HostLimiter {
  private windows: Array<{ limit: number; ms: number; hits: number[] }>;
  private blockedUntil = 0;
  private signature: string;

  constructor(limits: Array<[number, number]>) {
    this.windows = limits.map(([limit, ms]) => ({ limit, ms, hits: [] }));
    this.signature = limits.map(([l, ms]) => `${l}:${ms / 1000}`).join(',');
  }

  /** Adopt a "100:120,20:1" header, keeping a 10% safety margin. */
  adopt(header: string | null) {
    if (!header || header === this.signature) return;
    const parsed = header
      .split(',')
      .map((p) => p.split(':').map(Number))
      .filter(([l, s]) => l > 0 && s > 0);
    if (!parsed.length) return;
    this.signature = header;
    this.windows = parsed.map(([l, s]) => ({ limit: Math.max(1, Math.floor(l * 0.9)), ms: s * 1000, hits: [] }));
  }

  block(ms: number) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
  }

  /** Share of the tightest window still free (1 when idle, 0 when nothing more can be sent now). */
  headroom() {
    const now = Date.now();
    if (this.blockedUntil > now) return 0;
    let free = 1;
    for (const w of this.windows) {
      expire(w, now);
      free = Math.min(free, 1 - w.hits.length / w.limit);
    }
    return Math.max(0, free);
  }

  async acquire(deadline: number) {
    for (;;) {
      const now = Date.now();
      let wait = Math.max(0, this.blockedUntil - now);
      for (const w of this.windows) {
        expire(w, now);
        if (w.hits.length >= w.limit) wait = Math.max(wait, w.hits[0] + w.ms - now + 5);
      }
      if (wait <= 0) {
        for (const w of this.windows) w.hits.push(now);
        return;
      }
      if (now + wait > deadline) throw new RiotError('budget', 'Rate-limit wait would exceed the time budget');
      await sleep(Math.min(wait, 5_000));
    }
  }
}

const state = () =>
  singleton('riot-client', () => ({
    limiters: new Map<string, HostLimiter>(),
    inflight: new Map<string, Promise<unknown>>(),
    lastKeyError: 0,
  }));

export const lastKeyErrorAt = () => state().lastKeyError || null;

/** How much of a routing host's rate limit is free right now (0 to 1): background work backs off when it is low. */
export const riotHeadroom = (host: string) => state().limiters.get(host)?.headroom() ?? 1;

interface RiotGetOptions {
  /** Epoch ms after which the call gives up instead of waiting. */
  deadline?: number;
  retries?: number;
  /** Riot Sign-On access token (instead of the API key). */
  token?: string;
}

export async function riotGet<T>(host: string, path: string, opts: RiotGetOptions = {}): Promise<T> {
  const key = env.riotApiKey;
  if (!key && !opts.token) throw new RiotError('config', 'RIOT_API_KEY is not configured');
  if (!/^[a-z0-9]{2,12}$/.test(host)) throw new RiotError('bad_request', `Invalid routing host "${host}"`);
  const base = env.riotApiBase;
  const url = `${base.includes('{host}') ? base.replace('{host}', host) : `${base}/${host}`}${path}`;
  const s = state();
  // Identical concurrent calls share one request (never for sign-in tokens).
  if (!opts.token && s.inflight.has(url)) return s.inflight.get(url) as Promise<T>;
  let limiter = s.limiters.get(host);
  if (!limiter) s.limiters.set(host, (limiter = new HostLimiter(env.riotRateLimits)));

  const run = async (): Promise<T> => {
    const deadline = opts.deadline ?? Date.now() + 60_000;
    const retries = opts.retries ?? 3;
    const backoff = (attempt: number) => attempt < retries && Date.now() + 1_000 * 2 ** attempt < deadline;
    for (let attempt = 0; ; attempt++) {
      await limiter.acquire(deadline);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : { 'X-Riot-Token': key },
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        if (backoff(attempt)) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        throw new RiotError('network', `Could not reach Riot API (${(error as Error).message})`);
      }
      limiter.adopt(res.headers.get('x-app-rate-limit'));
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) throw new RiotError('not_found', 'Not found', 404);
      if (res.status === 400) throw new RiotError('bad_request', 'Bad request', 400);
      if (res.status === 401 || res.status === 403) {
        if (!opts.token) s.lastKeyError = Date.now();
        throw new RiotError(
          'key',
          opts.token ? 'Riot rejected the sign-in token' : 'Riot rejected the API key — development keys expire after 24 hours',
          res.status,
        );
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** (attempt + 1)) * 1000;
        limiter.block(waitMs);
        if (attempt < retries + 2 && Date.now() + waitMs < deadline) continue;
        throw new RiotError('rate', 'Riot API rate limit reached', 429);
      }
      if (res.status >= 500 && backoff(attempt)) {
        await sleep(1_000 * 2 ** attempt);
        continue;
      }
      throw new RiotError('server', `Riot API error ${res.status}`, res.status);
    }
  };

  const promise = run();
  if (!opts.token) {
    s.inflight.set(url, promise);
    promise.finally(() => s.inflight.delete(url)).catch(() => undefined);
  }
  return promise;
}

/* ── Endpoints (cached) ─────────────────────────────────── */

const MIN = 60_000;
const caches = () =>
  singleton('riot-caches', () => ({
    account: new TtlCache<AccountDto>(2000, 60 * MIN),
    region: new TtlCache<string>(2000, 6 * 60 * MIN),
    summoner: new TtlCache<{ profileIconId: number; summonerLevel: number }>(2000, 30 * MIN),
    league: new TtlCache<LeagueEntryDto[]>(2000, 2 * MIN),
    ladder: new TtlCache<LeagueListDto>(60, 10 * MIN),
    matchIds: new TtlCache<string[]>(2000, 2 * MIN),
    match: new TtlCache<MatchDto>(3000, 24 * 60 * MIN),
  }));

const inflight = new WeakMap<object, Map<string, Promise<unknown>>>();

/** Cached lookups; callers asking for the same thing while it is being fetched share that one request. */
async function cached<T>(cache: TtlCache<T>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let running = inflight.get(cache);
  if (!running) inflight.set(cache, (running = new Map()));
  const shared = running.get(key) as Promise<T> | undefined;
  // If the first caller failed (say it ran out of its own time limit), try again on our own.
  if (shared) return shared.catch(() => load().then((value) => (cache.set(key, value), value)));
  const pending = load()
    .then((value) => (cache.set(key, value), value))
    .finally(() => running.delete(key));
  running.set(key, pending);
  return pending;
}

function platformOrThrow(id: string): Platform {
  const p = getPlatform(normalizePlatform(id) ?? '');
  if (!p) throw new RiotError('bad_request', `Unknown region "${id}"`);
  return p;
}

const enc = encodeURIComponent;

export const getAccountByRiotId = (gameName: string, tagLine: string, opts?: RiotGetOptions) =>
  cached(caches().account, `${gameName}#${tagLine}`.toLowerCase(), () =>
    riotGet<AccountDto>('americas', `/riot/account/v1/accounts/by-riot-id/${enc(gameName)}/${enc(tagLine)}`, opts),
  );

export const getAccountByPuuid = (puuid: string, routing = 'americas', opts?: RiotGetOptions) =>
  cached(caches().account, puuid, () => riotGet<AccountDto>(routing, `/riot/account/v1/accounts/by-puuid/${enc(puuid)}`, opts));

/** The platform where a player is active for TFT (e.g. "na1"), or null. */
export async function getActivePlatform(puuid: string, opts?: RiotGetOptions): Promise<string | null> {
  const hit = caches().region.get(puuid);
  if (hit !== undefined) return hit || null;
  try {
    const res = await riotGet<{ region: string }>('americas', `/riot/account/v1/region/by-game/tft/by-puuid/${enc(puuid)}`, opts);
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
    riotGet<{ profileIconId: number; summonerLevel: number }>(p.id, `/tft/summoner/v1/summoners/by-puuid/${enc(puuid)}`, opts),
  );
}

export async function getLeagueEntries(platform: string, puuid: string, opts?: RiotGetOptions) {
  const p = platformOrThrow(platform);
  return cached(caches().league, `${p.id}:${puuid}`, () => riotGet<LeagueEntryDto[]>(p.id, `/tft/league/v1/by-puuid/${enc(puuid)}`, opts));
}

export type LadderTier = 'challenger' | 'grandmaster' | 'master';

export async function getLadder(platform: string, tier: LadderTier, opts?: RiotGetOptions) {
  const p = platformOrThrow(platform);
  return cached(caches().ladder, `${p.id}:${tier}`, () => riotGet<LeagueListDto>(p.id, `/tft/league/v1/${tier}?queue=RANKED_TFT`, opts));
}

export async function getMatchIds(
  platform: string,
  puuid: string,
  params: { count?: number; start?: number; startTime?: number } = {},
  opts?: RiotGetOptions,
) {
  const p = platformOrThrow(platform);
  const q = new URLSearchParams({ count: String(Math.min(200, Math.max(1, params.count ?? 20))) });
  if (params.start) q.set('start', String(params.start));
  if (params.startTime) q.set('startTime', String(Math.floor(params.startTime / 1000)));
  return cached(caches().matchIds, `${p.match}:${puuid}:${q}`, () =>
    riotGet<string[]>(p.match, `/tft/match/v1/matches/by-puuid/${enc(puuid)}/ids?${q}`, opts),
  );
}

export async function getMatch(matchId: string, opts?: RiotGetOptions) {
  const routing = getPlatform(normalizePlatform(matchId.split('_')[0]) ?? '')?.match;
  if (!routing) throw new RiotError('bad_request', `Cannot route match ${matchId}`);
  return cached(caches().match, matchId, () => riotGet<MatchDto>(routing, `/tft/match/v1/matches/${enc(matchId)}`, opts));
}
