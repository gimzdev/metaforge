import { NextResponse } from 'next/server';
import { json } from '@/lib/http';
import { liteStatic, staticTextVersion, tryGetStaticData } from '@/lib/static/load';
import type { StaticData } from '@/lib/static/types';

export const dynamic = 'force-dynamic';

const bodies = new WeakMap<StaticData, { text: string; gzip?: Buffer }>();

/**
 * The catalog: every champion, trait, item and augment without its description. Pages do not carry it: the browser
 * fetches it once per game data version (components/providers.tsx) and, the URL version tracking the data, keeps it for good.
 */
export async function GET(req: Request, { params }: { params: Promise<{ version: string }> }) {
  const [{ version }, { data, error }] = await Promise.all([params, tryGetStaticData()]);
  if (!data) return NextResponse.json({ error: error ?? 'Game data unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  let body = bodies.get(data);
  if (!body) bodies.set(data, (body = { text: JSON.stringify(liteStatic(data)) }));
  const current = version === staticTextVersion(data);
  return json(req, null, { body, headers: { 'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'no-store' } });
}
