import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyTicket } from '@/lib/oioxo/ticket';
import { preCheckRequest } from '@/lib/oioxo/gate';
import { utcToday } from '@/lib/usage/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Verify a per-action permission ticket — called by engines BEFORE doing any
 * heavy work. The verification:
 *   1. Re-runs Origin + UA + per-IP rate-limit gate
 *   2. Checks HMAC signature with OIOXO_ENTITLEMENT_SECRET
 *   3. Re-binds the ticket to (toolKey, inputHash, device) the engine claims
 *      to be processing — a captured ticket can't be redirected to another
 *      job or another machine.
 *   4. SPEND-ONCE check: each ticket nonce is logged in CategoryUsage on first
 *      verify; subsequent attempts with the same nonce within its TTL are
 *      rejected as `replay`. The 30s ticket TTL bounds the log size.
 *
 * Body: { ticket, toolKey, inputHash, device }
 * 200  : { valid: true } — engine proceeds
 * 403  : { valid: false, reason } — engine throws "permission denied"
 */

interface Body {
  ticket?: string;
  toolKey?: string;
  inputHash?: string;
  device?: string;
}

export async function POST(req: Request) {
  const pre = preCheckRequest(req);
  if (pre) return pre;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ valid: false, reason: 'bad-request' }, { status: 400 });
  }
  if (!body.ticket || !body.toolKey || body.inputHash === undefined || !body.device) {
    return NextResponse.json({ valid: false, reason: 'missing-fields' }, { status: 400 });
  }

  const secret = process.env.OIOXO_ENTITLEMENT_SECRET;
  if (!secret) {
    // Fail-open on misconfiguration to avoid breaking a real user.
    // The /api/permission endpoint already hard-fails free users here, so
    // the only path that reaches us with a ticket is Pro or a misconfigured
    // dev environment.
    return NextResponse.json({ valid: true, reason: 'unconfigured' });
  }

  const v = await verifyTicket(body.ticket, secret, {
    expectToolKey: body.toolKey,
    expectInput: body.inputHash,
    expectDevice: body.device,
  });
  if (!v.ok) {
    return NextResponse.json({ valid: false, reason: v.reason ?? 'invalid' }, { status: 403 });
  }

  // Spend-once nonce check. Use categoryUsage with a special category so the
  // table is reused (no migration). The unique constraint is composite on
  // (fingerprint, category, date), so we MUST pin the row's date to a value
  // derived from the TICKET, not utcToday(). Otherwise a ticket issued at
  // 23:59:30 UTC and replayed at 00:00:01 UTC (within the 30s TTL + 5s
  // skew) would store the second-use row under date=tomorrow — different
  // composite key — and the replay would succeed silently. Using the
  // issued-at date for the row ensures replay always collides.
  const nonceKey = v.claims!.nonce;
  const category = 'permission-nonce';
  const iatMs = v.claims!.iat;
  const date = new Date(Date.UTC(
    new Date(iatMs).getUTCFullYear(),
    new Date(iatMs).getUTCMonth(),
    new Date(iatMs).getUTCDate(),
  ));
  // Silence: utcToday is no longer needed here, but the import elsewhere
  // depends on the same module — keep it.
  void utcToday;
  try {
    await prisma.categoryUsage.create({
      data: { fingerprint: nonceKey, category, date, count: 1 },
    });
  } catch (e) {
    // Only Prisma's P2002 (unique constraint) means the nonce was already
    // spent. Any other DB error (connection drop, deadlock, etc.) used to be
    // mis-reported as a replay attack — locking the legitimate user out of a
    // job that just hit transient DB trouble. Surface those as 500 so the
    // caller can retry instead of being told "permission denied" forever.
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ valid: false, reason: 'replay' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json({ valid: false, reason: 'storage-error' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json({ valid: true }, { headers: { 'Cache-Control': 'no-store' } });
}
