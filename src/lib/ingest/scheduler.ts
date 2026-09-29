import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { runIngest } from './index';

/**
 * Background collection for long-running servers (`npm start` / `npm run dev`).
 * On Vercel the /api/cron/ingest route is triggered by vercel.json instead.
 */
export function startIngestScheduler() {
  const state = singleton('ingest-scheduler', () => ({ started: false, nextRunAt: 0 }));
  if (state.started) return;
  const minutes = env.ingestIntervalMinutes;
  if (!env.riotApiKey || minutes <= 0 || env.onVercel) return;
  state.started = true;

  const tick = async () => {
    try {
      const report = await runIngest();
      if (report.error) console.warn(`[metaforge] collection: ${report.error}`);
    } catch (error) {
      console.warn('[metaforge] collection failed:', (error as Error).message);
    } finally {
      state.nextRunAt = Date.now() + minutes * 60_000;
      setTimeout(tick, minutes * 60_000).unref?.();
    }
  };
  state.nextRunAt = Date.now() + 5_000;
  setTimeout(tick, 5_000).unref?.();
  console.log(`[metaforge] match collection every ${minutes} min (regions: ${env.ingestRegions})`);
}

export function schedulerInfo() {
  const state = singleton('ingest-scheduler', () => ({ started: false, nextRunAt: 0 }));
  return { active: state.started, nextRunAt: state.nextRunAt || null };
}
