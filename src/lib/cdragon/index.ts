import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configuredSetNumber } from '@/config/game';
import { env } from '@/lib/env';
import { singleton } from '@/lib/cache';
import type { StaticData } from '@/types/static';
import { normalizeCdragon, type RawCdragon } from './normalize';

/**
 * Static game data (champions, traits, items, augments) for the current set,
 * pulled from CommunityDragon. Cached in memory and on disk; a stale copy is
 * served if CommunityDragon is unreachable.
 */

const FRESH_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = 4;

interface Slot {
  data: StaticData | null;
  loadedAt: number;
  inflight: Promise<StaticData> | null;
  lastError: string | null;
}

const slot = () =>
  singleton<Slot>('static-data', () => ({ data: null, loadedAt: 0, inflight: null, lastError: null }));

function cacheFile() {
  return path.join(env.dataDir, 'cache', `static-v${CACHE_VERSION}-set${configuredSetNumber()}.json`);
}

async function readDiskCache(): Promise<{ data: StaticData; savedAt: number } | null> {
  try {
    const text = await fs.readFile(cacheFile(), 'utf8');
    const parsed = JSON.parse(text) as { savedAt: number; data: StaticData };
    if (!parsed?.data?.champions?.length) return null;
    return { data: { ...parsed.data, source: 'cache' }, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

async function writeDiskCache(data: StaticData) {
  try {
    await fs.mkdir(path.dirname(cacheFile()), { recursive: true });
    await fs.writeFile(cacheFile(), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* read-only filesystem — memory cache still works */
  }
}

async function fetchFresh(): Promise<StaticData> {
  const setNumber = configuredSetNumber();
  if (env.staticDataFile) {
    const raw = JSON.parse(await fs.readFile(env.staticDataFile, 'utf8')) as RawCdragon;
    return normalizeCdragon(raw, setNumber, 'file');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(env.staticDataUrl, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'MetaForge/2.0 (+https://github.com/)' },
    });
    if (!res.ok) throw new Error(`CommunityDragon responded ${res.status}`);
    const raw = (await res.json()) as RawCdragon;
    const data = normalizeCdragon(raw, setNumber, 'cdragon');
    if (!data.champions.length || !data.traits.length) throw new Error('CommunityDragon data had no champions');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function getStaticData(): Promise<StaticData> {
  const s = slot();
  const now = Date.now();
  if (s.data && now - s.loadedAt < FRESH_MS) return s.data;
  if (s.inflight) return s.inflight;

  s.inflight = (async () => {
    try {
      if (!s.data) {
        const disk = await readDiskCache();
        if (disk && now - disk.savedAt < FRESH_MS && !env.staticDataFile) {
          s.data = disk.data;
          s.loadedAt = disk.savedAt;
          return disk.data;
        }
      }
      const fresh = await fetchFresh();
      s.data = fresh;
      s.loadedAt = Date.now();
      s.lastError = null;
      void writeDiskCache(fresh);
      return fresh;
    } catch (error) {
      s.lastError = error instanceof Error ? error.message : String(error);
      const fallback = s.data ?? (await readDiskCache())?.data;
      if (fallback) {
        s.data = fallback;
        s.loadedAt = Date.now() - FRESH_MS + 10 * 60 * 1000; // retry in ~10 minutes
        return fallback;
      }
      throw new Error(`Game data unavailable: ${s.lastError}`);
    } finally {
      s.inflight = null;
    }
  })();
  return s.inflight;
}

/** Like getStaticData, but returns null instead of throwing (for layouts). */
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
