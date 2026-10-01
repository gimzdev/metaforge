import { NextResponse } from 'next/server';
import { json } from '@/lib/http';
import { staticText, staticTextVersion, tryGetStaticData } from '@/lib/static/load';
import type { StaticData } from '@/lib/static/types';

export const dynamic = 'force-dynamic';

const bodies = new WeakMap<StaticData, { text: string; gzip?: Buffer }>();

/**
 * Ability, trait, item and augment descriptions for hover cards and the builder. The
 * version in the URL changes whenever the game data does, so a matching request can be
 * cached by the browser for good.
 */
export async function GET(req: Request, { params }: { params: Promise<{ version: string }> }) {
  const [{ version }, { data, error }] = await Promise.all([params, tryGetStaticData()]);
  if (!data) return NextResponse.json({ error: error ?? 'Game data unavailable' }, { status: 503 });
  let body = bodies.get(data);
  if (!body) bodies.set(data, (body = { text: JSON.stringify(staticText(data)) }));
  const current = version === staticTextVersion(data);
  return json(req, null, { body, headers: { 'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'no-store' } });
}
