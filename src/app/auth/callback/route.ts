import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, STATE_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { riotGet, type AccountDto } from '@/lib/riot/api';

export const dynamic = 'force-dynamic';

/** Riot Sign-On redirect target (kept at /auth/callback so existing RSO client registrations keep working). */
export async function GET(req: NextRequest) {
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/profile?error=${encodeURIComponent(reason)}`, req.url));
    res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };
  if (!env.rsoEnabled) return fail('signin_unavailable');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (req.nextUrl.searchParams.get('error')) return fail('signin_cancelled');
  if (!code || !state || !expected || state !== expected) return fail('signin_state');

  try {
    const tokenRes = await fetch('https://auth.riotgames.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${env.rsoClientId}:${env.rsoClientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.rsoRedirectUri }),
      cache: 'no-store',
    });
    if (!tokenRes.ok) return fail('signin_token');
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) return fail('signin_token');
    const account = await riotGet<AccountDto>('americas', '/riot/account/v1/accounts/me', { token: token.access_token });
    const res = NextResponse.redirect(new URL('/profile', req.url));
    res.cookies.set(
      SESSION_COOKIE,
      signSession({ puuid: account.puuid, gameName: account.gameName ?? 'Player', tagLine: account.tagLine ?? '' }),
      sessionCookieOptions,
    );
    res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch {
    return fail('signin_failed');
  }
}
