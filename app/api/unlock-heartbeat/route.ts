import { NextResponse } from 'next/server';
import { verifyEntitlement } from '@/lib/oioxo/entitlement';
import { preCheckRequest } from '@/lib/oioxo/gate';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Periodic re-validation for already-unlocked encrypted workers — the SECOND
 * wall behind /api/tool-key's one-shot handshake.
 *
 * The handshake mints a grant with a short TTL (~2 min). After the worker has
 * been decrypted into a Blob URL, the client periodically calls THIS endpoint
 * to confirm the entitlement is still live + device-bound. If it isn't, the
 * client wrapper revokes the cached Blob URL and refuses to spawn any further
 * workers until a full re-handshake succeeds.
 *
 * What this fixes: previously, once a paid session decrypted the workers, the
 * Blob URLs were valid for the whole tab lifetime — a multi-hour scrape window.
 * Now, network egress to /api/unlock-heartbeat is a continuous requirement,
 * and any server-side revocation (manual ban / refund / plan downgrade) takes
 * effect on the next heartbeat (≤5 min).
 *
 * Body: { entitlement, device }. Returns { valid: boolean, exp: number }.
 * Gated by the same Origin/UA/rate-limit pre-check as the other key routes.
 */

interface HeartbeatBody {
  entitlement?: string;
  device?: string;
}

export async function POST(req: Request) {
  const pre = preCheckRequest(req);
  if (pre) return pre;

  let body: HeartbeatBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ valid: false, reason: 'malformed' }, { status: 400 });
  }
  if (!body.entitlement || !body.device) {
    return NextResponse.json({ valid: false, reason: 'missing-fields' }, { status: 400 });
  }

  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!secret) {
    // Fail open on misconfiguration — never block a real user because we forgot
    // an env var. The handshake routes are still hard-fail, so the worker
    // can't start without a valid setup anyway.
    return NextResponse.json({ valid: true, reason: 'unconfigured' });
  }

  const v = await verifyEntitlement(body.entitlement, secret, {
    now: Date.now(),
    expectDevice: body.device,
  });
  if (!v.ok) {
    return NextResponse.json({ valid: false, reason: v.reason ?? 'invalid' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  // Re-check the live plan. The entitlement is signed for 72h (signEntitlement
  // default TTL), so without this lookup the heartbeat would only enforce
  // signature + device + exp — meaning a Pro user who CANCELS or whose plan is
  // revoked mid-session keeps Pro for up to 72h until the entitlement expires.
  // The docs promise revocation within ≤5 min on the next heartbeat; that
  // promise was only true if we re-query the DB here. The `sub` claim carries
  // the user id; 'anon' entitlements skip the lookup (no Pro to revoke).
  const sub = v.claims?.sub;
  const tier = v.claims?.tier;
  if (sub && sub !== 'anon' && tier && tier !== 'free') {
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { plan: true, subscriptionEndsAt: true },
    }).catch(() => null);
    const expired = user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now();
    const livePaid = !expired && user && (user.plan === 'PRO' || user.plan === 'BUSINESS');
    if (!livePaid) {
      return NextResponse.json({ valid: false, reason: 'plan-changed' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }
  // Echo the entitlement's exp so the client can plan its next beat — the worker
  // wrapper schedules a re-handshake before this passes.
  return NextResponse.json({
    valid: true,
    exp: v.claims?.exp ?? Date.now() + 5 * 60_000,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
