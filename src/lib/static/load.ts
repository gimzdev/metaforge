import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { liveSetNumber, pinnedSetNumber } from '@/config/game';
import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { ensurePatchState } from '@/lib/patches';
import { shared } from '@/lib/shared-cache';
import { hasSet, normalizeCdragon, trimCdragon, type RawCdragon } from './normalize';
import type { StaticData, StaticLite, StaticText } from './types';

// Game data for the current set from CommunityDragon, cached in memory, on disk and in Next's shared data cache
// (Vercel's on Vercel). What is saved is the part of CommunityDragon's file this set needs (under 1 MB of its 24 MB),
// as CommunityDragon wrote it; every server turns it into the site's own shape itself. So a deploy that changes how
// game data is read shows its changes with its first request, from the copy already saved, without asking
// CommunityDragon; a new serverless instance never downloads the whole file, and never wakes the database for it
// (every page's layout asks for this). Stale copies serve while CommunityDragon is down.
//
// The set shown is the live one (config/game.ts: the set ranked games are played on). On the day a set launches its
// games can arrive hours before CommunityDragon's file has it: until then the site stays on the set it has, and asks
// again every half hour (one download for all servers).
const FRESH_MS = 6 * 60 * 60 * 1000;
/** How often CommunityDragon is asked again for a set its file did not have yet. */
const GAP_RETRY_MS = 30 * 60 * 1000;
/** Layout of the saved copy ({ savedAt, raw }). */
const RAW_VERSION = 1;

interface Slot {
  data: StaticData | null;
  /** The set `data` was loaded for: the live set then. `data` is an older set's while CommunityDragon lacks that one. */
  set: number;
  loadedAt: number;
  inflight: Promise<StaticData> | null;
  lastError: string | null;
}

// The key is read by currentIndex() (lib/static/index.ts) in server components.
const slot = () => singleton<Slot>('static-data', () => ({ data: null, set: 0, loadedAt: 0, inflight: null, lastError: null }));

/** CommunityDragon's file has no entry for the set yet. */
class NotYet extends Error {
  constructor(set: number) {
    super(`CommunityDragon has no Set ${set} data yet`);
  }
}

const rawName = (set: number) => `static-raw-v${RAW_VERSION}-set${set}`;
const rawFile = (set: number) => path.join(env.dataDir, 'cache', `${rawName(set)}.json`);

/** `raw` is null when CommunityDragon's file did not have the set at `savedAt`. */
type Saved = { raw: RawCdragon | null; savedAt: number };
type SavedRaw = { raw: RawCdragon; savedAt: number };
const usable = (saved: Saved | null | undefined): saved is SavedRaw => Boolean(saved?.raw?.setData?.[0]?.champions?.length && Number.isFinite(saved.savedAt));

