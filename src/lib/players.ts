import { configuredSetNumber, QUEUES } from '@/config/game';
import { cachedAsync } from '@/lib/cache';
import { mapLimit, matchToRecords, queueOf } from '@/lib/ingest';
import { getAccountByPuuid, getAccountByRiotId, getActivePlatform, getLadder, getLeagueEntries, getMatch, getMatchIds, getSummoner, RiotError } from '@/lib/riot/api';
import type { LadderTier, LeagueEntryDto, MatchDto } from '@/lib/riot/api';
import { getPlatform, normalizePlatform, PLATFORMS } from '@/lib/riot/regions';
import { legendsById, type Legend } from '@/lib/legends';
import { getStore, type PlayerRecord } from '@/lib/store';

export { rankLabel, tierColor } from '@/lib/rank';

export interface PlayerProfile {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  profileIconId: number | null;
  summonerLevel: number | null;
  ranked: LeagueEntryDto[];
}

/** After this long a lookup shows an error instead of keeping the page loading. */
const LOOKUP_MS = 20_000;

/** null when Riot has no such record (no summoner on that server, no ranked entries). */
async function unlessNotFound<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof RiotError && error.code === 'not_found') return null;
    throw error;
  }
}

export async function lookupPlayer(gameName: string, tagLine: string, regionHint?: string | null): Promise<PlayerProfile> {
  const deadline = Date.now() + LOOKUP_MS;
  const account = await getAccountByRiotId(gameName, tagLine, { deadline });
  let platform = normalizePlatform(regionHint ?? '') ?? null;
  try {
    platform = (await getActivePlatform(account.puuid, { deadline })) ?? platform;
  } catch (error) {
    if (!(error instanceof RiotError) || error.code === 'key') throw error;
  }
  platform ??= 'na1';
  const [summoner, ranked] = await Promise.all([
    unlessNotFound(getSummoner(platform, account.puuid, { deadline })),
    unlessNotFound(getLeagueEntries(platform, account.puuid, { deadline })).then((entries) => entries ?? ([] as LeagueEntryDto[])),
  ]);
  const player = { puuid: account.puuid, gameName: account.gameName ?? gameName, tagLine: account.tagLine ?? tagLine, platform };
  const store = getStore();
  const main = ranked.find((r) => r.queueType === 'RANKED_TFT');
  void store.upsertPlayers([{ ...player, tier: main?.tier ?? null, lp: main?.leaguePoints ?? null }]).catch(() => undefined);
  // A viewed profile starts (or extends) its LP curve; awaited so the page's curve ends on this rank.
  if (main?.tier) await store.recordLp([{ puuid: account.puuid, platform, tier: main.tier, division: main.rank ?? null, lp: main.leaguePoints ?? 0 }], true).catch(() => undefined);
  return {
    ...player,
    profileIconId: summoner?.profileIconId ?? null,
    summonerLevel: summoner?.summonerLevel ?? null,
    ranked,
  };
}

export interface BoardView {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  placement: number;
  level: number;
  lastRound: number;
  goldLeft: number;
  damage: number;
  units: Array<{ id: string; star: number; items: string[] }>;
  traits: Array<{ id: string; n: number; style: number; tier: number }>;
  augments: string[];
  partner: number | null;
  /** The player's Little Legend, when Riot sent one and its picture is known. */
  legend: Legend | null;
}

export interface MatchView {
  id: string;
  datetime: number;
  length: number;
  queue: number;
  queueLabel: string;
  setNumber: number;
  me: BoardView | null;
  lobby: BoardView[];
}

