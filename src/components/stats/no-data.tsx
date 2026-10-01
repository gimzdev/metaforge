import { Radio, KeyRound, Database, TriangleAlert } from '@/components/icons';
import { env } from '@/lib/env';
import { ingestRunning, lastIngestReport, schedulerInfo } from '@/lib/ingest';
import { getStore } from '@/lib/store';
import { fmt } from '@/lib/utils';

/** Shown instead of stats until the first ranked matches are collected. */
export async function NoData({ error }: { error?: string | null }) {
  const report = await lastIngestReport();
  const running = ingestRunning();
  const scheduler = schedulerInfo();
  const hasKey = Boolean(env.riotApiKey);

  return (
    <div className="surface relative overflow-hidden rounded-xl p-6 sm:p-10">
      <div className="relative max-w-2xl">
        <div className="eyebrow mb-4 inline-flex items-center gap-2 text-wisp">
          <Radio className={running ? 'size-3.5 animate-pulse-soft' : 'size-3.5'} aria-hidden />
          {running ? 'Collecting ranked matches right now' : hasKey ? 'Waiting for the first ranked matches' : 'Match collection is off'}
        </div>
        <h2 className="text-[1.75rem] leading-tight sm:text-[2.1rem]">
          {hasKey ? 'Stats appear as soon as the first matches land' : 'Add a Riot API key to start collecting matches'}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-lichen">
          {hasKey
            ? 'MetaForge collects ranked games and turns every final board into stats. The first batch usually arrives within a few minutes of starting the server.'
            : 'Stats come from ranked games pulled from the Riot API. Champions, traits, items and the team builder already work without a key.'}
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          <li className="flex items-start gap-3 rounded-lg border border-line p-4">
            <KeyRound className={hasKey ? 'mt-0.5 size-5 text-wisp' : 'mt-0.5 size-5 text-firefly'} aria-hidden />
            <div className="text-sm">
              <div className="font-semibold">{hasKey ? 'Riot API key configured' : 'RIOT_API_KEY missing'}</div>
              <div className="mt-0.5 text-lichen">
                {hasKey ? 'Development keys expire every 24 hours.' : 'Add it to .env.local and restart.'}
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-line p-4">
            <Database className="mt-0.5 size-5 text-wisp" aria-hidden />
            <div className="text-sm">
              <div className="font-semibold">{getStore().describe()}</div>
              <div className="mt-0.5 text-lichen">
                {env.databaseUrl ? 'Matches are stored in your database.' : 'Set DATABASE_URL for hosted deployments.'}
              </div>
            </div>
          </li>
        </ul>

        {(error || report?.error) && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-bloom/30 bg-bloom/10 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bloom" aria-hidden />
            <div>
              <div className="font-semibold text-moon">Last collection problem</div>
              <div className="mt-0.5 text-lichen">{error || report?.error}</div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-lichen">
          {report && (
            <span>
              Last run {fmt.ago(report.finishedAt)}:{' '}
              <span className="text-moon">{report.regions.reduce((s, r) => s + r.stored, 0)}</span> matches stored
            </span>
          )}
          {scheduler.active && scheduler.nextRunAt && (
            <span>Next run {scheduler.nextRunAt > Date.now() ? `in ${Math.max(1, Math.round((scheduler.nextRunAt - Date.now()) / 60000))} min` : 'now'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact notice for detail pages when no ranked boards are stored yet. */
export function NoStatsNotice({ what = 'Performance stats' }: { what?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong px-5 py-4 text-sm text-lichen">
      <Radio className="size-4 text-wisp" aria-hidden />
      <span>{what} appear once ranked matches have been collected.</span>
    </div>
  );
}
