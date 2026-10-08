import { randomUUID } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
import { env } from '@/lib/env';
import { dedupePlayers, type LpPoint, type LpSeen, type BoardRecord, type MatchQuery, type MatchRecord, type PlayerRecord, type Store, type StoreStats, type StoredMatch } from './types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mf_matches (
  match_id       text PRIMARY KEY,
  platform       text NOT NULL,
  set_number     integer NOT NULL,
  queue_id       integer NOT NULL,
  game_datetime  bigint NOT NULL,
  game_version   text,
  boards_stored  boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mf_matches_set_time ON mf_matches (set_number, queue_id, game_datetime DESC);
CREATE INDEX IF NOT EXISTS mf_matches_created ON mf_matches (created_at);

CREATE TABLE IF NOT EXISTS mf_boards (
  match_id    text NOT NULL REFERENCES mf_matches(match_id) ON DELETE CASCADE,
  puuid       text NOT NULL,
  placement   smallint NOT NULL,
  level       smallint NOT NULL,
  gold_left   smallint NOT NULL DEFAULT 0,
  last_round  smallint NOT NULL DEFAULT 0,
  damage      integer NOT NULL DEFAULT 0,
  units       jsonb NOT NULL,
  traits      jsonb NOT NULL,
  augments    jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (match_id, puuid)
);