/** Riot's damage-to-players field, under whichever spelling the match carries. */
function damageOf(p: MatchDto['info']['participants'][number]): number {
  const raw = p as unknown as Record<string, unknown>;
  const v = Number(p.total_damage_to_players ?? raw.totalDamageToPlayers ?? raw.damage_to_players ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function toMatchView(match: MatchDto, puuid: string, legends: Map<string, Legend>): MatchView {
  const queue = queueOf(match);
  const lobby: BoardView[] = (match.info.participants ?? [])
    .map((p) => ({
      puuid: p.puuid,
      gameName: p.riotIdGameName ?? null,
      tagLine: p.riotIdTagline ?? null,
      placement: p.placement,
      level: p.level,
      lastRound: p.last_round ?? 0,
      goldLeft: p.gold_left ?? 0,
      damage: damageOf(p),
      units: (p.units ?? []).map((u) => ({
        id: String(u.character_id).toLowerCase(),
        star: u.tier ?? 1,
        items: (u.itemNames ?? []).map((i) => i.toLowerCase()),
      })),
      traits: (p.traits ?? [])
        .filter((t) => t.tier_current > 0)
        .map((t) => ({ id: t.name.toLowerCase(), n: t.num_units, style: t.style ?? 0, tier: t.tier_current })),
      augments: (p.augments ?? []).map((a) => a.toLowerCase()),
      partner: p.partner_group_id ?? null,
      legend: (p.companion?.content_ID && legends.get(p.companion.content_ID.toLowerCase())) || null,
    }))
    .sort((a, b) => a.placement - b.placement);
  return {
    id: match.metadata.match_id,
    datetime: match.info.game_datetime,
    length: match.info.game_length,
    queue,
    queueLabel: QUEUES[queue] ?? 'Special mode',
    setNumber: match.info.tft_set_number,
    me: lobby.find((b) => b.puuid === puuid) ?? null,
    lobby,
  };
}

/** Every lookup also grows the stats sample with the matches not stored yet. */
async function saveNewMatches(matches: MatchDto[]) {
  const store = getStore();
  const known = await store.knownMatchIds(matches.map((m) => m.metadata.match_id));
  const setNumber = configuredSetNumber();
  const players: PlayerRecord[] = [];
  let failed: unknown = null;
  await mapLimit(matches.filter((m) => !known.has(m.metadata.match_id)), 4, async (match) => {
    try {
      const { record, boards, players: seen } = matchToRecords(match, setNumber);
      await store.saveMatch(record, boards);
      players.push(...seen);
    } catch (error) {
      failed = error;
    }
  });
  if (players.length) await store.upsertPlayers(players);
  if (failed) throw failed;
}

/** One page of a player's games, newest first; `more` when Riot listed a full page. */
export async function getPlayerMatches(puuid: string, platform: string, start = 0, count = 10): Promise<{ matches: MatchView[]; more: boolean }> {
  // A game Riot cannot return in time is left out of the page rather than holding it up.
  const deadline = Date.now() + LOOKUP_MS;
  const ids = await getMatchIds(platform, puuid, { start, count }, { deadline });
  const views: Array<MatchView | null> = new Array(ids.length).fill(null);
  const fetched: MatchDto[] = [];
  const legends = await legendsById();
  await mapLimit([...ids.keys()], 10, async (i) => {
    try {
      const match = await getMatch(ids[i], { deadline });
      views[i] = toMatchView(match, puuid, legends);
      fetched.push(match);
    } catch (error) {
      if (error instanceof RiotError && error.code === 'key') throw error;
    }
  });
  await saveNewMatches(fetched).catch((error) => console.warn('[metaforge] saving looked-up matches failed:', error instanceof Error ? error.message : error));
  return { matches: views.filter((v): v is MatchView => Boolean(v)), more: ids.length >= count };
}

interface LadderEntry {
  rank: number;
  puuid: string;
  /** Server the player is ranked on. */
  platform: string;
  gameName: string | null;
  tagLine: string | null;
  tier: string;
  lp: number;
  wins: number;
  games: number;
  hotStreak: boolean;
}

type LadderRow = Omit<LadderEntry, 'rank' | 'gameName' | 'tagLine'>;

function ladderRows(platform: string, list: Awaited<ReturnType<typeof getLadder>>, tier: LadderTier): LadderRow[] {
  const t = list.tier || tier.toUpperCase();
  return (list.entries ?? [])
    .filter((e) => e.puuid)
    .map((e) => ({ puuid: e.puuid, platform, tier: t, lp: e.leaguePoints, wins: e.wins, games: e.wins + e.losses, hotStreak: e.hotStreak }));
}

/** Top players on one server, or on every server merged by LP when platformInput is "all". */
export async function getLeaderboard(platformInput: string, limit = 100) {
  const all = platformInput.toLowerCase() === 'all';
  const platform = all ? 'all' : getPlatform(normalizePlatform(platformInput) ?? '')?.id;
  if (!platform) throw new RiotError('bad_request', 'Unknown region');
  return cachedAsync(`ladder:${platform}:${limit}`, (all ? 10 : 5) * 60_000, async () => {
    const deadline = Date.now() + LOOKUP_MS;
    let rows: LadderRow[] = [];
    if (all) {
      // One Challenger call per server (separate rate limits), merged by LP.
      const lists = await Promise.allSettled(PLATFORMS.map((p) => getLadder(p.id, 'challenger', { deadline })));
      const failed = lists.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      lists.forEach((r, i) => {
        if (r.status === 'fulfilled') rows.push(...ladderRows(PLATFORMS[i].id, r.value, 'challenger'));
      });
      if (!rows.length && failed) throw failed.reason;
      rows.sort((a, b) => b.lp - a.lp);
    } else {
      for (const tier of ['challenger', 'grandmaster', 'master'] as LadderTier[]) {
        const list = await getLadder(platform, tier, { deadline });
        rows.push(...ladderRows(platform, list, tier).sort((a, b) => b.lp - a.lp));
        if (rows.length >= limit) break;
      }
    }
    rows = rows.slice(0, limit);

    const store = getStore();
    const known = await store.getPlayers(rows.map((r) => r.puuid)).catch(() => new Map());
    const missing = rows.filter((r) => !known.get(r.puuid)?.gameName).slice(0, all ? 40 : 30);
    const resolved = await Promise.all(
      missing.map(async (r) => {
        try {
          const acc = await getAccountByPuuid(r.puuid, getPlatform(r.platform)?.account ?? 'americas', { deadline: Date.now() + 12_000 });
          return { puuid: r.puuid, gameName: acc.gameName ?? null, tagLine: acc.tagLine ?? null, platform: r.platform };
        } catch {
          return null;
        }
      }),
    );
    const fresh = resolved.filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (fresh.length) await store.upsertPlayers(fresh).catch(() => undefined);
    const names = new Map([...known.entries()].map(([k, v]) => [k, { gameName: v.gameName, tagLine: v.tagLine }]));
    for (const f of fresh) names.set(f.puuid, { gameName: f.gameName, tagLine: f.tagLine });
    await store.upsertPlayers(rows.map((r) => ({ puuid: r.puuid, platform: r.platform, tier: r.tier, lp: r.lp }))).catch(() => undefined);
    const entries: LadderEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      ...r,
      gameName: names.get(r.puuid)?.gameName ?? null,
      tagLine: names.get(r.puuid)?.tagLine ?? null,
    }));
    return { platform, updatedAt: Date.now(), entries };
  });
}

export function profileIconUrl(id: number | null | undefined): string | null {
  return id == null ? null : `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;
}
