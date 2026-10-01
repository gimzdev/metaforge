import type { Metadata } from 'next';
import { CheckCircle2, CircleAlert, CircleDashed } from '@/components/icons';
import type { ReactNode } from 'react';
import { PageHeader, Panel } from '@/components/ui';
import { RefreshButton } from '@/components/ui-client';
import { configuredSetNumber, getSetInfo } from '@/config/game';
import { env } from '@/lib/env';
import { platformLabel } from '@/lib/riot/regions';
import { getStatus } from '@/lib/status';
import { cn, fmt } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Data status', robots: { index: false } };

type Tone = 'ok' | 'warn' | 'off';

function Row({ tone, label, value, hint }: { tone: Tone; label: string; value: ReactNode; hint?: ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? CircleAlert : CircleDashed;
  return (
    <div className="flex items-start gap-3 border-t hairline py-3.5 first:border-t-0">
      <Icon className={cn('mt-0.5 size-5 shrink-0', tone === 'ok' ? 'text-good' : tone === 'warn' ? 'text-bloom' : 'text-fog')} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="text-sm text-lichen">{label}</span>
          <span className="text-sm font-medium text-moon">{value}</span>
        </div>
        {hint && <div className="mt-1 text-xs leading-relaxed text-fog">{hint}</div>}
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const s = await getStatus(true);
  const info = getSetInfo(configuredSetNumber());
  const keyRejected = Boolean(s.keyRejectedAt && Date.now() - s.keyRejectedAt < 6 * 60 * 60_000);

  return (
    <div className="space-y-6">
      <PageHeader title="Data status" description={`What MetaForge has collected for Set ${info.number}: ${info.name}, and whether collection is healthy.`}>
        <RefreshButton />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Collection">
          <Row
            tone={s.boards > 0 ? 'ok' : 'off'}
            label="Boards stored"
            value={<span className="num">{fmt.int(s.boards)} boards from {fmt.int(s.matches)} matches</span>}
            hint={s.lastMatchAt ? `Newest game played ${fmt.ago(s.lastMatchAt)}.` : 'No ranked games stored yet.'}
          />
          <Row
            tone={!s.riotKey ? 'warn' : keyRejected ? 'warn' : 'ok'}
            label="Riot API key"
            value={!s.riotKey ? 'Missing' : keyRejected ? 'Rejected' : 'Configured'}
            hint={
              !s.riotKey
                ? 'Set RIOT_API_KEY in .env.local and restart.'
                : keyRejected
                  ? `Riot rejected the key ${fmt.ago(s.keyRejectedAt!)}. Development keys expire every 24 hours; generate a new one at developer.riotgames.com.`
                  : 'Development keys expire every 24 hours; production keys do not.'
            }
          />
          <Row
            tone={s.collecting ? 'ok' : s.schedulerActive ? 'ok' : env.onVercel ? 'ok' : 'off'}
            label="Schedule"
            value={
              s.collecting
                ? 'Collecting now'
                : s.schedulerActive
                  ? s.nextRunAt
                    ? `Next run ${s.nextRunAt > Date.now() ? `in ${Math.max(1, Math.round((s.nextRunAt - Date.now()) / 60_000))} min` : 'now'}`
                    : 'Active'
                  : env.onVercel
                    ? 'Vercel cron'
                    : 'Off'
            }
            hint={
              env.onVercel
                ? 'vercel.json triggers /api/cron/ingest on a schedule.'
                : `Runs every ${env.ingestIntervalMinutes} minutes while the server is up (INGEST_INTERVAL_MINUTES). Regions: ${env.ingestRegions}.`
            }
          />
          <Row
            tone={s.store.includes('—') ? 'warn' : 'ok'}
            label="Storage"
            value={s.database ? 'Postgres' : 'Local files'}
            hint={s.store}
          />
          <Row
            tone={s.staticData.error ? 'warn' : s.staticData.source ? 'ok' : 'off'}
            label="Game data"
            value={s.staticData.source === 'cdragon' ? 'CommunityDragon' : s.staticData.source === 'cache' ? 'Cached copy' : s.staticData.source === 'file' ? 'Local file' : 'Not loaded'}
            hint={
              s.staticData.error
                ? `Last refresh failed: ${s.staticData.error}`
                : s.staticData.loadedAt
                  ? `Loaded ${fmt.ago(s.staticData.loadedAt)}; refreshed every 6 hours.`
                  : undefined
            }
          />
        </Panel>

        <Panel title="Last collection run" flush={Boolean(s.lastReport)}>
          {s.lastReport ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-5 py-3 text-sm">
                <span className={s.lastReport.ok ? 'text-wisp' : 'text-bloom'}>{s.lastReport.ok ? 'Completed' : 'Finished with problems'}</span>
                <span className="text-lichen">
                  {fmt.ago(s.lastReport.finishedAt)}, <span className="num">{fmt.int(s.lastReport.stored)}</span> new matches
                </span>
              </div>
              {s.lastReport.error && <div className="border-b hairline px-5 py-3 text-sm text-bloom">{s.lastReport.error}</div>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-lichen">
                    <th className="px-5 py-2 text-left font-medium">Region</th>
                    <th className="px-3 py-2 text-right font-medium">Stored</th>
                    <th className="px-3 py-2 text-right font-medium">Skipped</th>
                    <th className="px-5 py-2 text-right font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lastReport.regions.map((r) => (
                    <tr key={r.platform} className="border-t hairline">
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{platformLabel(r.platform)}</div>
                        {r.note && <div className="text-xs text-fog">{r.note}</div>}
                      </td>
                      <td className="num px-3 py-2.5 text-right">{fmt.int(r.stored)}</td>
                      <td className="num px-3 py-2.5 text-right text-lichen">{fmt.int(r.skipped)}</td>
                      <td className={cn('num px-5 py-2.5 text-right', r.errors ? 'text-bloom' : 'text-lichen')}>{fmt.int(r.errors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-lichen">
              {s.riotKey ? 'The first run starts a few seconds after the server boots.' : 'Collection starts once a Riot API key is configured.'}
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Running collection yourself">
        <div className="grid gap-5 text-sm leading-relaxed text-lichen md:grid-cols-3">
          <div>
            <div className="font-semibold text-moon">From the terminal</div>
            <p className="mt-1">
              <code className="rounded bg-night px-1.5 py-0.5 text-moon">npm run ingest</code> runs one pass; add region ids to target
              specific servers, for example <code className="rounded bg-night px-1.5 py-0.5 text-moon">npm run ingest -- kr euw1</code>.
            </p>
          </div>
          <div>
            <div className="font-semibold text-moon">From a scheduler</div>
            <p className="mt-1">
              Call <code className="rounded bg-night px-1.5 py-0.5 text-moon">/api/cron/ingest</code> with the header{' '}
              <code className="rounded bg-night px-1.5 py-0.5 text-moon">Authorization: Bearer CRON_SECRET</code>.
            </p>
          </div>
          <div>
            <div className="font-semibold text-moon">More data, faster</div>
            <p className="mt-1">
              Raise INGEST_MATCHES_PER_REGION and add regions in .env.local. A production Riot key allows far higher rate limits
              (set RIOT_RATE_LIMITS to match).
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
