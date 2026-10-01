import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '@/lib/env';
import { dedupePlayers, type BoardRecord, type MatchQuery, type MatchRecord, type PlayerRecord, type Store, type StoreStats, type StoredMatch } from './types';

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
 * Zero-setup store for local use: an append-only NDJSON file of matches plus small
 * JSON files for players and settings. Reads stream the file, so memory stays flat
 * however large it grows. Not for serverless deployments.
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

  private async fileStat() {
    try {
      const st = await fs.stat(this.matchesFile);
      return { size: st.size, id: `${st.ino}:${Math.round(st.birthtimeMs)}`, mtime: Math.round(st.mtimeMs) };
    } catch {
      return null;
    }
  }

  /** Up to `length` bytes of the matches file from `position` (none when it can't be read). */
  private async peek(position: number, length: number): Promise<Buffer> {
    try {
      const handle = await fs.open(this.matchesFile, 'r');
      try {
        const buf = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buf, 0, length, position);
        return buf.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } catch {
      return Buffer.alloc(0);
    }
  }

  /** Call onLine for every complete line from a byte offset (before `until`); resolves with the offset after the last one. */
  private async eachLine(from: number, onLine: (raw: string) => void | Promise<void>, until = Number.POSITIVE_INFINITY): Promise<number> {
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(this.matchesFile, 'r');
    } catch {
      return from;
    }
    try {
      const buf = Buffer.allocUnsafe(1 << 20);
      let offset = from;
      let end = from;
      let carry: Buffer | null = null;
      for (;;) {
        const { bytesRead } = await handle.read(buf, 0, Math.max(0, Math.min(buf.length, until - offset)), offset);
        if (!bytesRead) break;
        let start = 0;
        for (let i = buf.indexOf(10); i !== -1 && i < bytesRead; i = buf.indexOf(10, i + 1)) {
          const piece = buf.subarray(start, i);
          const line = (carry ? Buffer.concat([carry, piece]) : piece).toString('utf8');
          carry = null;
          end = offset + i + 1;
          start = i + 1;
          if (line.trim()) await onLine(line);
        }
        if (start < bytesRead) {
          const rest = Buffer.from(buf.subarray(start, bytesRead));
          carry = carry ? Buffer.concat([carry, rest]) : rest;
        }
        offset += bytesRead;
      }
      return end;
    } finally {
      await handle.close();
    }
  }

  /** Rebuild the in-memory index of match ids and per-set counts from the file. */
  private async reindex() {
    const ids = new Set<string>();
    const summary = new Map<number, StoreStats>();
    let oldest = Number.POSITIVE_INFINITY;
    await this.eachLine(0, (raw) => {
      const m = parseHead(raw);
      if (!m || ids.has(m.matchId)) return;
      ids.add(m.matchId);
      oldest = Math.min(oldest, m.datetime);
      if (m.boardsStored) this.track(summary, m, countBoards(raw));
    });
    Object.assign(this, { ids, summary, oldest, indexedSize: (await this.fileStat())?.size ?? 0 });
  }

  /** Pick up matches written by another process, such as `npm run ingest`. */
  private async refreshIndex() {
    await this.writeQueue;
    if (((await this.fileStat())?.size ?? 0) !== this.indexedSize) await this.reindex();
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
    const text = `${JSON.stringify({ m, b: m.boardsStored ? boards : [] })}\n`;
    this.ids.add(m.matchId);
    this.oldest = Math.min(this.oldest, m.datetime);
    if (m.boardsStored) this.track(this.summary, m, boards.length);
    await this.enqueue(async () => {
      await fs.appendFile(this.matchesFile, text);
      this.indexedSize += Buffer.byteLength(text);
    });
  }

  async readMatches(q: MatchQuery, onMatch: (match: StoredMatch) => void) {
    await this.init();
    await this.writeQueue;
    const st = await this.fileStat();
    if (!st) return { cursor: '', full: true };
    // The cursor names the file (inode, creation time and a hash of its first line) and a byte offset
    // just past a line. A rewritten file (pruning) or an offset that no longer lines up starts over.
    const head = await this.peek(0, 256);
    const firstLine = head.indexOf(10);
    const id = `${st.id}:${createHash('sha1').update(firstLine < 0 ? head : head.subarray(0, firstLine)).digest('hex').slice(0, 12)}`;
    const cut = (q.after ?? '').lastIndexOf(':');
    let from = q.after && q.after.slice(0, cut) === id ? Number(q.after.slice(cut + 1)) : 0;
    if (!(from > 0 && from <= st.size && (await this.peek(from - 1, 1))[0] === 10)) from = 0;

    const wanted = (m: MatchRecord | null): m is MatchRecord =>
      Boolean(m && m.boardsStored && m.setNumber === q.setNumber && m.queueId === q.queueId && m.datetime >= q.since);
    const deliver = (raw: string, m: MatchRecord) => {
      try {
        const { b } = JSON.parse(raw) as { b: BoardRecord[] };
        onMatch({ matchId: m.matchId, platform: m.platform, datetime: m.datetime, boards: b });
      } catch {
        /* a damaged line: skip it */
      }
    };
    // Everything fits the limit (the usual case): one pass.
    if ((this.summary.get(q.setNumber)?.boards ?? 0) <= q.limit) {
      const end = await this.eachLine(
        from,
        (raw) => {
          const m = parseHead(raw);
          if (wanted(m)) deliver(raw, m);
        },
        st.size,
      );
      return { cursor: `${id}:${end}`, full: from === 0 };
    }
    // Pass 1: headers only, choosing the newest matches that fit the limit.
    const picks: Array<{ id: string; t: number; n: number }> = [];
    const seen = new Set<string>();
    const end = await this.eachLine(
      from,
      (raw) => {
        const m = parseHead(raw);
        if (!m || seen.has(m.matchId)) return;
        seen.add(m.matchId);
        if (wanted(m)) picks.push({ id: m.matchId, t: m.datetime, n: countBoards(raw) });
      },
      st.size,
    );
    picks.sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const chosen = new Set<string>();
    let planned = 0;
    for (const p of picks) {
      if (planned >= q.limit) break;
      chosen.add(p.id);
      planned += p.n;
    }
    // Pass 2: parse only those.
    if (chosen.size) {
      await this.eachLine(
        from,
        (raw) => {
          const m = parseHead(raw);
          if (m && chosen.delete(m.matchId)) deliver(raw, m);
        },
        end,
      );
    }
    return { cursor: `${id}:${end}`, full: from === 0 };
  }

  async changeToken() {
    await this.init();
    const st = await this.fileStat();
    return st ? `${st.size}:${st.mtime}` : 'empty';
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
      await this.eachLine(0, async (raw) => {
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
    return ((await this.latestKv())[key] as T) ?? null;
  }

  /** Settings are read, changed and written as one queued step, so concurrent writers never undo each other. */
  private async latestKv() {
    const disk = await this.readJson<Record<string, unknown>>(this.kvFile, {});
    this.kv = { ...this.kv, ...disk };
    return this.kv;
  }

  async setKv(key: string, value: unknown) {
    await this.init();
    await this.enqueue(async () => {
      const all = await this.latestKv();
      all[key] = value;
      await fs.writeFile(this.kvFile, JSON.stringify(all));
    });
  }

  async pruneKv(prefix: string, before: number) {
    await this.init();
    return this.enqueue(async () => {
      const all = await this.latestKv();
      // Entries carry their own write time as `at` (the file has no per-key timestamps).
      const stale = Object.keys(all).filter((k) => k.startsWith(prefix) && (Number((all[k] as { at?: number } | null)?.at) || 0) < before);
      if (!stale.length) return 0;
      for (const k of stale) delete all[k];
      await fs.writeFile(this.kvFile, JSON.stringify(all));
      return stale.length;
    });
  }

  private blobFile = (key: string) => path.join(this.dir, 'cache', `${key.replace(/[^\w.-]/g, '_')}.bin`);

  async getBlob(key: string) {
    try {
      return await fs.readFile(this.blobFile(key));
    } catch {
      return null;
    }
  }

  async setBlob(key: string, value: Buffer) {
    const file = this.blobFile(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, value);
    await fs.rename(`${file}.tmp`, file);
  }

  async stats(setNumber: number) {
    await this.init();
    await this.refreshIndex();
    return this.summary.get(setNumber) ?? emptyStats();
  }
}
