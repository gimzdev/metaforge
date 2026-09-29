import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Sign out (POST only, so link prefetching can never end a session). */
export function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/', req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
