import { Pool } from 'pg';
import { env } from '@/lib/env';
import {
  dedupePlayers,
  type BoardQuery,
  type BoardRecord,
  type MatchRecord,
  type PlayerRecord,
  type Store,
  type StoreStats,
} from './types';

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

CREATE TABLE IF NOT EXISTS mf_kv (
  k           text PRIMARY KEY,
  v           jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * pg treats sslmode=require/prefer/verify-ca as verify-full and warns about it
 * on every start. Spell out verify-full (same behavior, no warning) unless the
 * URL opts into libpq semantics.
 */
function normalizeSslMode(url: string): string {
  if (/uselibpqcompat=/i.test(url)) return url;
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/i, '$1verify-full');
}

export class PostgresStore implements Store {
  kind = 'postgres' as const;
  private pool: Pool;
  private ready: Promise<void> | null = null;
  private channelBinding: boolean;

  constructor(private readonly connectionString: string) {
    // Neon's connection strings ask for channel binding (SCRAM-SHA-256-PLUS), which pg supports over TLS.
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
    // Name the provider, never the host: this string is shown on public pages.
    const host = (() => {
      try {
        return new URL(env.databaseUrl).hostname;
      } catch {
        return '';
      }
    })();
    if (host.endsWith('neon.tech')) return 'Postgres (Neon)';
    if (host.includes('supabase')) return 'Postgres (Supabase)';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'Postgres (local)';
    return 'Postgres';
  }

  init() {
    this.ready ??= this.pool
      .query(SCHEMA)
      .catch(async (error: Error) => {
        // If the server or a proxy in between cannot do channel binding, fall back to plain SCRAM (still over TLS).
        if (!this.channelBinding || !/SASL|SCRAM|channel binding/i.test(error.message)) throw error;
        console.warn(`[metaforge] postgres channel binding failed (${error.message}); retrying without it`);
        this.channelBinding = false;
        const old = this.pool;
        this.pool = this.createPool();
        void old.end().catch(() => undefined);
        return this.pool.query(SCHEMA);
      })
      .then(() => undefined)
      .catch((error) => {
        this.ready = null;
        throw error;
      });
    return this.ready;
  }

  async knownMatchIds(ids: string[]) {
    await this.init();
    if (!ids.length) return new Set<string>();
    const res = await this.pool.query<{ match_id: string }>(
      'SELECT match_id FROM mf_matches WHERE match_id = ANY($1::text[])',
      [ids],
    );
    return new Set(res.rows.map((r) => r.match_id));
  }

