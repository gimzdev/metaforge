import { configuredSetNumber } from '@/config/game';
import { cachedAsync } from '@/lib/cache';
import { env } from '@/lib/env';
import { ingestRunning, lastIngestReport, schedulerInfo } from '@/lib/ingest';
import { lastKeyErrorAt } from '@/lib/riot/api';
import { staticDataStatus, tryGetStaticData } from '@/lib/static/load';
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
  let storeError: string | null = null;
  try {
    // Counting boards is not free on a big table.
    stats = await cachedAsync(`store-stats:${setNumber}`, 30_000, () => store.stats(setNumber));
  } catch (error) {
    storeError = error instanceof Error ? error.message : String(error);
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
    store: storeError ? `${store.describe()} — ${storeError}` : store.describe(),
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

/** Every open tab polls this, so answers are shared for a few seconds. */
export const getStatus = (fresh = false) => (fresh ? readStatus() : cachedAsync('status', 10_000, readStatus));
