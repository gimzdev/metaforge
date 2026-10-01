import { NextResponse, type NextRequest } from 'next/server';
import { randomState, STATE_COOKIE } from '@/lib/auth';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!env.rsoEnabled) {
    return NextResponse.redirect(new URL('/profile?error=signin_unavailable', req.url));
  }
  const state = randomState();
  const url = new URL('https://auth.riotgames.com/authorize');
  url.searchParams.set('client_id', env.rsoClientId);
  url.searchParams.set('redirect_uri', env.rsoRedirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.appUrl.startsWith('https://'),
    path: '/',
    maxAge: 600,
  });
  return res;
}
