/** Persistence contract for collected matches, implemented by Postgres and local files. */

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

export interface MatchQuery {
  setNumber: number;
  queueId: number;
  since: number;
  limit: number;
  /** Cursor from an earlier read: only matches stored after it. */
  after: string | null;
  /** How many matches in range the caller holds from earlier reads: a store that finds fewer reads everything again. */
  known?: number;
}

export interface StoredMatch {
  matchId: string;
  platform: string;
  datetime: number;
  boards: BoardRecord[];
}

export interface Store {
  kind: 'postgres' | 'file';
  describe(): string;
  init(): Promise<void>;
  knownMatchIds(ids: string[]): Promise<Set<string>>;
  saveMatch(match: MatchRecord, boards: BoardRecord[]): Promise<void>;
  /**
   * Stream stored matches with their boards (the newest, up to about query.limit boards; in no set order).
   * Resolves with a cursor for the next incremental read; `full` is false when only
   * matches stored after query.after were read.
   */
  readMatches(query: MatchQuery, onMatch: (match: StoredMatch) => void): Promise<{ cursor: string; full: boolean }>;
  /** Cheap token that changes whenever matches are added or removed. */
  changeToken(setNumber: number): Promise<string>;
  /** Delete matches played before the given time. Resolves with the number removed. */
  prune(before: number): Promise<number>;
  upsertPlayers(players: PlayerRecord[]): Promise<void>;
  getPlayers(puuids: string[]): Promise<Map<string, PlayerRecord>>;
  getKv<T>(key: string): Promise<T | null>;
  setKv(key: string, value: unknown): Promise<void>;
  /** Delete key-value entries whose key starts with `prefix` and that were last written before `before` (epoch ms). */
  pruneKv(prefix: string, before: number): Promise<number>;
  /** Binary cache entries (the compact board snapshot). */
  getBlob(key: string): Promise<Buffer | null>;
  setBlob(key: string, value: Buffer): Promise<void>;
  stats(setNumber: number): Promise<StoreStats>;
}

/** Merge repeated players, keeping the newest non-empty value of each field. */
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
