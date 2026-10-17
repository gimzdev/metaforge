import { configuredSetNumber } from '@/config/game';
import { cachedAsync } from '@/lib/cache';
import { env } from '@/lib/env';
import { ingestRunning, lastIngestReport, schedulerInfo } from '@/lib/ingest';
import { lastKeyErrorAt } from '@/lib/riot/api';
import { staticDataStatus, tryGetStaticData } from '@/lib/static/load';
import { shared, STATUS_TAG } from '@/lib/shared-cache';
import { getStore } from '@/lib/store';

/** /api/status payload, shared by the status page and the header indicator. */
export interface StatusPayload {
  setNumber: number;
  boards: number;
  matches: number;
  lastMatchAt: number | null;
  collecting: boolean;
  schedulerActive: boolean;
  nextRunAt: number | null;
  riotKey: boolean;
  keyRejectedAt: number | null;
  database: boolean;
  store: string;
  lastReport: {
    ok: boolean;
    finishedAt: number;
    error?: string;
    stored: number;
    regions: Array<{ platform: string; stored: number; skipped: number; errors: number; note?: string }>;
  } | null;
  staticData: { source: string | null; loadedAt: number | null; error: string | null };
}

async function readStatus(): Promise<StatusPayload> {
  const setNumber = configuredSetNumber();
  const store = getStore();
  let stats = { matches: 0, boards: 0, lastMatchAt: null as number | null };
  let storeError = false;
  try {
    // Counting boards joins every stored board (a second or more on a big table); counts only move with collection runs.
    stats = await cachedAsync(`store-stats:${setNumber}`, 120_000, () => store.stats(setNumber));
  } catch (error) {
    // Public payload: details (hosts, users) only go to the server log.
    console.error('[metaforge] status: reading the store failed:', error);
    storeError = true;
  }
  const [report] = await Promise.all([lastIngestReport(), tryGetStaticData()]); // a real game data load attempt first
  const scheduler = schedulerInfo();
  const s = staticDataStatus();
  return {
    setNumber,
    boards: stats.boards,
    matches: stats.matches,
    lastMatchAt: stats.lastMatchAt,
    collecting: ingestRunning(),
    schedulerActive: scheduler.active,
    nextRunAt: scheduler.nextRunAt,
    riotKey: Boolean(env.riotApiKey),
    keyRejectedAt: lastKeyErrorAt(),
    database: Boolean(env.databaseUrl),
    store: storeError ? `${store.describe()} — unavailable (details in the server log)` : store.describe(),
    lastReport: report
      ? {
          ok: report.ok,
          finishedAt: report.finishedAt,
          error: report.error,
          stored: report.regions.reduce((sum, r) => sum + r.stored, 0),
          regions: report.regions.map(({ platform, stored, skipped, errors, note }) => ({ platform, stored, skipped, errors, note })),
        }
      : null,
    staticData: { source: s.source, loadedAt: s.loadedAt, error: s.lastError },
  };
}

// The header's data line polls this from every open tab. It only changes when a collection run finishes, and the cron
// route refreshes it then (revalidateTag), so it is shared by all servers through the data cache instead of read from
// Postgres on each poll. A read that failed is not shared.
const sharedStatus = shared(readStatus, ['status'], { tags: [STATUS_TAG], revalidate: 4 * 3600, keep: (s) => !s.store.includes('unavailable') });

/** The status page asks for a fresh read; the header's line gets the shared copy. */
export const getStatus = (fresh = false) => (fresh ? readStatus() : cachedAsync('status', 60_000, () => sharedStatus()));
