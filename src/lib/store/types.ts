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

/** A rank seen at a time (hourly at most; only changes are kept). */
export interface LpPoint {
  at: number;
  tier: string;
  division: string | null;
  lp: number;
}

/** A rank to remember for a player. */
export interface LpSeen {
  puuid: string;
  platform: string;
  tier: string;
  division: string | null;
  lp: number;
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
  /** Stream the newest matches (about query.limit boards, any order); `full` is false when only those after query.after were read. */
  readMatches(query: MatchQuery, onMatch: (match: StoredMatch) => void): Promise<{ cursor: string; full: boolean }>;
  /** Cheap token that changes whenever matches are added or removed. */
  changeToken(setNumber: number): Promise<string>;
  /** Resolves with the number removed. */
  prune(before: number): Promise<number>;
  /** Missing fields keep their stored value. An empty gameName and tagLine mark an account Riot no longer knows. */
  upsertPlayers(players: PlayerRecord[]): Promise<void>;
  getPlayers(puuids: string[]): Promise<Map<string, PlayerRecord>>;
  /**
   * Remember ranks for LP curves: a point per player per hour, skipped when nothing changed. `track` starts a curve
   * (a profile view); otherwise only players who already have one get points (the crawl), which keeps the table small.
   */
  recordLp(seen: LpSeen[], track: boolean): Promise<void>;
  /** A player's points since `since` (epoch ms), oldest first. */
  lpHistory(puuid: string, since: number): Promise<LpPoint[]>;
  /** Drop points older than `before`. */
  pruneLp(before: number): Promise<number>;
  /** Tagged players matching a name (see nameMatch: whole, start, later word, inside), then the `prefer`red server, then LP. Bounded candidates. */
  searchPlayers(prefix: string, opts?: { platform?: string; prefer?: string; limit?: number }): Promise<PlayerRecord[]>;
  /** Players without a Riot ID yet (best ranked first, never those marked unknown), for the crawl to name. */
  unnamedPlayers(limit: number): Promise<PlayerRecord[]>;
  /** Prepare searching inside names, where the store needs an index for it (Postgres). */
  ensureNameSearch?(): Promise<void>;
  /** Hold `key` for `ms` across every server sharing this store; a token for release(), or null when taken. */
  claim(key: string, ms: number): Promise<string | null>;
  /** A claim that expired and passed to someone else is left alone. */
  release(key: string, token: string): Promise<void>;
  getKv<T>(key: string): Promise<T | null>;
  setKv(key: string, value: unknown): Promise<void>;
  /** Delete entries under `prefix` last written before `before` (epoch ms). */
  pruneKv(prefix: string, before: number): Promise<number>;
  getBlob(key: string): Promise<Buffer | null>;
  setBlob(key: string, value: Buffer): Promise<void>;
  stats(setNumber: number): Promise<StoreStats>;
}

/** `p`'s fields, falling back to `prev`'s where missing. */
export const mergePlayer = (p: PlayerRecord, prev?: PlayerRecord): PlayerRecord => ({
  puuid: p.puuid,
  gameName: p.gameName ?? prev?.gameName ?? null,
  tagLine: p.tagLine ?? prev?.tagLine ?? null,
  platform: p.platform ?? prev?.platform ?? null,
  tier: p.tier ?? prev?.tier ?? null,
  lp: p.lp ?? prev?.lp ?? null,
});

/** Merge repeated players, keeping the newest non-empty value of each field. */
export function dedupePlayers(players: PlayerRecord[]): PlayerRecord[] {
  const merged = new Map<string, PlayerRecord>();
  for (const p of players) if (p.puuid) merged.set(p.puuid, mergePlayer(p, merged.get(p.puuid)));
  return [...merged.values()];
}
