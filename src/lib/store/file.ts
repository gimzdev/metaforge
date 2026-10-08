import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '@/lib/env';
import { nameMatch } from '@/lib/utils';
import { dedupePlayers, mergePlayer, type BoardRecord, type LpPoint, type LpSeen, type MatchQuery, type MatchRecord, type PlayerRecord, type Store, type StoreStats, type StoredMatch } from './types';

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

/** Local zero-setup store: append-only NDJSON matches plus JSON players/settings; reads stream. Not for serverless. */
export class FileStore implements Store {
  kind = 'file' as const;
  private dir = path.resolve(env.dataDir);
  private matchesFile = path.join(this.dir, 'matches.ndjson');
  private playersFile = path.join(this.dir, 'players.json');
  private kvFile = path.join(this.dir, 'kv.json');
  private lpFile = path.join(this.dir, 'lp.json');
  private lp = new Map<string, LpPoint[]>();
  private lpSave: Promise<void> | null = null;
  private ready: Promise<void> | null = null;
  private ids = new Set<string>();
  private summary = new Map<number, StoreStats>();
  private oldest = Number.POSITIVE_INFINITY;
  /** Bytes of the matches file this process has indexed, including its own appends. */
  private indexedSize = 0;
  private players = new Map<string, PlayerRecord>();
  /** Queued players.json write not yet started (it will include every change made until it does). */
  private playersSave: Promise<void> | null = null;
  private kv: Record<string, unknown> = {};
  /** Stamp of the kv.json this process last read or wrote; reread only when another process changed it. */
  private kvStamp = '';
  private tmpSeq = 0;
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
      this.lp = new Map(Object.entries(await this.readJson<Record<string, LpPoint[]>>(this.lpFile, {})));
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

  private static stamp(st: { ino: number; size: number; mtimeMs: number }) {
    return `${st.ino}:${st.size}:${st.mtimeMs}`;
  }

  /** Write via temp + rename so a crash never leaves a half-written file (it would read as empty, then be overwritten). */
  private async writeAtomic(file: string, data: string | Buffer) {
    const tmp = `${file}.${process.pid}-${++this.tmpSeq}.tmp`;
    try {
      await fs.writeFile(tmp, data);
      const stamp = FileStore.stamp(await fs.stat(tmp)); // a rename keeps the inode and times
      await fs.rename(tmp, file);
      return stamp;
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async fileStat() {
    try {
      const st = await fs.stat(this.matchesFile);
      return { size: st.size, id: `${st.ino}:${Math.round(st.birthtimeMs)}`, mtime: Math.round(st.mtimeMs) };
    } catch {
      return null;
    }
  }

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
    // Cursor = file identity (inode, birth time, first-line hash) + offset past a line; a rewritten file or misaligned offset restarts.
    const head = await this.peek(0, 256);
    const firstLine = head.indexOf(10);
    const id = `${st.id}:${createHash('sha1').update(firstLine < 0 ? head : head.subarray(0, firstLine)).digest('hex').slice(0, 12)}`;
    const cut = (q.after ?? '').lastIndexOf(':');
    let from = q.after && q.after.slice(0, cut) === id ? Number(q.after.slice(cut + 1)) : 0;
    if (!(from > 0 && from <= st.size && (await this.peek(from - 1, 1))[0] === 10)) from = 0;

    const wanted = (m: MatchRecord | null): m is MatchRecord =>
      Boolean(m && m.boardsStored && m.setNumber === q.setNumber && m.queueId === q.queueId && m.datetime >= q.since);
    const deliver = (raw: string, m: MatchRecord) => {
      let boards: BoardRecord[];
      try {
        boards = (JSON.parse(raw) as { b: BoardRecord[] }).b;
      } catch {
        return; // damaged line
      }
      onMatch({ matchId: m.matchId, platform: m.platform, datetime: m.datetime, boards });
    };
    const scan = (until: number, onHead: (m: MatchRecord | null, raw: string) => void) => this.eachLine(from, (raw) => onHead(parseHead(raw), raw), until);
    if ((this.summary.get(q.setNumber)?.boards ?? 0) <= q.limit) {
      const end = await scan(st.size, (m, raw) => {
        if (wanted(m)) deliver(raw, m);
      });
      return { cursor: `${id}:${end}`, full: from === 0 };
    }
    // Pass 1: headers only, choosing the newest matches that fit the limit.
    const picks: Array<{ id: string; t: number; n: number }> = [];
    const seen = new Set<string>();
    const end = await scan(st.size, (m, raw) => {
      if (!m || seen.has(m.matchId)) return;
      seen.add(m.matchId);
      if (wanted(m)) picks.push({ id: m.matchId, t: m.datetime, n: countBoards(raw) });
    });
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
      await scan(end, (m, raw) => {
        if (m && chosen.delete(m.matchId)) deliver(raw, m);
      });
    }
    return { cursor: `${id}:${end}`, full: from === 0 };
  }

