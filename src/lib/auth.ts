import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/** Signed, httpOnly session cookie holding only the Riot identity (no Riot tokens are stored). */

export const SESSION_COOKIE = 'mf_session';
export const STATE_COOKIE = 'mf_oauth_state';
const MAX_AGE = 60 * 60 * 24 * 30;

interface Session {
  puuid: string;
  gameName: string;
  tagLine: string;
  exp: number;
}

function hmac(payload: string) {
  return crypto.createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
}

export function signSession(s: Omit<Session, 'exp'>): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${body}.${hmac(body)}`;
}

function verifySession(value: string | undefined | null): Session | null {
  if (!value || !env.sessionSecret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    return s.exp > Date.now() && s.puuid ? s : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Secure whenever the site is served over https (always on Vercel, even if APP_URL was left at its default). */
const secure =
  process.env.NODE_ENV === 'production' && (env.onVercel || env.appUrl.startsWith('https://') || env.rsoRedirectUri.startsWith('https://'));

export const sessionCookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };

/** The sign-in state only has to last the round trip to Riot. */
export const stateCookieOptions = { ...sessionCookieOptions, maxAge: 600 };

export function randomState() {
  return crypto.randomBytes(24).toString('base64url');
}
