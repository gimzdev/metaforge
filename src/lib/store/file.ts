import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
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

interface Line {
  m: MatchRecord;
  b: BoardRecord[];
}

/** Read just the match header of a stored line (the "m" object is always written first). */
function parseHead(raw: string): MatchRecord | null {
  const cut = raw.indexOf('},"b":');
  if (cut < 0) return null;
  try {
    return (JSON.parse(`${raw.slice(0, cut + 1)}}`) as { m: MatchRecord }).m ?? null;
  } catch {
    return null;
  }
}

function countBoards(raw: string): number {
  let n = 0;
  for (let i = raw.indexOf('"puuid":'); i >= 0; i = raw.indexOf('"puuid":', i + 8)) n++;
  return n;
}

const emptyStats = (): StoreStats => ({ matches: 0, boards: 0, firstMatchAt: null, lastMatchAt: null });

/**
 * Zero-setup store for local use: an append-only NDJSON file of matches plus
 * small JSON files for players and settings. Reads stream the file, so memory
 * stays flat however large it grows. Not for serverless deployments.
 */
export class FileStore implements Store {
  kind = 'file' as const;
  private dir = path.resolve(env.dataDir);
  private matchesFile = path.join(this.dir, 'matches.ndjson');
  private playersFile = path.join(this.dir, 'players.json');
  private kvFile = path.join(this.dir, 'kv.json');
  private ready: Promise<void> | null = null;
  private ids = new Set<string>();
  private summary = new Map<number, StoreStats>();
  private oldest = Number.POSITIVE_INFINITY;
  /** Bytes of the matches file this process has indexed, including its own appends. */
  private indexedSize = 0;
  private players = new Map<string, PlayerRecord>();
  private kv: Record<string, unknown> = {};
  private writeQueue: Promise<unknown> = Promise.resolve();

  describe() {
    return `Local files (${path.relative(process.cwd(), this.dir) || '.'})`;
  }

  init() {
    this.ready ??= (async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await this.reindex();
      this.players = new Map(Object.entries(await this.readJson<Record<string, PlayerRecord>>(this.playersFile, {})));
      this.kv = await this.readJson<Record<string, unknown>>(this.kvFile, {});
    })().catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  /** Serialize writes (appends, snapshots and compaction) within this process. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async fileSize() {
    try {
      return (await fs.stat(this.matchesFile)).size;
    } catch {
      return 0;
    }
  }

  private async eachLine(onLine: (raw: string) => void | Promise<void>) {
    try {
      await fs.access(this.matchesFile);
    } catch {
      return;
    }
    const rl = readline.createInterface({ input: createReadStream(this.matchesFile, 'utf8'), crlfDelay: Infinity });
    for await (const raw of rl) {
      if (raw.trim()) await onLine(raw);
    }
  }

  /** Rebuild the in-memory index of match ids and per-set counts from the file. */
  private async reindex() {
    const ids = new Set<string>();
    const summary = new Map<number, StoreStats>();
    let oldest = Number.POSITIVE_INFINITY;
    await this.eachLine((raw) => {
      const m = parseHead(raw);
      if (!m || ids.has(m.matchId)) return;
      ids.add(m.matchId);
      oldest = Math.min(oldest, m.datetime);
      if (m.boardsStored) this.track(summary, m, countBoards(raw));
    });
    this.ids = ids;
    this.summary = summary;
    this.oldest = oldest;
    this.indexedSize = await this.fileSize();
  }

  /** Pick up matches written by another process, such as `npm run ingest`. */
  private async refreshIndex() {
    await this.writeQueue;
    if ((await this.fileSize()) !== this.indexedSize) await this.reindex();
  }

  private track(summary: Map<number, StoreStats>, m: MatchRecord, boards: number) {
    if (!boards) return;
    const s = summary.get(m.setNumber) ?? emptyStats();
    s.matches += 1;
    s.boards += boards;
    s.firstMatchAt = s.firstMatchAt === null ? m.datetime : Math.min(s.firstMatchAt, m.datetime);
    s.lastMatchAt = s.lastMatchAt === null ? m.datetime : Math.max(s.lastMatchAt, m.datetime);
    summary.set(m.setNumber, s);
  }

  async knownMatchIds(ids: string[]) {
    await this.init();
    await this.refreshIndex();
    return new Set(ids.filter((id) => this.ids.has(id)));
  }

  async saveMatch(match: MatchRecord, boards: BoardRecord[]) {
    await this.init();
    if (this.ids.has(match.matchId)) return;
    const m: MatchRecord = { ...match, boardsStored: match.boardsStored && boards.length > 0 };
    const text = `${JSON.stringify({ m, b: m.boardsStored ? boards : [] } satisfies Line)}\n`;
    this.ids.add(m.matchId);
    this.oldest = Math.min(this.oldest, m.datetime);
    if (m.boardsStored) this.track(this.summary, m, boards.length);
    await this.enqueue(async () => {
      await fs.appendFile(this.matchesFile, text);
      this.indexedSize += Buffer.byteLength(text);
    });
  }

