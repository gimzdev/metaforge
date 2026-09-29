import { configuredSetNumber } from '@/config/game';
import { cachedAsync } from '@/lib/cache';
import { staticDataStatus, tryGetStaticData } from '@/lib/cdragon';
import { env } from '@/lib/env';
import { ingestRunning, lastIngestReport } from '@/lib/ingest';
import { schedulerInfo } from '@/lib/ingest/scheduler';
import { lastKeyErrorAt } from '@/lib/riot/client';
import { getStore } from '@/lib/store';
import type { StatusPayload } from './status-types';

export async function getStatus(): Promise<StatusPayload> {
  const setNumber = configuredSetNumber();
  const store = getStore();
  let stats = { matches: 0, boards: 0, lastMatchAt: null as number | null, firstMatchAt: null as number | null };
  let storeError: string | null = null;
  try {
    // Counting boards is not free on a big table and every open tab polls this.
    stats = await cachedAsync(`store-stats:${setNumber}`, 30_000, () => store.stats(setNumber));
  } catch (error) {
    storeError = error instanceof Error ? error.message : String(error);
  }
  const report = await lastIngestReport();
  await tryGetStaticData(); // make sure the game data status reflects a real load attempt
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
          regions: report.regions.map((r) => ({
            platform: r.platform,
            stored: r.stored,
            skipped: r.skipped,
            errors: r.errors,
            note: r.note,
          })),
        }
      : null,
    staticData: { source: s.source, loadedAt: s.loadedAt, error: s.lastError },
  };
}
