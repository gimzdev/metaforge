import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { configuredSetNumber } from '@/config/game';
import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { normalizeCdragon, type RawCdragon } from './normalize';
import type { StaticData, StaticLite, StaticText } from './types';

// Game data for the current set from CommunityDragon, cached in memory, on disk and (with Postgres) in the database, so a
// new serverless instance reads a small saved copy instead of CommunityDragon's whole file. Stale copies serve while it's down.
const FRESH_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = 5;

interface Slot {
  data: StaticData | null;
  loadedAt: number;
  inflight: Promise<StaticData> | null;
  lastError: string | null;
}

// The key is read by currentIndex() (lib/static/index.ts) in server components.
const slot = () => singleton<Slot>('static-data', () => ({ data: null, loadedAt: 0, inflight: null, lastError: null }));

const cacheName = () => `static-v${CACHE_VERSION}-set${configuredSetNumber()}`;
const cacheFile = () => path.join(env.dataDir, 'cache', `${cacheName()}.json`);
const shared = () => (getStore().kind === 'postgres' ? getStore() : null);

type Saved = { data: StaticData; savedAt: number };

function parseSaved(text: string): Saved | null {
  try {
    const parsed = JSON.parse(text) as Saved;
    return parsed?.data?.champions?.length ? { data: { ...parsed.data, source: 'cache' }, savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

async function writeDisk(text: string) {
  try {
    await fs.mkdir(path.dirname(cacheFile()), { recursive: true });
    await fs.writeFile(cacheFile(), text);
  } catch {
    /* read-only filesystem: the memory cache still works */
  }
}

async function readShared(): Promise<Saved | null> {
  try {
    const blob = await shared()?.getBlob(cacheName());
    return blob ? parseSaved(gunzipSync(blob).toString('utf8')) : null;
  } catch {
    return null;
  }
}

/** The newest saved copy: this server's disk, or the database when that is newer (a fresh serverless instance). */
async function readSaved(): Promise<Saved | null> {
  const disk = await fs.readFile(cacheFile(), 'utf8').then(parseSaved, () => null);
  if (disk && Date.now() - disk.savedAt < FRESH_MS) return disk;
  const db = await readShared();
  if (db && (!disk || db.savedAt > disk.savedAt)) {
    void writeDisk(JSON.stringify(db));
    return db;
  }
  return disk;
}

async function writeSaved(data: StaticData) {
  const text = JSON.stringify({ savedAt: Date.now(), data });
  await writeDisk(text);
  await shared()?.setBlob(cacheName(), gzipSync(text)).catch(() => undefined);
}

async function fetchFresh(): Promise<StaticData> {
  const setNumber = configuredSetNumber();
  if (env.staticDataFile) {
    return normalizeCdragon(JSON.parse(await fs.readFile(env.staticDataFile, 'utf8')) as RawCdragon, setNumber, 'file');
  }
  const res = await fetch(env.staticDataUrl, { cache: 'no-store', signal: AbortSignal.timeout(90_000), headers: { 'user-agent': 'MetaForge/1.0' } });
  if (!res.ok) throw new Error(`CommunityDragon responded ${res.status}`);
  const data = normalizeCdragon((await res.json()) as RawCdragon, setNumber, 'cdragon');
  if (!data.champions.length || !data.traits.length) throw new Error('CommunityDragon data had no champions');
  return data;
}

/** The same game data, wherever each copy came from. */
function sameContent(a: StaticData, b: StaticData) {
  return JSON.stringify({ ...a, source: null }) === JSON.stringify({ ...b, source: null });
}

/** The current game data. A stale copy is returned at once while a fresh one loads in the background. */
export function getStaticData(): Promise<StaticData> {
  const s = slot();
  if (s.data && Date.now() - s.loadedAt < FRESH_MS) return Promise.resolve(s.data);
  const refresh = (s.inflight ??= load(s).finally(() => {
    s.inflight = null;
  }));
  return s.data ? Promise.resolve(s.data) : refresh;
}

async function load(s: Slot): Promise<StaticData> {
  let readCopy = false;
  try {
    if (!s.data && !env.staticDataFile) {
      // A new server starts from the saved copy, even a stale one: that keeps CommunityDragon's whole
      // file out of cold starts. Its old loadedAt makes the next call fetch a fresh copy in the background.
      const saved = await readSaved();
      readCopy = true;
      if (saved) {
        Object.assign(s, { data: saved.data, loadedAt: saved.savedAt });
        return saved.data;
      }
    }
    const fresh = await fetchFresh();
    // Game data changes once a patch: an identical copy keeps the current object, so the stats dataset
    // and every cached result built on it stay valid instead of being rebuilt every six hours.
    const current = s.data && sameContent(s.data, fresh) ? Object.assign(s.data, { source: fresh.source }) : fresh;
    Object.assign(s, { data: current, loadedAt: Date.now(), lastError: null });
    void writeSaved(fresh);
    return current;
  } catch (error) {
    s.lastError = error instanceof Error ? error.message : String(error);
    const fallback = s.data ?? (readCopy ? null : (await readSaved())?.data);
    if (!fallback) throw new Error(`Game data unavailable: ${s.lastError}`);
    // Keep serving the old copy and try again in about 10 minutes.
    Object.assign(s, { data: fallback, loadedAt: Date.now() - FRESH_MS + 10 * 60_000 });
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
  const out = { lite, text, version: createHash('sha1').update(JSON.stringify(text)).digest('base64url').slice(0, 12) };
  derived.set(data, out);
  return out;
}

/** Everything but descriptions: what every page carries. */
export const liteStatic = (data: StaticData) => derive(data).lite;
/** Descriptions and the content hash that versions their URL (/api/static/<version>). */
export const staticText = (data: StaticData) => derive(data).text;
export const staticTextVersion = (data: StaticData) => derive(data).version;