function parseRaw(text: string): SavedRaw | null {
  try {
    const parsed = JSON.parse(text) as SavedRaw;
    return usable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeDisk(set: number, saved: SavedRaw) {
  try {
    await fs.mkdir(path.dirname(rawFile(set)), { recursive: true });
    await fs.writeFile(rawFile(set), JSON.stringify(saved));
  } catch {
    /* read-only filesystem: the memory cache still works */
  }
}

/** This set's part of CommunityDragon's file (or of STATIC_DATA_FILE); null when the file has no such set yet. */
async function download(set: number): Promise<RawCdragon | null> {
  let file: RawCdragon;
  if (env.staticDataFile) file = JSON.parse(await fs.readFile(env.staticDataFile, 'utf8')) as RawCdragon;
  else {
    const res = await fetch(env.staticDataUrl, { cache: 'no-store', signal: AbortSignal.timeout(90_000), headers: { 'user-agent': 'MetaForge/1.0' } });
    if (!res.ok) throw new Error(`CommunityDragon responded ${res.status}`);
    file = (await res.json()) as RawCdragon;
  }
  // A set above the app's own (a set that went live since) is only taken when the file really has it; the app's own
  // set keeps the old rule (the newest set in the file stands in).
  if (set > pinnedSetNumber() && !hasSet(file, set)) return null;
  const raw = trimCdragon(file, set);
  if (!raw.setData?.[0]?.champions?.length || !raw.setData[0].traits?.length) throw new Error('CommunityDragon data had no champions');
  return raw;
}

// One CommunityDragon download per FRESH_MS for all servers; the name keys the set and the layout of the copy.
const sharedRaw = shared(async (_name: string, set: number): Promise<Saved> => ({ savedAt: Date.now(), raw: await download(set) }), ['static-raw'], {
  tags: ['mf-static'],
  revalidate: FRESH_MS / 1000,
});

/** Set when reading the shared copy meant downloading it and that failed, so load() doesn't try CommunityDragon twice. */
let sharedError: unknown = null;

async function readShared(set: number): Promise<SavedRaw | null> {
  sharedError = null;
  try {
    let saved: Saved;
    if (env.staticDataFile) saved = { savedAt: Date.now(), raw: await download(set) };
    else {
      saved = await sharedRaw(rawName(set), set);
      // "Not there yet" is asked again every half hour, under a name of its own so all servers share that one download.
      if (saved && !saved.raw && Date.now() - saved.savedAt > GAP_RETRY_MS) saved = await sharedRaw(`${rawName(set)}@${Math.floor(Date.now() / GAP_RETRY_MS)}`, set);
    }
    if (saved && !saved.raw) throw new NotYet(set);
    return usable(saved) ? saved : null;
  } catch (error) {
    sharedError = error;
    return null;
  }
}

/** The newest saved copy: this server's disk, or the shared copy when that is newer (a fresh serverless instance). */
async function readSaved(set: number): Promise<SavedRaw | null> {
  const disk = await fs.readFile(rawFile(set), 'utf8').then(parseRaw, () => null);
  if (disk && Date.now() - disk.savedAt < FRESH_MS) return disk;
  const fromShared = await readShared(set);
  if (fromShared && (!disk || fromShared.savedAt > disk.savedAt)) {
    void writeDisk(set, fromShared);
    return fromShared;
  }
  return disk;
}

// The copy versions up to 1.0.3 saved was already in the site's shape. It is read only when no copy of the new kind
// exists and CommunityDragon does not answer (the first hours after the upgrade): the site stays up on it.
const OLD_NAME = (set: number) => `static-v5-set${set}`;
const sharedOld = shared(
  async (_name: string): Promise<{ savedAt: number; data: StaticData }> => {
    throw new Error('no older copy');
  },
  ['static-data'],
  { tags: ['mf-static'], revalidate: FRESH_MS / 1000 },
);
async function readOld(set: number): Promise<StaticData | null> {
  const ok = (d: StaticData | null | undefined): d is StaticData => Boolean(d?.champions?.length && d.set?.number);
  try {
    const disk = JSON.parse(await fs.readFile(path.join(env.dataDir, 'cache', `${OLD_NAME(set)}.json`), 'utf8')) as { data?: StaticData };
    if (ok(disk.data)) return { ...disk.data, source: 'cache' };
  } catch {
    /* no such file */
  }
  try {
    const saved = await sharedOld(OLD_NAME(set));
    if (ok(saved?.data)) return { ...saved.data, source: 'cache' };
  } catch {
    /* nothing cached under the old name */
  }
  return null;
}

/** The same game data, wherever each copy came from. */
function sameContent(a: StaticData, b: StaticData) {
  return JSON.stringify({ ...a, source: null }) === JSON.stringify({ ...b, source: null });
}

/** The current game data. A stale copy is returned at once while a fresh one loads in the background. */
export async function getStaticData(): Promise<StaticData> {
  // Which set is live comes from the collected games (lib/patches.ts): known before the data is picked.
  await ensurePatchState();
  const s = slot();
  const set = liveSetNumber();
  if (s.data && s.set === set && Date.now() - s.loadedAt < FRESH_MS) return s.data;
  const refresh = (s.inflight ??= load(s, set).finally(() => {
    s.inflight = null;
  }));
  return s.data ? s.data : refresh;
}

/** The saved copy of a set (file, disk or shared), in the site's shape; null when there is none. */
async function fromSaved(set: number): Promise<StaticData | null> {
  try {
    const copy = env.staticDataFile ? await readShared(set) : await readSaved(set);
    return copy ? normalizeCdragon(copy.raw, set, env.staticDataFile ? 'file' : 'cache') : null;
  } catch {
    return null;
  }
}

async function load(s: Slot, set: number): Promise<StaticData> {
  // Game data loaded for this set already in memory: this is a refresh. Otherwise a new server, or the live set has moved on.
  const have = s.data && s.set === set ? s.data : null;
  try {
    // A new server starts from the saved copy, even a stale one: that keeps CommunityDragon's whole file out of cold
    // starts (its old savedAt makes the next call look for a fresher one). A refresh asks the shared copy, which one
    // server at a time renews from CommunityDragon.
    let copy = have || env.staticDataFile ? await readShared(set) : await readSaved(set);
    if (!copy) {
      if (sharedError) throw sharedError;
      const raw = await download(set);
      if (!raw) throw new NotYet(set);
      copy = { savedAt: Date.now(), raw };
      void writeDisk(set, copy);
    }
    if (have && have.set.number === set && copy.savedAt <= s.loadedAt) {
      // Still the copy this server already reads: look again in about 10 minutes.
      s.loadedAt = Date.now() - FRESH_MS + 10 * 60_000;
      return have;
    }
    const source: StaticData['source'] = env.staticDataFile ? 'file' : Date.now() - copy.savedAt < 60_000 ? 'cdragon' : 'cache';
    const fresh = normalizeCdragon(copy.raw, set, source);
    if (!fresh.champions.length || !fresh.traits.length) throw new Error('CommunityDragon data had no champions');
    // Game data changes once a patch: an identical copy keeps the current object, so the stats dataset
    // and every cached result built on it stay valid instead of being rebuilt every six hours.
    const current = have && sameContent(have, fresh) ? Object.assign(have, { source: fresh.source }) : fresh;
    Object.assign(s, { data: current, set, loadedAt: copy.savedAt, lastError: null });
    return current;
  } catch (error) {
    s.lastError = error instanceof Error ? error.message : String(error);
    const gap = error instanceof NotYet;
    let fallback: StaticData | null = have;
    if (!fallback && !gap) {
      const stale = await fs.readFile(rawFile(set), 'utf8').then(parseRaw, () => null);
      fallback = (stale ? normalizeCdragon(stale.raw, set, 'cache') : null) ?? (await readOld(set));
    }
    // The set went live before CommunityDragon has it (or its data cannot be read): stay on the newest set there is a copy of.
    if (!fallback) fallback = s.data;
    for (let older = set - 1; !fallback && older >= pinnedSetNumber(); older--) fallback = (await fromSaved(older)) ?? (await readOld(older));
    if (!fallback) throw new Error(`Game data unavailable: ${s.lastError}`);
    // Keep serving that copy and try again: in half an hour for a set CommunityDragon does not have yet, else in about 10 minutes.
    Object.assign(s, { data: fallback, set, loadedAt: Date.now() - FRESH_MS + (gap ? GAP_RETRY_MS : 10 * 60_000) });
    return fallback;
  }
}

/** Like getStaticData, but returns null instead of throwing (for the layout). */
export async function tryGetStaticData(): Promise<{ data: StaticData | null; error: string | null }> {
  try {
    return { data: await getStaticData(), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The set the site shows, for titles and API answers: the set of the game data in use (see configuredSetNumber). */
export async function shownSetNumber(): Promise<number> {
  const { data } = await tryGetStaticData();
  return data?.set.number ?? liveSetNumber();
}

export function staticDataStatus() {
  const s = slot();
  return { loadedAt: s.loadedAt || null, lastError: s.lastError, source: s.data?.source ?? null };
}

/* ── What browsers get ──────────────────────────────────── */

const derived = new WeakMap<StaticData, { lite: StaticLite; text: StaticText; version: string }>();

function derive(data: StaticData) {
  const hit = derived.get(data);
  if (hit) return hit;
  const lite: StaticLite = {
    set: data.set,
    champions: data.champions.map(({ key, slug, name, cost, traits, row, icon, tile }) => ({ key, slug, name, cost, traits, row, icon, tile })),
    traits: data.traits.map(({ key, slug, name, icon, kind, effects, champions }) => ({
      key, slug, name, icon, kind, champions, effects: effects.map(({ minUnits, style }) => ({ minUnits, style })),
    })),
    items: data.items.map(({ desc: _desc, ...item }) => item),
    augments: data.augments.map(({ desc: _desc, ...augment }) => augment),
    itemAliases: data.itemAliases,
  };
  const text: StaticText = {
    abilities: Object.fromEntries(data.champions.map((c) => [c.key, { name: c.ability.name, desc: c.ability.desc }])),
    traits: Object.fromEntries(data.traits.map((t) => [t.key, { desc: t.desc, effects: t.effects.map((e) => e.desc) }])),
    items: Object.fromEntries(data.items.map((i) => [i.key, i.desc])),
    augments: Object.fromEntries(data.augments.map((a) => [a.key, a.desc])),
  };
  // One version for both files browsers keep for good (/api/static/<version> and /api/static/<version>/lite).
  const out = { lite, text, version: createHash('sha1').update(JSON.stringify(lite)).update(JSON.stringify(text)).digest('base64url').slice(0, 12) };
  derived.set(data, out);
  return out;
}

/** Everything but descriptions: what every page carries. */
export const liteStatic = (data: StaticData) => derive(data).lite;
/** Descriptions and the content hash that versions their URL (/api/static/<version>). */
export const staticText = (data: StaticData) => derive(data).text;
export const staticTextVersion = (data: StaticData) => derive(data).version;
