import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { env } from '@/lib/env';
import { runIngest } from '@/lib/ingest';

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
  return NextResponse.json(report, { status: report.error && !report.regions.length ? 503 : 200 });
}

export const GET = handle;
export const POST = handle;
