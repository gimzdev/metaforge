import { gunzipSync, gzipSync } from 'node:zlib';
import { getSetInfo, RANKED_QUEUE } from '@/config/game';
import { env } from '@/lib/env';
import { getStore, type StoredMatch } from '@/lib/store';

// Every stored board in a compact column layout, newest match first, ids as match data has them (lowercased). It doesn't
// depend on the game data, so it is cached as one small blob: a cold server loads it plus the matches stored since.
export interface Columns {
  /** Query identity: a blob built for another set, queue or limit is ignored. */
  key: string;
  /** Store cursor for the next incremental read. */
  cursor: string;
  /** When the store was last read in full (a full read happens at least daily). */
  fullAt: number;
  units: string[];
  items: string[];
  traits: string[];
  augs: string[];
  regions: string[];
  matches: string[];
  /* per match */
  mTime: Float64Array;
  mRegion: Uint8Array;
  mBoards: Uint8Array;
  /* per board */
  place: Uint8Array;
  level: Uint8Array;
  uCount: Uint8Array;
  tCount: Uint8Array;
  aCount: Uint8Array;
  /* per unit */
  uId: Uint16Array;
  uStar: Uint8Array;
  iCount: Uint8Array;
  /* per item */
  iId: Uint16Array;
  /* per trait */
  tId: Uint16Array;
  tUnits: Uint8Array;
  tStyle: Uint8Array;
  tTier: Uint8Array;
  /* per augment */
  aId: Uint16Array;
}

const ARRAYS = [
  ['mTime', Float64Array], ['mRegion', Uint8Array], ['mBoards', Uint8Array],
  ['place', Uint8Array], ['level', Uint8Array], ['uCount', Uint8Array], ['tCount', Uint8Array], ['aCount', Uint8Array],
  ['uId', Uint16Array], ['uStar', Uint8Array], ['iCount', Uint8Array], ['iId', Uint16Array],
  ['tId', Uint16Array], ['tUnits', Uint8Array], ['tStyle', Uint8Array], ['tTier', Uint8Array], ['aId', Uint16Array],
] as const;
type ArrayName = (typeof ARRAYS)[number][0];
const TABLES = ['units', 'items', 'traits', 'augs', 'regions'] as const;
const VERSION = 1;
const BLOB = 'boards';
const DAY = 86_400_000;
const FULL_EVERY = DAY; // read the store in full at least this often, so the blob can never drift for long

