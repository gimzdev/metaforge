import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
