import { RANKED_QUEUE } from '@/config/game';
import { normalizePlatform } from '@/lib/riot/regions';
import type { MatchDto } from '@/lib/riot/types';
import type { BoardRecord, MatchRecord, PlayerRecord } from '@/lib/store/types';

export function platformFromMatchId(matchId: string): string {
  return normalizePlatform(matchId.split('_')[0]) ?? 'unknown';
}

export function queueOf(match: MatchDto): number {
  return Number(match.info.queue_id ?? match.info.queueId ?? 0);
}

/** Convert a Riot match into storage records. Boards are kept for ranked games of the tracked set only. */
export function matchToRecords(match: MatchDto, setNumber: number) {
  const info = match.info;
  const platform = platformFromMatchId(match.metadata.match_id);
  const queueId = queueOf(match);
  const participants = Array.isArray(info.participants) ? info.participants : [];
  const standard = !info.tft_game_type || info.tft_game_type === 'standard';
  const eligible =
    info.tft_set_number === setNumber && queueId === RANKED_QUEUE && standard && participants.length >= 8;

  const record: MatchRecord = {
    matchId: match.metadata.match_id,
    platform,
    setNumber: Number(info.tft_set_number) || 0,
    queueId,
    datetime: Number(info.game_datetime) || Date.now(),
    gameVersion: String(info.game_version ?? ''),
    boardsStored: eligible,
  };

  const boards: BoardRecord[] = eligible
    ? participants.map((p) => ({
        matchId: record.matchId,
        puuid: p.puuid,
        platform,
        datetime: record.datetime,
        placement: Math.min(8, Math.max(1, Number(p.placement) || 8)),
        level: Number(p.level) || 0,
        goldLeft: Number(p.gold_left) || 0,
        lastRound: Number(p.last_round) || 0,
        damage: Number(p.total_damage_to_players) || 0,
        units: (p.units ?? [])
          .filter((u) => typeof u?.character_id === 'string' && u.character_id)
          .map((u) => [
            u.character_id,
            Math.min(4, Math.max(1, Number(u.tier) || 1)),
            (u.itemNames ?? []).filter((i): i is string => typeof i === 'string' && i.length > 0),
          ]),
        traits: (p.traits ?? [])
          .filter((t) => typeof t?.name === 'string' && Number(t.tier_current) > 0)
          .map((t) => [t.name, Number(t.num_units) || 0, Number(t.style) || 0, Number(t.tier_current) || 0]),
        augments: Array.isArray(p.augments) ? p.augments.filter((a): a is string => typeof a === 'string') : [],
      }))
    : [];

  const players: PlayerRecord[] = participants
    .filter((p) => p.puuid)
    .map((p) => ({
      puuid: p.puuid,
      gameName: p.riotIdGameName || null,
      tagLine: p.riotIdTagline || null,
      platform,
    }));

  return { record, boards, players };
}