  async saveMatch(match: MatchRecord, boards: BoardRecord[]) {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO mf_matches (match_id, platform, set_number, queue_id, game_datetime, game_version, boards_stored)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (match_id) DO NOTHING`,
        [
          match.matchId,
          match.platform,
          match.setNumber,
          match.queueId,
          match.datetime,
          match.gameVersion,
          match.boardsStored && boards.length > 0,
        ],
      );
      if (boards.length) {
        const values: unknown[] = [];
        const rows = boards.map((b, i) => {
          const o = i * 10;
          values.push(
            b.matchId,
            b.puuid,
            b.placement,
            b.level,
            b.goldLeft,
            b.lastRound,
            b.damage,
            JSON.stringify(b.units),
            JSON.stringify(b.traits),
            JSON.stringify(b.augments),
          );
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
      throw error;
    } finally {
      client.release();
    }
  }

  async forEachBoard(q: BoardQuery, onBoard: (board: BoardRecord) => void) {
    await this.init();
    // Walk matches newest first in pages (keyset pagination), so memory stays flat.
    const PAGE = 800;
    let cursor: { t: number; id: string } | null = null;
    let delivered = 0;
    while (delivered < q.limit) {
      const params: unknown[] = [q.setNumber, q.queueId, q.since, PAGE];
      let where = 'set_number = $1 AND queue_id = $2 AND boards_stored AND game_datetime >= $3';
      if (cursor) {
        params.push(cursor.t, cursor.id);
        where += ' AND (game_datetime, match_id) < ($5, $6)';
      }
      const page = await this.pool.query<{ match_id: string; platform: string; game_datetime: string }>(
        `SELECT match_id, platform, game_datetime FROM mf_matches WHERE ${where}
          ORDER BY game_datetime DESC, match_id DESC LIMIT $4`,
        params,
      );
      if (!page.rows.length) break;
      const last = page.rows[page.rows.length - 1];
      cursor = { t: Number(last.game_datetime), id: last.match_id };
      const meta = new Map(page.rows.map((r) => [r.match_id, r]));
      const boards = await this.pool.query(
        `SELECT match_id, puuid, placement, level, gold_left, last_round, damage, units, traits, augments
           FROM mf_boards WHERE match_id = ANY($1::text[])`,
        [page.rows.map((r) => r.match_id)],
      );
      for (const r of boards.rows) {
        if (delivered >= q.limit) break;
        const m = meta.get(r.match_id);
        if (!m) continue;
        onBoard({
          matchId: r.match_id,
          puuid: r.puuid,
          platform: m.platform,
          datetime: Number(m.game_datetime),
          placement: r.placement,
          level: r.level,
          goldLeft: r.gold_left,
          lastRound: r.last_round,
          damage: r.damage,
          units: r.units,
          traits: r.traits,
          augments: r.augments ?? [],
        });
        delivered++;
      }
      if (page.rows.length < PAGE) break;
    }
    return delivered;
  }

  async changeToken(setNumber: number) {
    await this.init();
    const res = await this.pool.query<{ n: number; t: string | null }>(
      'SELECT count(*)::int AS n, max(game_datetime) AS t FROM mf_matches WHERE set_number = $1',
      [setNumber],
    );
    const row = res.rows[0];
    return `${row?.n ?? 0}:${row?.t ?? 0}`;
  }

  async prune(before: number) {
    await this.init();
    const res = await this.pool.query('DELETE FROM mf_matches WHERE game_datetime < $1', [before]);
    return res.rowCount ?? 0;
  }

  async upsertPlayers(players: PlayerRecord[]) {
    const rows = dedupePlayers(players);
    if (!rows.length) return;
    await this.init();
    await this.pool.query(
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
    await this.init();
    const out = new Map<string, PlayerRecord>();
    if (!puuids.length) return out;
    const res = await this.pool.query(
      'SELECT puuid, game_name, tag_line, platform, tier, lp, updated_at FROM mf_players WHERE puuid = ANY($1::text[])',
      [puuids],
    );
    for (const r of res.rows) {
      out.set(r.puuid, {
        puuid: r.puuid,
        gameName: r.game_name,
        tagLine: r.tag_line,
        platform: r.platform,
        tier: r.tier,
        lp: r.lp,
        updatedAt: new Date(r.updated_at).getTime(),
      });
    }
    return out;
  }

  async getKv<T>(key: string) {
    await this.init();
    const res = await this.pool.query('SELECT v FROM mf_kv WHERE k = $1', [key]);
    return (res.rows[0]?.v as T) ?? null;
  }

  async setKv(key: string, value: unknown) {
    await this.init();
    await this.pool.query(
      `INSERT INTO mf_kv (k, v, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }

  async stats(setNumber: number): Promise<StoreStats> {
    await this.init();
    const res = await this.pool.query(
      `SELECT count(*)::int AS matches,
              min(game_datetime) AS first,
              max(game_datetime) AS last
         FROM mf_matches WHERE set_number = $1 AND boards_stored`,
      [setNumber],
    );
    const boards = await this.pool.query(
      `SELECT count(*)::int AS n FROM mf_boards b JOIN mf_matches m ON m.match_id = b.match_id
        WHERE m.set_number = $1`,
      [setNumber],
    );
    const row = res.rows[0] ?? {};
    return {
      matches: row.matches ?? 0,
      boards: boards.rows[0]?.n ?? 0,
      firstMatchAt: row.first ? Number(row.first) : null,
      lastMatchAt: row.last ? Number(row.last) : null,
    };
  }
}
