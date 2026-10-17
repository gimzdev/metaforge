import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { env } from '@/lib/env';
import { runIngest } from '@/lib/ingest';
import { STATS_TAG, STATUS_TAG } from '@/lib/shared-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const a = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : (req.nextUrl.searchParams.get('secret') ?? ''));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const report = await runIngest({ log: (m) => console.log(`[metaforge] ${m}`) });
  // Pages read stats and the status line from the shared cache (lib/shared-cache.ts): mark them stale now that the run
  // is done, and the next view rebuilds them in the background from the new matches.
  try {
    revalidateTag(STATUS_TAG, 'max');
    if (report.regions.some((r) => r.stored > 0)) revalidateTag(STATS_TAG, 'max');
  } catch (error) {
    console.warn('[metaforge] could not refresh the shared cache:', error instanceof Error ? error.message : error);
  }
  return NextResponse.json(report, { status: report.error && !report.regions.length ? 503 : 200 });
}

export const GET = handle;
export const POST = handle;