  async forEachBoard(q: BoardQuery, onBoard: (board: BoardRecord) => void) {
    await this.init();
    await this.writeQueue;
    // Pass 1: read headers only and choose the newest matches that fit the limit.
    const picks: Array<{ id: string; t: number; n: number }> = [];
    const seen = new Set<string>();
    await this.eachLine((raw) => {
      const m = parseHead(raw);
      if (!m || seen.has(m.matchId)) return;
      seen.add(m.matchId);
      if (!m.boardsStored || m.setNumber !== q.setNumber || m.queueId !== q.queueId || m.datetime < q.since) return;
      picks.push({ id: m.matchId, t: m.datetime, n: countBoards(raw) });
    });
    picks.sort((a, b) => b.t - a.t);
    const chosen = new Set<string>();
    let planned = 0;
    for (const p of picks) {
      if (planned >= q.limit) break;
      chosen.add(p.id);
      planned += p.n;
    }
    // Pass 2: fully parse only the chosen matches.
    let delivered = 0;
    await this.eachLine((raw) => {
      if (!chosen.size || delivered >= q.limit) return;
      const m = parseHead(raw);
      if (!m || !chosen.delete(m.matchId)) return;
      let line: Line;
      try {
        line = JSON.parse(raw) as Line;
      } catch {
        return;
      }
      for (const b of line.b) {
        if (delivered >= q.limit) break;
        onBoard(b);
        delivered++;
      }
    });
    return delivered;
  }

  async changeToken() {
    await this.init();
    try {
      const st = await fs.stat(this.matchesFile);
      return `${st.size}:${Math.round(st.mtimeMs)}`;
    } catch {
      return 'empty';
    }
  }

  /** Rewrite the matches file without games older than `before`. */
  async prune(before: number) {
    await this.init();
    await this.refreshIndex();
    if (!(this.oldest < before)) return 0;
    return this.enqueue(async () => {
      const tmp = `${this.matchesFile}.tmp`;
      await fs.writeFile(tmp, '');
      let removed = 0;
      let chunk: string[] = [];
      let bytes = 0;
      const flush = async () => {
        if (!chunk.length) return;
        await fs.appendFile(tmp, chunk.join(''));
        chunk = [];
        bytes = 0;
      };
      await this.eachLine(async (raw) => {
        const m = parseHead(raw);
        if (m && m.datetime < before) {
          removed++;
          return;
        }
        chunk.push(`${raw}\n`);
        bytes += raw.length;
        if (bytes > 4_000_000) await flush();
      });
      await flush();
      await fs.rename(tmp, this.matchesFile);
      await this.reindex();
      return removed;
    });
  }

  async upsertPlayers(players: PlayerRecord[]) {
    await this.init();
    for (const p of dedupePlayers(players)) {
      const prev = this.players.get(p.puuid);
      this.players.set(p.puuid, {
        puuid: p.puuid,
        gameName: p.gameName ?? prev?.gameName ?? null,
        tagLine: p.tagLine ?? prev?.tagLine ?? null,
        platform: p.platform ?? prev?.platform ?? null,
        tier: p.tier ?? prev?.tier ?? null,
        lp: p.lp ?? prev?.lp ?? null,
        updatedAt: Date.now(),
      });
    }
    const snapshot = JSON.stringify(Object.fromEntries(this.players));
    await this.enqueue(() => fs.writeFile(this.playersFile, snapshot));
  }

  async getPlayers(puuids: string[]) {
    await this.init();
    const out = new Map<string, PlayerRecord>();
    for (const id of puuids) {
      const p = this.players.get(id);
      if (p) out.set(id, p);
    }
    return out;
  }

  async getKv<T>(key: string) {
    await this.init();
    // Another process (npm run ingest) may have written a newer value.
    this.kv = { ...this.kv, ...(await this.readJson<Record<string, unknown>>(this.kvFile, {})) };
    return (this.kv[key] as T) ?? null;
  }

  async setKv(key: string, value: unknown) {
    await this.init();
    this.kv = { ...this.kv, ...(await this.readJson<Record<string, unknown>>(this.kvFile, {})), [key]: value };
    const snapshot = JSON.stringify(this.kv);
    await this.enqueue(() => fs.writeFile(this.kvFile, snapshot));
  }

  async stats(setNumber: number) {
    await this.init();
    await this.refreshIndex();
    return this.summary.get(setNumber) ?? emptyStats();
  }
}
