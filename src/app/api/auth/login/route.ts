import { NextResponse, type NextRequest } from 'next/server';
import { randomState, STATE_COOKIE, stateCookieOptions } from '@/lib/auth';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!env.rsoEnabled) return NextResponse.redirect(new URL('/profile?error=signin_unavailable', req.url));
  const state = randomState();
  const url = new URL('https://auth.riotgames.com/authorize');
  url.search = new URLSearchParams({ client_id: env.rsoClientId, redirect_uri: env.rsoRedirectUri, response_type: 'code', scope: 'openid', state }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, stateCookieOptions);
  return res;
}
