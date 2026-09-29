import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/** Signed, httpOnly session cookie holding only the Riot identity (no Riot tokens are stored). */

export const SESSION_COOKIE = 'mf_session';
export const STATE_COOKIE = 'mf_oauth_state';
const MAX_AGE = 60 * 60 * 24 * 30;

export interface Session {
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

export function verifySession(value: string | undefined | null): Session | null {
  if (!value || !env.sessionSecret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    return s.exp > Date.now() && s.puuid ? s : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && env.appUrl.startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE,
};

export function randomState() {
  return crypto.randomBytes(24).toString('base64url');
}