  async changeToken() {
    await this.init();
    const st = await this.fileStat();
    return st ? `${st.size}:${st.mtime}` : 'empty';
  }

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
    for (const p of dedupePlayers(players)) this.players.set(p.puuid, { ...mergePlayer(p, this.players.get(p.puuid)), updatedAt: Date.now() });
    await this.savePlayers();
  }

  /** Coalesce writes: a crawl upserts players thousands of times and each write is the whole file. */
  private savePlayers() {
    this.playersSave ??= this.enqueue(async () => {
      this.playersSave = null; // changes from here on need another write
      await this.writeAtomic(this.playersFile, JSON.stringify(Object.fromEntries(this.players)));
    });
    return this.playersSave;
  }

  async getPlayers(puuids: string[]) {
    await this.init();
    return new Map(puuids.flatMap((id) => (this.players.has(id) ? [[id, this.players.get(id)!] as const] : [])));
  }

  async recordLp(seen: LpSeen[], track: boolean) {
    await this.init();
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    let changed = false;
    for (const p of seen) {
      const points = this.lp.get(p.puuid);
      if (!points && !track) continue;
      const last = points?.at(-1);
      if (last && last.tier === p.tier && last.division === p.division && last.lp === p.lp) continue;
      const point = { at: hour, tier: p.tier, division: p.division, lp: Math.round(p.lp) };
      const list = points ?? [];
      if (last?.at === hour) list[list.length - 1] = point;
      else list.push(point);
      this.lp.set(p.puuid, list.slice(-1000));
      changed = true;
    }
    if (changed) await this.saveLp();
  }

  private saveLp() {
    this.lpSave ??= this.enqueue(async () => {
      this.lpSave = null;
      await this.writeAtomic(this.lpFile, JSON.stringify(Object.fromEntries(this.lp)));
    });
    return this.lpSave;
  }

  async lpHistory(puuid: string, since: number) {
    await this.init();
    return (this.lp.get(puuid) ?? []).filter((p) => p.at >= since);
  }

  async pruneLp(before: number) {
    await this.init();
    let removed = 0;
    for (const [puuid, points] of this.lp) {
      const kept = points.filter((p) => p.at >= before);
      removed += points.length - kept.length;
      if (!kept.length) this.lp.delete(puuid);
      else if (kept.length < points.length) this.lp.set(puuid, kept);
    }
    if (removed) await this.saveLp();
    return removed;
  }

  async unnamedPlayers(limit: number) {
    await this.init();
    // As in Postgres: null name (empty marks an account Riot does not know) and a platform.
    return [...this.players.values()]
      .filter((p) => (p.gameName == null || p.tagLine == null) && p.platform)
      .sort((a, b) => (b.lp ?? -1) - (a.lp ?? -1) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, limit);
  }

  async searchPlayers(prefix: string, opts: { platform?: string; prefer?: string; limit?: number } = {}) {
    await this.init();
    const q = prefix.trim().toLowerCase();
    if (!q) return [];
    const limit = Math.max(1, Math.min(opts.limit ?? 8, 25));
    const hits: Array<PlayerRecord & { rank: number }> = [];
    for (const p of this.players.values()) {
      if (!p.gameName || !p.tagLine || (opts.platform && p.platform !== opts.platform)) continue;
      const rank = nameMatch(p.gameName, q);
      if (rank >= 0) hits.push({ ...p, rank });
    }
    const preferred = (p: PlayerRecord) => Number(Boolean(opts.prefer) && p.platform === opts.prefer);
    hits.sort(
      (a, b) =>
        a.rank - b.rank ||
        preferred(b) - preferred(a) ||
        (b.lp ?? -1) - (a.lp ?? -1) ||
        (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    );
    return hits.slice(0, limit).map(({ rank, ...p }) => p);
  }

  async getKv<T>(key: string) {
    await this.init();
    return ((await this.latestKv())[key] as T) ?? null;
  }

  /** Callers read-modify-write inside one queued step so concurrent writers never undo each other. */
  private async latestKv() {
    const st = await fs.stat(this.kvFile).catch(() => null);
    const stamp = st ? FileStore.stamp(st) : '';
    if (stamp !== this.kvStamp) {
      const disk = await this.readJson<Record<string, unknown>>(this.kvFile, {});
      this.kv = { ...this.kv, ...disk };
      this.kvStamp = stamp;
    }
    return this.kv;
  }

  /** Memory then matches the file exactly (a concurrent read may have swapped in an older copy). */
  private async writeKv(all: Record<string, unknown>) {
    this.kvStamp = await this.writeAtomic(this.kvFile, JSON.stringify(all));
    this.kv = all;
  }

  async setKv(key: string, value: unknown) {
    await this.init();
    await this.enqueue(async () => {
      const all = await this.latestKv();
      all[key] = value;
      await this.writeKv(all);
    });
  }

  async pruneKv(prefix: string, before: number) {
    await this.init();
    return this.enqueue(async () => {
      const all = await this.latestKv();
      // Entries carry their own write time as `at`.
      const stale = Object.keys(all).filter((k) => k.startsWith(prefix) && (Number((all[k] as { at?: number } | null)?.at) || 0) < before);
      if (!stale.length) return 0;
      for (const k of stale) delete all[k];
      await this.writeKv(all);
      return stale.length;
    });
  }

  /** Cross-process lock: a file created only if absent, naming its holder and when it expires. */
  private lockFile = (key: string) => path.join(this.dir, `${key.replace(/[^\w.-]/g, '_')}.lock`);

  async claim(key: string, ms: number) {
    await this.init();
    const file = this.lockFile(key);
    const token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await fs.writeFile(file, JSON.stringify({ token, until: Date.now() + ms }), { flag: 'wx' });
        return token;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const held = await this.readJson<{ until?: number } | null>(file, null);
      // A lock that cannot be read yet is being written right now: treat it as fresh.
      const until = held ? Number(held.until) || 0 : ((await fs.stat(file).catch(() => null))?.mtimeMs ?? 0) + 10_000;
      if (until > Date.now()) return null;
      // Stale lock from a run that never finished: take it over.
      await fs.rm(file, { force: true });
    }
    return null;
  }

  async release(key: string, token: string) {
    const file = this.lockFile(key);
    const held = await this.readJson<{ token?: string } | null>(file, null);
    if (held?.token === token) await fs.rm(file, { force: true });
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
    await this.writeAtomic(file, value);
  }

  async stats(setNumber: number) {
    await this.init();
    await this.refreshIndex();
    return this.summary.get(setNumber) ?? emptyStats();
  }
}
