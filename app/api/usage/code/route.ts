/**
 * OIOXO coding agent — TIME-based usage meter.
 *
 * Every model is accessible (hardware-gated, not paywalled). Monetization is the
 * daily allowance of active AI time: free accounts get CODE_FREE_SECONDS_PER_DAY,
 * activated (PRO/BUSINESS) accounts are unlimited.
 *
 *   POST { action: 'start' }            → may I begin a run? (no increment)
 *   POST { action: 'report', seconds }  → I used N active seconds (increment)
 *
 * The client soft-blocks from `remainingSeconds`; this server is the hard boundary.
 */
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CODE_CATEGORY, CODE_FREE_SECONDS_PER_DAY } from '@/lib/usage/config';
import { fingerprints, newCookieId, USAGE_COOKIE, COOKIE_MAX_AGE } from '@/lib/usage/identity';
import { getUsage, addSeconds } from '@/lib/usage/service';
import { applyMeshReceipts, currentMeshCredit } from '@/lib/oioxo/mesh-credit-server';

export const runtime = 'nodejs';

type Action = 'start' | 'report';

// The desktop app calls this cross-origin (no cookie); it identifies itself with an
// `x-oioxo-device` header (a stable device id) — and later an Authorization bearer
// account token. The same meter then serves both web (cookie) and desktop surfaces.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-oioxo-device, authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** The signed-in account + whether it's unlimited (PRO/BUSINESS). */
async function account(): Promise<{ userId: string | null; pro: boolean }> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) return { userId: null, pro: false };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return { userId, pro: user?.plan === 'PRO' || user?.plan === 'BUSINESS' };
}

export async function POST(req: Request) {
  let body: { action?: Action; seconds?: number; device?: string; receipts?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400, headers: CORS });
  }
  const action: Action = body.action === 'report' ? 'report' : 'start';

  const { userId, pro } = await account();
  if (pro) {
    return NextResponse.json({ allowed: true, unlimited: true, remainingSeconds: null, limitSeconds: null }, { headers: CORS });
  }

  const h = await headers();
  const jar = await cookies();
  let cookieId = jar.get(USAGE_COOKIE)?.value;
  const freshCookie = !cookieId;
  if (!cookieId) cookieId = newCookieId();
  // Desktop identity = the `x-oioxo-device` header (no cookie cross-origin); web
  // identity = cookie + IP. Meter against whichever fingerprints we have.
  const deviceRaw = h.get('x-oioxo-device') || body.device || '';
  const device = deviceRaw ? deviceRaw.slice(0, 64) : null;
  const fps = [...fingerprints(h, cookieId), ...(device ? [`device:${device}`] : [])];

  if (action === 'report') {
    const seconds = typeof body.seconds === 'number' ? body.seconds : 0;
    if (seconds > 0) await addSeconds(fps, CODE_CATEGORY, seconds, userId ?? undefined);
  }

  // Compute-mesh credit (accounts-only): apply any submitted receipts, then extend the
  // day's free allowance by the credit earned lending your own hardware.
  let meshCredit = 0;
  if (userId) {
    meshCredit = action === 'report' && Array.isArray(body.receipts) && body.receipts.length
      ? await applyMeshReceipts(userId, body.receipts)
      : await currentMeshCredit(userId);
  }

  const used = await getUsage(fps, CODE_CATEGORY);
  const limit = CODE_FREE_SECONDS_PER_DAY + meshCredit;
  const remaining = Math.max(0, limit - used);
  const allowed = remaining > 0;

  const res = NextResponse.json({
    allowed,
    unlimited: false,
    usedSeconds: used,
    limitSeconds: limit,
    remainingSeconds: remaining,
    meshCreditSeconds: meshCredit,
    gate: allowed ? 'free' : 'paywall',
  }, { headers: CORS });
  if (freshCookie) {
    res.cookies.set(USAGE_COOKIE, cookieId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }
  return res;
}
