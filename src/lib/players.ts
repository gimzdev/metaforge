import { configuredSetNumber, QUEUES } from '@/config/game';
import { cachedAsync } from '@/lib/cache';
import { matchToRecords, queueOf } from '@/lib/ingest';
import {
  getAccountByPuuid,
  getAccountByRiotId,
  getActivePlatform,
  getLadder,
  getLeagueEntries,
  getMatch,
  getMatchIds,
  getSummoner,
  RiotError,
  type LadderTier,
  type LeagueEntryDto,
  type MatchDto,
} from '@/lib/riot/api';
import { getPlatform, normalizePlatform, PLATFORMS } from '@/lib/riot/regions';
import { getStore } from '@/lib/store';

export interface PlayerProfile {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  profileIconId: number | null;
  summonerLevel: number | null;
  ranked: LeagueEntryDto[];
}

export async function lookupPlayer(gameName: string, tagLine: string, regionHint?: string | null): Promise<PlayerProfile> {
  const account = await getAccountByRiotId(gameName, tagLine);
  let platform = normalizePlatform(regionHint ?? '') ?? null;
  try {
    platform = (await getActivePlatform(account.puuid)) ?? platform;
  } catch (error) {
    if (!(error instanceof RiotError) || error.code === 'key') throw error;
  }
  if (!platform) platform = 'na1';
  let summoner: { profileIconId: number; summonerLevel: number } | null = null;
  try {
    summoner = await getSummoner(platform, account.puuid);
  } catch (error) {
    if (!(error instanceof RiotError) || error.code !== 'not_found') throw error;
  }
  let ranked: LeagueEntryDto[] = [];
  try {
    ranked = await getLeagueEntries(platform, account.puuid);
  } catch (error) {
    if (!(error instanceof RiotError) || error.code !== 'not_found') throw error;
  }
  void getStore()
    .upsertPlayers([
      { puuid: account.puuid, gameName: account.gameName ?? gameName, tagLine: account.tagLine ?? tagLine, platform },
    ])
    .catch(() => undefined);
  return {
    puuid: account.puuid,
    gameName: account.gameName ?? gameName,
    tagLine: account.tagLine ?? tagLine,
    platform,
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

function toMatchView(match: MatchDto, puuid: string): MatchView {
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
      damage: p.total_damage_to_players ?? 0,
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

export async function getPlayerMatches(puuid: string, platform: string, start = 0, count = 10): Promise<MatchView[]> {
  const ids = await getMatchIds(platform, puuid, { start, count });
  const store = getStore();
  const setNumber = configuredSetNumber();
  const views: Array<MatchView | null> = new Array(ids.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(10, ids.length) }, async () => {
      while (next < ids.length) {
        const i = next++;
        try {
          const match = await getMatch(ids[i]);
          views[i] = toMatchView(match, puuid);
          // Every lookup also grows the stats sample.
          const known = await store.knownMatchIds([match.metadata.match_id]);
          if (!known.size) {
            const { record, boards, players } = matchToRecords(match, setNumber);
            await store.saveMatch(record, boards);
            await store.upsertPlayers(players);
          }
        } catch (error) {
          if (error instanceof RiotError && error.code === 'key') throw error;
        }
      }
    }),
  );
  return views.filter((v): v is MatchView => Boolean(v));
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
  return (list.entries ?? [])
    .filter((e) => e.puuid)
    .map((e) => ({
      puuid: e.puuid,
      platform,
      tier: list.tier || tier.toUpperCase(),
      lp: e.leaguePoints,
      wins: e.wins,
      games: e.wins + e.losses,
      hotStreak: e.hotStreak,
    }));
}

/** Top players on one server, or on every server merged by LP when platformInput is "all". */
export async function getLeaderboard(platformInput: string, limit = 100) {
  const all = platformInput.toLowerCase() === 'all';
  const platform = all ? 'all' : getPlatform(normalizePlatform(platformInput) ?? '')?.id;
  if (!platform) throw new RiotError('bad_request', 'Unknown region');
  return cachedAsync(`ladder:${platform}:${limit}`, (all ? 10 : 5) * 60_000, async () => {
    const tiers: LadderTier[] = ['challenger', 'grandmaster', 'master'];
    let rows: LadderRow[] = [];
    if (all) {
      // Every server's Challenger list (one call each, spread over separate rate limits), merged by LP.
      const lists = await Promise.allSettled(PLATFORMS.map((p) => getLadder(p.id, 'challenger')));
      const failed = lists.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      lists.forEach((r, i) => {
        if (r.status === 'fulfilled') rows.push(...ladderRows(PLATFORMS[i].id, r.value, 'challenger'));
      });
      if (!rows.length && failed) throw failed.reason;
      rows.sort((a, b) => b.lp - a.lp);
    } else {
      for (const tier of tiers) {
        const list = await getLadder(platform, tier);
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
          const acc = await getAccountByPuuid(r.puuid, getPlatform(r.platform)?.account ?? 'americas', {
            deadline: Date.now() + 12_000,
          });
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
    await store
      .upsertPlayers(rows.map((r) => ({ puuid: r.puuid, platform: r.platform, tier: r.tier, lp: r.lp })))
      .catch(() => undefined);
    const entries: LadderEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      ...r,
      gameName: names.get(r.puuid)?.gameName ?? null,
      tagLine: names.get(r.puuid)?.tagLine ?? null,
    }));
    return { platform, updatedAt: Date.now(), entries };
  });
}

/* ── Ranked tier display ────────────────────────────────── */

const TIER_COLOR: Record<string, string> = {
  IRON: '#8d807a',
  BRONZE: '#c08a5f',
  SILVER: '#b7c4ce',
  GOLD: '#e9bd5b',
  PLATINUM: '#4fc9b8',
  EMERALD: '#38c983',
  DIAMOND: '#7d98ff',
  MASTER: '#c07bff',
  GRANDMASTER: '#ff6b78',
  CHALLENGER: '#f9d977',
  // Hyper Roll rated tiers
  GRAY: '#a3adb5',
  GREEN: '#5fd08b',
  BLUE: '#5aa9ff',
  PURPLE: '#b98bff',
  HYPER: '#ff9a4d',
  ORANGE: '#ff9a4d',
};

export function tierColor(tier: string | null | undefined): string {
  return TIER_COLOR[(tier ?? '').toUpperCase()] ?? '#9cb4a8';
}

function tierName(tier: string | null | undefined): string {
  const t = (tier ?? '').toLowerCase();
  if (!t) return 'Unranked';
  if (t === 'grandmaster') return 'Grandmaster';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function rankLabel(tier?: string | null, division?: string | null): string {
  if (!tier) return 'Unranked';
  return APEX.has(tier.toUpperCase()) || !division ? tierName(tier) : `${tierName(tier)} ${division}`;
}

export function profileIconUrl(id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;
}