CREATE TABLE IF NOT EXISTS mf_players (
  puuid       text PRIMARY KEY,
  game_name   text,
  tag_line    text,
  platform    text,
  tier        text,
  lp          integer,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mf_players_name_idx ON mf_players (lower(game_name) text_pattern_ops);

CREATE TABLE IF NOT EXISTS mf_lp (
  puuid       text NOT NULL,
  at          timestamptz NOT NULL,
  platform    text,
  tier        text NOT NULL,
  division    text,
  lp          integer NOT NULL,
  PRIMARY KEY (puuid, at)
);

CREATE TABLE IF NOT EXISTS mf_kv (
  k           text PRIMARY KEY,
  v           jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mf_blob (
  k           text PRIMARY KEY,
  v           bytea NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
`;

/** Skip SCHEMA when all of these exist: CREATE INDEX IF NOT EXISTS still takes a SHARE lock and blocks other servers' writes. */
const SCHEMA_OBJECTS = [...SCHEMA.matchAll(/CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/g)].map((m) => m[1]);

/** Connection dropped by the server or network (Neon restarting/scaling a compute, a frozen instance's stale socket). */
function droppedConnection(error: unknown) {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  return (
    ['57P01', '57P02', '57P03', '08000', '08003', '08006', 'ECONNRESET', 'EPIPE'].includes(code) ||
    /Connection terminated unexpectedly|not queryable/i.test(typeof e?.message === 'string' ? e.message : '')
  );
}

/** Bounds the ranking work for a very common name prefix ("ma") in a directory of millions. */
const SEARCH_CANDIDATES = 2000;

/** pg treats sslmode=require/prefer/verify-ca as verify-full but warns each start; spell it out unless libpq semantics are asked for. */
function normalizeSslMode(url: string): string {
  return /uselibpqcompat=/i.test(url) ? url : url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/i, '$1verify-full');
}

type PlayerRow = { puuid: string; game_name: string | null; tag_line: string | null; platform: string | null; tier: string | null; lp: number | null; updated_at: string };
const PLAYER_COLS = 'puuid, game_name, tag_line, platform, tier, lp, updated_at';
const toPlayer = (r: PlayerRow): PlayerRecord =>
  ({ puuid: r.puuid, gameName: r.game_name, tagLine: r.tag_line, platform: r.platform, tier: r.tier, lp: r.lp, updatedAt: new Date(r.updated_at).getTime() });

export class PostgresStore implements Store {
  kind = 'postgres' as const;
  private pool: Pool;
  private ready: Promise<void> | null = null;
  private channelBinding: boolean;

  constructor(private readonly connectionString: string) {
    this.channelBinding = /[?&]channel_binding=require\b/i.test(connectionString);
    this.pool = this.createPool();
  }

  private createPool() {
    const pool = new Pool({
      connectionString: normalizeSslMode(this.connectionString),
      enableChannelBinding: this.channelBinding,
      max: env.databasePoolMax,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    });
    pool.on('error', (err) => console.error('[metaforge] postgres pool error:', err.message));
    return pool;
  }

  describe() {
    // Never the host: this string is shown on public pages.
    const host = URL.canParse(env.databaseUrl) ? new URL(env.databaseUrl).hostname : '';
    if (host.endsWith('neon.tech')) return 'Postgres (Neon)';
    if (host.includes('supabase')) return 'Postgres (Supabase)';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'Postgres (local)';
    return 'Postgres';
  }

  private async ensureSchema() {
    const res = await this.pool.query<{ n: number }>('SELECT count(to_regclass(name))::int AS n FROM unnest($1::text[]) AS name', [SCHEMA_OBJECTS]);
    if ((res.rows[0]?.n ?? 0) < SCHEMA_OBJECTS.length) await this.pool.query(SCHEMA);
  }

  init() {
    this.ready ??= this.ensureSchema()
      .catch(async (error: Error) => {
        // A server or proxy without channel binding: fall back to plain SCRAM (still over TLS).
        if (!this.channelBinding || !/SASL|SCRAM|channel binding/i.test(error.message)) throw error;
        console.warn(`[metaforge] postgres channel binding failed (${error.message}); retrying without it`);
        this.channelBinding = false;
        const old = this.pool;
        this.pool = this.createPool();
        void old.end().catch(() => undefined);
        return this.ensureSchema();
      })
      .catch((error) => {
        this.ready = null;
        throw error;
      });
    return this.ready;
  }

  /** Statements sent here are idempotent, so a dropped connection gets one retry. */
  private async query<R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    await this.init();
    try {
      return await this.pool.query<R>(sql, params);
    } catch (error) {
      if (!droppedConnection(error)) throw error;
      return this.pool.query<R>(sql, params);
    }
  }

  async knownMatchIds(ids: string[]) {
    if (!ids.length) return new Set<string>();
    const res = await this.query<{ match_id: string }>('SELECT match_id FROM mf_matches WHERE match_id = ANY($1::text[])', [ids]);
    return new Set(res.rows.map((r) => r.match_id));
  }

  async saveMatch(match: MatchRecord, boards: BoardRecord[]) {
    await this.init();
    try {
      await this.saveMatchOnce(match, boards);
    } catch (error) {
      // Only ON CONFLICT DO NOTHING inserts, so it can run again.
      if (!droppedConnection(error)) throw error;
      await this.saveMatchOnce(match, boards);
    }
  }

  private async saveMatchOnce(match: MatchRecord, boards: BoardRecord[]) {
    const client = await this.pool.connect();
    let broken: Error | undefined;
    // pg-pool ignores a checked-out client's errors; a drop mid-transaction would emit 'error' unheard and kill the process.
    const onError = (error: Error) => {
      broken = error;
    };
    client.on('error', onError);
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO mf_matches (match_id, platform, set_number, queue_id, game_datetime, game_version, boards_stored)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (match_id) DO NOTHING`,
        [match.matchId, match.platform, match.setNumber, match.queueId, match.datetime, match.gameVersion, match.boardsStored && boards.length > 0],
      );
      if (boards.length) {
        const values: unknown[] = [];
        const rows = boards.map((b, i) => {
          const o = i * 10;
          values.push(b.matchId, b.puuid, b.placement, b.level, b.goldLeft, b.lastRound, b.damage, JSON.stringify(b.units), JSON.stringify(b.traits), JSON.stringify(b.augments));
          return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8}::jsonb,$${o + 9}::jsonb,$${o + 10}::jsonb)`;
        });
        await client.query(
          `INSERT INTO mf_boards (match_id, puuid, placement, level, gold_left, last_round, damage, units, traits, augments)
           VALUES ${rows.join(',')} ON CONFLICT (match_id, puuid) DO NOTHING`,
          values,
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      // release(error) destroys a dead connection instead of pooling it.
      if (droppedConnection(error)) broken ??= error as Error;
      throw error;
    } finally {
      client.removeListener('error', onError);
      client.release(broken);
    }
  }

  async readMatches(q: MatchQuery, onMatch: (match: StoredMatch) => void) {
    // Cursor = DB clock at read start; incremental reads look 5 min further back for late commits (duplicates merge).
    const clock = await this.query<{ now: string }>('SELECT (extract(epoch FROM now()) * 1000)::bigint::text AS now');
    let after = q.after && /^\d+$/.test(q.after) ? Number(q.after) - 5 * 60_000 : null;
    if (after !== null && q.known) {
      // Fewer stored than the caller holds: some were deleted, so start over.
      const res = await this.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM mf_matches WHERE set_number = $1 AND queue_id = $2 AND boards_stored
            AND game_datetime >= $3 AND created_at <= to_timestamp($4::double precision / 1000)`,
        [q.setNumber, q.queueId, q.since, Number(q.after)],
      );
      if ((res.rows[0]?.n ?? 0) < q.known) after = null;
    }
    const PAGE = 800;
    let key: { t: string; id: string } | null = null;
    let delivered = 0;
    while (delivered < q.limit) {
      const params: unknown[] = [q.setNumber, q.queueId, q.since, PAGE];
      let where = 'set_number = $1 AND queue_id = $2 AND boards_stored AND game_datetime >= $3';
      if (after !== null) {
        params.push(after);
        where += ` AND created_at > to_timestamp($${params.length}::double precision / 1000)`;
      }
      if (key) {
        params.push(key.t, key.id);
        where += ` AND (game_datetime, match_id) < ($${params.length - 1}, $${params.length})`;
      }
      const page = await this.query<{ match_id: string; platform: string; game_datetime: string }>(
        `SELECT match_id, platform, game_datetime FROM mf_matches WHERE ${where} ORDER BY game_datetime DESC, match_id DESC LIMIT $4`,
        params,
      );
      if (!page.rows.length) break;
      const last = page.rows[page.rows.length - 1];
      key = { t: last.game_datetime, id: last.match_id };
      const res = await this.query<{
        match_id: string;
        puuid: string;
        placement: number;
        level: number;
        gold_left: number;
        last_round: number;
        damage: number;
        units: BoardRecord['units'];
        traits: BoardRecord['traits'];
        augments: string[] | null;
      }>(
        `SELECT match_id, puuid, placement, level, gold_left, last_round, damage, units, traits, augments
           FROM mf_boards WHERE match_id = ANY($1::text[])`,
        [page.rows.map((r) => r.match_id)],
      );
      const byMatch = new Map<string, typeof res.rows>();
      for (const r of res.rows) byMatch.set(r.match_id, [...(byMatch.get(r.match_id) ?? []), r]);
      for (const m of page.rows) {
        const datetime = Number(m.game_datetime);
        const boards = (byMatch.get(m.match_id) ?? []).map((r) => ({
          matchId: r.match_id,
          puuid: r.puuid,
          platform: m.platform,
          datetime,
          placement: r.placement,
          level: r.level,
          goldLeft: r.gold_left,
          lastRound: r.last_round,
          damage: r.damage,
          units: r.units,
          traits: r.traits,
          augments: r.augments ?? [],
        }));
        onMatch({ matchId: m.match_id, platform: m.platform, datetime, boards });
        delivered += boards.length;
      }
      if (page.rows.length < PAGE) break;
    }
    return { cursor: clock.rows[0].now, full: after === null };
  }

  async changeToken(setNumber: number) {
    const res = await this.query<{ n: number; t: string | null }>(
      'SELECT count(*)::int AS n, (extract(epoch FROM max(created_at)) * 1000)::bigint::text AS t FROM mf_matches WHERE set_number = $1',
      [setNumber],
    );
    return `${res.rows[0]?.n ?? 0}:${res.rows[0]?.t ?? 0}`;
  }

  async prune(before: number) {
    const res = await this.query('DELETE FROM mf_matches WHERE game_datetime < $1', [before]);
    return res.rowCount ?? 0;
  }

  async upsertPlayers(players: PlayerRecord[]) {
    // Sorted by puuid so concurrent upserts (crawl listing, naming, match lobbies) lock rows in one order: no deadlocks.
    const rows = dedupePlayers(players).sort((a, b) => (a.puuid < b.puuid ? -1 : a.puuid > b.puuid ? 1 : 0));
    if (!rows.length) return;
    try {
      await this.upsertPlayerRows(rows);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== '40P01') throw error;
      await this.upsertPlayerRows(rows);
    }
  }

  private async upsertPlayerRows(rows: PlayerRecord[]) {
    await this.query(
      `INSERT INTO mf_players (puuid, game_name, tag_line, platform, tier, lp, updated_at)
       SELECT u.puuid, u.game_name, u.tag_line, u.platform, u.tier, u.lp, now()
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
           AS u(puuid, game_name, tag_line, platform, tier, lp)
       ON CONFLICT (puuid) DO UPDATE SET
         game_name = COALESCE(EXCLUDED.game_name, mf_players.game_name),
         tag_line  = COALESCE(EXCLUDED.tag_line, mf_players.tag_line),
         platform  = COALESCE(EXCLUDED.platform, mf_players.platform),
         tier      = COALESCE(EXCLUDED.tier, mf_players.tier),
         lp        = COALESCE(EXCLUDED.lp, mf_players.lp),
         updated_at = now()`,
      [
        rows.map((p) => p.puuid),
        rows.map((p) => p.gameName ?? null),
        rows.map((p) => p.tagLine ?? null),
        rows.map((p) => p.platform ?? null),
        rows.map((p) => p.tier ?? null),
        rows.map((p) => (typeof p.lp === 'number' ? p.lp : null)),
      ],
    );
  }

  async getPlayers(puuids: string[]) {
    if (!puuids.length) return new Map<string, PlayerRecord>();
    const res = await this.query<PlayerRow>(`SELECT ${PLAYER_COLS} FROM mf_players WHERE puuid = ANY($1::text[])`, [puuids]);
    return new Map(res.rows.map((r) => [r.puuid, toPlayer(r)]));
  }

  /**
   * The trigram index for matches inside a name ("volta" in "SLY Voltariux"). Built by a collection run, once and
   * without blocking writes; a build that was cut off (left invalid) is redone.
   */
  async ensureNameSearch() {
    const res = await this.query<{ valid: boolean }>(
      `SELECT i.indisvalid AS valid FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'mf_players_name_trgm'`,
    );
    if (res.rows[0]?.valid) return;
    if (res.rows.length) await this.pool.query('DROP INDEX CONCURRENTLY IF EXISTS mf_players_name_trgm');
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await this.pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS mf_players_name_trgm ON mf_players USING gin (lower(game_name) gin_trgm_ops)');
  }

  async recordLp(seen: LpSeen[], track: boolean) {
    const rows = [...new Map(seen.map((p) => [p.puuid, p])).values()].sort((a, b) => (a.puuid < b.puuid ? -1 : a.puuid > b.puuid ? 1 : 0));
    if (!rows.length) return;
    await this.query(
      `INSERT INTO mf_lp (puuid, at, platform, tier, division, lp)
       SELECT u.puuid, date_trunc('hour', now()), u.platform, u.tier, u.division, u.lp
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[]) AS u(puuid, platform, tier, division, lp)
         LEFT JOIN LATERAL (SELECT h.tier, h.division, h.lp FROM mf_lp h WHERE h.puuid = u.puuid ORDER BY h.at DESC LIMIT 1) l ON true
        WHERE ($6::boolean OR l.tier IS NOT NULL)
          AND (l.tier IS NULL OR l.tier <> u.tier OR l.division IS DISTINCT FROM u.division OR l.lp <> u.lp)
       ON CONFLICT (puuid, at) DO UPDATE SET platform = EXCLUDED.platform, tier = EXCLUDED.tier, division = EXCLUDED.division, lp = EXCLUDED.lp`,
      [rows.map((p) => p.puuid), rows.map((p) => p.platform), rows.map((p) => p.tier), rows.map((p) => p.division), rows.map((p) => Math.round(p.lp)), track],
    );
  }

  async lpHistory(puuid: string, since: number) {
    const res = await this.query<{ at: string; tier: string; division: string | null; lp: number }>(
      'SELECT at, tier, division, lp FROM mf_lp WHERE puuid = $1 AND at >= to_timestamp($2::double precision / 1000) ORDER BY at',
      [puuid, since],
    );
    return res.rows.map((r): LpPoint => ({ at: new Date(r.at).getTime(), tier: r.tier, division: r.division, lp: r.lp }));
  }

  async pruneLp(before: number) {
    const res = await this.query('DELETE FROM mf_lp WHERE at < to_timestamp($1::double precision / 1000)', [before]);
    return res.rowCount ?? 0;
  }

  async unnamedPlayers(limit: number) {
    // An empty (not NULL) name marks an account Riot does not know, so it is never asked for again.
    const res = await this.query<{ puuid: string; platform: string | null; tier: string | null; lp: number | null }>(
      `SELECT puuid, platform, tier, lp FROM mf_players
        WHERE (game_name IS NULL OR tag_line IS NULL) AND platform IS NOT NULL
        ORDER BY lp DESC NULLS LAST, updated_at DESC LIMIT $1`,
      [Math.max(1, Math.min(limit, 20_000))],
    );
    return res.rows.map((r) => ({ puuid: r.puuid, platform: r.platform, tier: r.tier, lp: r.lp }));
  }

  async searchPlayers(prefix: string, opts: { platform?: string; prefer?: string; limit?: number } = {}) {
    const q = prefix.trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(opts.limit ?? 8, 25));
    const esc = q.replace(/[\\%_]/g, (c) => '\\' + c);
    // $4: inside the name (3+ characters, like nameMatch), $5: at the start of a later word.
    const params: unknown[] = [`${esc}%`, q, limit, q.length >= 3 ? `%${esc}%` : null, `% ${esc}%`];
    let plat = '';
    if (opts.platform) {
      params.push(opts.platform);
      plat = ` AND platform = $${params.length}`;
    }
    params.push(opts.prefer ?? null);
    const prefer = `$${params.length}::text`;
    // Name starts walk mf_players_name_idx in byte order and stop early; matches inside the name use the trigram
    // index (ensureNameSearch). Each side is bounded, then ranked like nameMatch: whole name, start, later word, inside.
    const res = await this.query<PlayerRow>(
      `SELECT ${PLAYER_COLS} FROM (
         (SELECT ${PLAYER_COLS} FROM mf_players WHERE lower(game_name) LIKE lower($1) ESCAPE '\\' AND tag_line IS NOT NULL${plat}
           ORDER BY lower(game_name) USING ~<~ LIMIT ${SEARCH_CANDIDATES})
         UNION
         (SELECT ${PLAYER_COLS} FROM mf_players WHERE $4::text IS NOT NULL AND lower(game_name) LIKE lower($4) ESCAPE '\\' AND tag_line IS NOT NULL${plat}
           LIMIT ${SEARCH_CANDIDATES})
       ) AS c
        ORDER BY CASE WHEN lower(game_name) = lower($2) THEN 0 WHEN lower(game_name) LIKE lower($1) ESCAPE '\\' THEN 1
                      WHEN ' ' || translate(lower(game_name), '._-', '   ') LIKE lower($5) ESCAPE '\\' THEN 2 ELSE 3 END,
                 COALESCE(platform = ${prefer}, false) DESC, lp DESC NULLS LAST, updated_at DESC
        LIMIT $3`,
      params,
    );
    return res.rows.map(toPlayer);
  }

  async claim(key: string, ms: number) {
    const token = randomUUID();
    // One statement so two servers cannot both win; the DB clock decides expiry. The same token may re-claim (a retried drop).
    const res = await this.query(
      `INSERT INTO mf_kv (k, v, updated_at)
       VALUES ($1, jsonb_build_object('token', $2::text, 'until', (extract(epoch FROM now()) * 1000)::bigint + $3::bigint), now())
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()
         WHERE COALESCE((mf_kv.v->>'until')::bigint, 0) < (extract(epoch FROM now()) * 1000)::bigint OR mf_kv.v->>'token' = $2
       RETURNING k`,
      [`lock:${key}`, token, Math.round(ms)],
    );
    return res.rowCount ? token : null;
  }

  async release(key: string, token: string) {
    await this.query(`DELETE FROM mf_kv WHERE k = $1 AND v->>'token' = $2`, [`lock:${key}`, token]);
  }

  async getKv<T>(key: string) {
    const res = await this.query<{ v: T }>('SELECT v FROM mf_kv WHERE k = $1', [key]);
    return res.rows[0]?.v ?? null;
  }

  async setKv(key: string, value: unknown) {
    await this.query(
      `INSERT INTO mf_kv (k, v, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }

  async pruneKv(prefix: string, before: number) {
    const res = await this.query('DELETE FROM mf_kv WHERE left(k, char_length($1)) = $1 AND updated_at < to_timestamp($2::double precision / 1000)', [prefix, before]);
    return res.rowCount ?? 0;
  }

  async getBlob(key: string) {
    const res = await this.query<{ v: Buffer }>('SELECT v FROM mf_blob WHERE k = $1', [key]);
    return res.rows[0]?.v ?? null;
  }

  async setBlob(key: string, value: Buffer) {
    await this.query(
      `INSERT INTO mf_blob (k, v, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
      [key, value],
    );
  }

  async stats(setNumber: number): Promise<StoreStats> {
    const res = await this.query<{ matches: number; first: string | null; last: string | null }>(
      `SELECT count(*)::int AS matches, min(game_datetime) AS first, max(game_datetime) AS last
         FROM mf_matches WHERE set_number = $1 AND boards_stored`,
      [setNumber],
    );
    const boards = await this.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM mf_boards b JOIN mf_matches m ON m.match_id = b.match_id WHERE m.set_number = $1`,
      [setNumber],
    );
    const row = res.rows[0];
    return {
      matches: row?.matches ?? 0,
      boards: boards.rows[0]?.n ?? 0,
      firstMatchAt: row?.first ? Number(row.first) : null,
      lastMatchAt: row?.last ? Number(row.last) : null,
    };
  }
}
