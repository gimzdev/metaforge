/** Persistence contract for collected matches. Implemented by Postgres and a local file store. */

/** One player's final board. Units: [characterId, star, items]; traits: [name, numUnits, style, tier]. */
export interface BoardRecord {
  matchId: string;
  puuid: string;
  platform: string;
  datetime: number;
  placement: number;
  level: number;
  goldLeft: number;
  lastRound: number;
  damage: number;
  units: Array<[string, number, string[]]>;
  traits: Array<[string, number, number, number]>;
  augments: string[];
}

export interface MatchRecord {
  matchId: string;
  platform: string;
  setNumber: number;
  queueId: number;
  datetime: number;
  gameVersion: string;
  /** Boards are only stored for ranked games of the tracked set. */
  boardsStored: boolean;
}

export interface PlayerRecord {
  puuid: string;
  gameName?: string | null;
  tagLine?: string | null;
  platform?: string | null;
  tier?: string | null;
  lp?: number | null;
  updatedAt?: number;
}

export interface StoreStats {
  matches: number;
  boards: number;
  firstMatchAt: number | null;
  lastMatchAt: number | null;
}

export interface BoardQuery {
  setNumber: number;
  queueId: number;
  since: number;
  limit: number;
}

export interface Store {
  kind: 'postgres' | 'file';
  describe(): string;
  init(): Promise<void>;
  knownMatchIds(ids: string[]): Promise<Set<string>>;
  saveMatch(match: MatchRecord, boards: BoardRecord[]): Promise<void>;
  /**
   * Stream the newest boards matching the query (up to query.limit) without
   * holding them all in memory. Resolves with the number of boards delivered.
   */
  forEachBoard(query: BoardQuery, onBoard: (board: BoardRecord) => void): Promise<number>;
  /** Cheap token that changes whenever matches are added or removed. */
  changeToken(setNumber: number): Promise<string>;
  /** Delete matches played before the given time. Resolves with the number removed. */
  prune(before: number): Promise<number>;
  upsertPlayers(players: PlayerRecord[]): Promise<void>;
  getPlayers(puuids: string[]): Promise<Map<string, PlayerRecord>>;
  getKv<T>(key: string): Promise<T | null>;
  setKv(key: string, value: unknown): Promise<void>;
  stats(setNumber: number): Promise<StoreStats>;
}

export function dedupePlayers(players: PlayerRecord[]): PlayerRecord[] {
  const merged = new Map<string, PlayerRecord>();
  for (const p of players) {
    if (!p.puuid) continue;
    const prev = merged.get(p.puuid);
    merged.set(p.puuid, {
      puuid: p.puuid,
      gameName: p.gameName ?? prev?.gameName ?? null,
      tagLine: p.tagLine ?? prev?.tagLine ?? null,
      platform: p.platform ?? prev?.platform ?? null,
      tier: p.tier ?? prev?.tier ?? null,
      lp: p.lp ?? prev?.lp ?? null,
    });
  }
  return [...merged.values()];
}
