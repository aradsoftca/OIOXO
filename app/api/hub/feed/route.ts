import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildHubFeed, hubAuthorized } from '@/lib/hub-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hubAuthorized(req.headers.get('authorization'), process.env.HUB_KEY)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    return NextResponse.json(await buildHubFeed(prisma as any), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'feed failed' }, { status: 500 });
  }
}