class Interner {
  keys: string[] = [];
  private map = new Map<string, number>();
  add(key: string) {
    let i = this.map.get(key);
    if (i === undefined) {
      this.map.set(key, (i = this.keys.length));
      this.keys.push(key);
    }
    return i;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Collects matches (from the store or an older Columns) and lays them out newest first. */
class ColumnsBuilder {
  added = 0;
  private seen = new Set<string>();
  private t = Object.fromEntries(TABLES.map((k) => [k, new Interner()])) as Record<(typeof TABLES)[number], Interner>;
  private m: Array<{ id: string; time: number; region: number; b: number; u: number; i: number; t: number; a: number; n: number }> = [];
  private a = Object.fromEntries(ARRAYS.slice(3).map(([k]) => [k, [] as number[]])) as Record<Exclude<ArrayName, 'mTime' | 'mRegion' | 'mBoards'>, number[]>;

  private start(id: string, time: number, platform: string) {
    const a = this.a;
    return { id, time, region: this.t.regions.add(platform || 'unknown'), b: a.place.length, u: a.uId.length, i: a.iId.length, t: a.tId.length, a: a.aId.length, n: 0 };
  }

  addMatch(match: StoredMatch) {
    if (this.seen.has(match.matchId)) return;
    this.seen.add(match.matchId);
    const { a, t } = this;
    // Stored boards are JSON. Malformed entries are skipped before anything is written (a throw half
    // way through a board would shift every board after it), and counts stay within their Uint8 columns.
    const boards = Array.isArray(match.boards) ? match.boards : [];
    const m = this.start(match.matchId, match.datetime, boards[0]?.platform ?? match.platform);
    for (const b of boards) {
      if (!b || typeof b !== 'object' || m.n === 255) continue;
      const units = (Array.isArray(b.units) ? b.units : []).filter((u) => Array.isArray(u)).slice(0, 255);
      if (!(b.placement >= 1 && b.placement <= 8) || !units.length) continue;
      for (const u of units) {
        const items = (Array.isArray(u[2]) ? u[2] : []).filter((i) => typeof i === 'string' && i).slice(0, 255);
        a.uId.push(t.units.add(String(u[0]).toLowerCase()));
        a.uStar.push(clamp(Number(u[1]) || 1, 1, 4));
        a.iCount.push(items.length);
        for (const it of items) a.iId.push(t.items.add(it.toLowerCase()));
      }
      let traits = 0;
      for (const tr of Array.isArray(b.traits) ? b.traits : []) {
        if (!Array.isArray(tr) || !(Number(tr[3]) > 0) || traits === 255) continue;
        a.tId.push(t.traits.add(String(tr[0]).toLowerCase()));
        a.tUnits.push(clamp(Number(tr[1]) || 0, 0, 255));
        a.tStyle.push(clamp(Number(tr[2]) || 0, 0, 255));
        a.tTier.push(Math.min(15, Number(tr[3]) || 0));
        traits++;
      }
      const augs = (Array.isArray(b.augments) ? b.augments : []).filter((x) => typeof x === 'string').slice(0, 255);
      for (const x of augs) a.aId.push(t.augs.add(x.toLowerCase()));
      a.place.push(b.placement);
      a.level.push(clamp(b.level || 0, 0, 15));
      a.uCount.push(units.length);
      a.tCount.push(traits);
      a.aCount.push(augs.length);
      m.n++;
    }
    if (m.n) {
      this.m.push(m);
      this.added++;
    }
  }

  /** Add the matches of an older layout that weren't read again. */
  addColumns(c: Columns) {
    const { a, t } = this;
    const map = Object.fromEntries(TABLES.map((k) => [k, c[k].map((id) => t[k].add(id))])) as Record<(typeof TABLES)[number], number[]>;
    let b = 0, u = 0, i = 0, tr = 0, x = 0;
    for (let k = 0; k < c.matches.length; k++) {
      const boards = c.mBoards[k];
      const skip = this.seen.has(c.matches[k]);
      const m = skip ? null : this.start(c.matches[k], c.mTime[k], c.regions[c.mRegion[k]]);
      if (m) {
        this.seen.add(m.id);
        m.n = boards;
        this.m.push(m);
      }
      for (let end = b + boards; b < end; b++) {
        const units = c.uCount[b], traits = c.tCount[b], augs = c.aCount[b];
        if (m) {
          a.place.push(c.place[b]);
          a.level.push(c.level[b]);
          a.uCount.push(units);
          a.tCount.push(traits);
          a.aCount.push(augs);
        }
        for (let ue = u + units; u < ue; u++) {
          const items = c.iCount[u];
          if (m) {
            a.uId.push(map.units[c.uId[u]]);
            a.uStar.push(c.uStar[u]);
            a.iCount.push(items);
            for (let q = i; q < i + items; q++) a.iId.push(map.items[c.iId[q]]);
          }
          i += items;
        }
        if (m) {
          for (let q = tr; q < tr + traits; q++) {
            a.tId.push(map.traits[c.tId[q]]);
            a.tUnits.push(c.tUnits[q]);
            a.tStyle.push(c.tStyle[q]);
            a.tTier.push(c.tTier[q]);
          }
          for (let q = x; q < x + augs; q++) a.aId.push(map.augs[c.aId[q]]);
        }
        tr += traits;
        x += augs;
      }
    }
  }

  /** Newest first, games before `since` dropped, stopping once `limit` boards are in. */
  finish(meta: { key: string; cursor: string; fullAt: number; since: number; limit: number }): Columns {
    const { a } = this;
    const ends = { b: a.place.length, u: a.uId.length, i: a.iId.length, t: a.tId.length, a: a.aId.length };
    const spans = this.m.map((m, k) => {
      const next = this.m[k + 1];
      return { ...m, bE: next?.b ?? ends.b, uE: next?.u ?? ends.u, iE: next?.i ?? ends.i, tE: next?.t ?? ends.t, aE: next?.a ?? ends.a };
    });
    // Segments are contiguous in insertion order, so each match copies as a block.
    const chosen: typeof spans = [];
    let boards = 0;
    for (const s of spans.filter((s) => s.time >= meta.since).sort((x, y) => y.time - x.time || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0))) {
      if (boards >= meta.limit) break;
      chosen.push(s);
      boards += s.n;
    }
    const size = (key: 'b' | 'u' | 'i' | 't' | 'a') => chosen.reduce((sum, s) => sum + s[`${key}E`] - s[key], 0);
    const out = { ...meta, ...Object.fromEntries(TABLES.map((k) => [k, this.t[k].keys])), matches: chosen.map((s) => s.id) } as unknown as Columns;
    const alloc = <K extends ArrayName>(name: K, n: number) => (out[name] = new (ARRAYS.find(([k]) => k === name)![1])(n) as Columns[K]);
    alloc('mTime', chosen.length).set(chosen.map((s) => s.time));
    alloc('mRegion', chosen.length).set(chosen.map((s) => s.region));
    alloc('mBoards', chosen.length).set(chosen.map((s) => s.n));
    const groups: Array<[ArrayName[], 'b' | 'u' | 'i' | 't' | 'a']> = [
      [['place', 'level', 'uCount', 'tCount', 'aCount'], 'b'],
      [['uId', 'uStar', 'iCount'], 'u'],
      [['iId'], 'i'],
      [['tId', 'tUnits', 'tStyle', 'tTier'], 't'],
      [['aId'], 'a'],
    ];
    for (const [names, key] of groups) {
      const n = size(key);
      const endKey = `${key}E` as const;
      for (const name of names) {
        const target = alloc(name, n);
        const source = a[name as keyof typeof a];
        let o = 0;
        for (const s of chosen) for (let k = s[key], end = s[endKey]; k < end; k++) target[o++] = source[k];
      }
    }
    return out;
  }
}

/* ── Blob encoding ──────────────────────────────────────── */

function encode(c: Columns): Buffer {
  const tables = Object.fromEntries(TABLES.map((k) => [k, c[k]]));
  const lengths = ARRAYS.map(([k]) => c[k].length);
  const header = Buffer.from(JSON.stringify({ v: VERSION, key: c.key, cursor: c.cursor, fullAt: c.fullAt, matches: c.matches, ...tables, lengths }));
  const parts: Buffer[] = [Buffer.alloc(4), header];
  parts[0].writeUInt32LE(header.length);
  let size = 4 + header.length;
  const pad = () => {
    const extra = (8 - (size % 8)) % 8;
    if (extra) parts.push(Buffer.alloc(extra));
    size += extra;
  };
  for (const [k] of ARRAYS) {
    pad();
    const arr = c[k];
    parts.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    size += arr.byteLength;
  }
  // Level 4: within 5% of level 6's size at a quarter of the time.
  return gzipSync(Buffer.concat(parts), { level: 4 });
}

function decode(blob: Buffer | null): Columns | null {
  if (!blob) return null;
  try {
    const buf = gunzipSync(blob);
    const headerLength = buf.readUInt32LE(0);
    const header = JSON.parse(buf.subarray(4, 4 + headerLength).toString('utf8'));
    if (header.v !== VERSION) return null;
    let offset = 4 + headerLength;
    const out = { key: header.key, cursor: header.cursor, fullAt: header.fullAt, matches: header.matches } as Columns;
    for (const k of TABLES) out[k] = header[k];
    ARRAYS.forEach(([name, Type], idx) => {
      offset += (8 - (offset % 8)) % 8;
      const bytes = header.lengths[idx] * Type.BYTES_PER_ELEMENT;
      if (!(bytes >= 0 && offset + bytes <= buf.length)) throw new Error('truncated');
      const copy = new Uint8Array(bytes);
      copy.set(buf.subarray(offset, offset + bytes));
      (out as unknown as Record<string, unknown>)[name] = new Type(copy.buffer);
      offset += bytes;
    });
    return consistent(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Every count column adds up to the length of what it counts. A layout that doesn't (one saved by an
 * older version from a damaged row) would shift every board after the damage, so it is read again instead.
 */
function consistent(c: Columns) {
  const sum = (counts: Uint8Array) => counts.reduce((s, x) => s + x, 0);
  const sized = (n: number, ...arrays: ArrayLike<number>[]) => arrays.every((x) => x.length === n);
  return (
    TABLES.every((k) => Array.isArray(c[k])) &&
    Array.isArray(c.matches) &&
    sized(c.matches.length, c.mTime, c.mRegion, c.mBoards) &&
    sized(sum(c.mBoards), c.place, c.level, c.uCount, c.tCount, c.aCount) &&
    sized(sum(c.uCount), c.uId, c.uStar, c.iCount) &&
    sized(sum(c.iCount), c.iId) &&
    sized(sum(c.tCount), c.tId, c.tUnits, c.tStyle, c.tTier) &&
    sized(sum(c.aCount), c.aId)
  );
}

/* ── Loading ────────────────────────────────────────────── */

/** The previous layout (in memory, or the blob) plus what the store holds that it hasn't seen; `persist` saves it as the blob. */
export async function loadColumns(prev: Columns | null, setNumber: number, opts: { persist?: boolean } = {}): Promise<Columns> {
  const store = getStore();
  const setStart = Date.parse(`${getSetInfo(setNumber).start}T00:00:00Z`);
  const firstDay = Number.isFinite(setStart) ? setStart : Date.now() - 90 * DAY;
  const since = Math.max(firstDay, env.retainDays > 0 ? Date.now() - env.retainDays * DAY : 0);
  const key = `v${VERSION}|set${setNumber}|q${RANKED_QUEUE}|from${firstDay}|keep${env.retainDays}|max${env.maxBoards}`;
  const usable = (c: Columns | null) => (c && c.key === key && Date.now() - c.fullAt < FULL_EVERY ? c : null);

  const base = usable(prev) ?? usable(decode(await store.getBlob(BLOB).catch(() => null)));
  const builder = new ColumnsBuilder();
  // Reads from a cursor can repeat matches already held (Postgres looks a little further back).
  const held = new Set(base?.matches);
  let fresh = 0;
  const read = await store.readMatches(
    { setNumber, queueId: RANKED_QUEUE, since, limit: env.maxBoards, after: base?.cursor ?? null, known: base ? base.mTime.filter((t) => t >= since).length : 0 },
    (m) => {
      const before = builder.added;
      builder.addMatch(m);
      if (builder.added > before && !held.has(m.matchId)) fresh++;
    },
  );
  const incremental = Boolean(base) && !read.full;
  // Nothing new and nothing aged out: the layout stands as it is.
  const oldest = base?.mTime[base.mTime.length - 1];
  if (incremental && !fresh && !(oldest !== undefined && oldest < since)) return { ...base!, cursor: read.cursor };
  if (incremental) builder.addColumns(base!);
  const columns = builder.finish({ key, cursor: read.cursor, fullAt: incremental ? base!.fullAt : Date.now(), since, limit: env.maxBoards });
  if (!incremental || (opts.persist && fresh > 0)) {
    await store.setBlob(BLOB, encode(columns)).catch((error) => console.warn('[metaforge] could not save the board snapshot:', error instanceof Error ? error.message : error));
  }
  return columns;
}

export function emptyColumns(): Columns {
  return new ColumnsBuilder().finish({ key: '', cursor: '', fullAt: 0, since: 0, limit: 0 });
}
