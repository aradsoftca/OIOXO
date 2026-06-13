import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { preCheckRequest } from '@/lib/oioxo/gate';
import { signAppToken, appTokenSecret } from '@/lib/oioxo/app-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Email+password login for the native Xtudio apps (Capacitor), which can't use
 * the NextAuth cookie flow. Validates credentials with the SAME constant-time
 * bcrypt path as the web Credentials provider (lib/auth.ts) and returns a signed
 * app bearer token the app stores in the OS keystore and presents to
 * /api/entitlement. The bearer is NOT the Pro gate — it only lets the app ask
 * the server for a fresh, device-bound entitlement, which is re-derived from the
 * live subscription each time.
 */

// Same dummy hash as lib/auth.ts so a missing user costs the same bcrypt time
// (no email-enumeration timing signal).
const DUMMY_HASH = '$2a$10$DidcYOGX/AZsHDBveDEtd.Iw0oYZOV8e76fxDGJoDetKAlDhuR2Qy';

export async function POST(req: Request) {
  // The login request comes from the native app (no browser origin, non-browser
  // UA) and has no bearer yet, so relax those filters — the constant-time bcrypt
  // credential check below is the real gate. Rate limit still applies.
  const pre = preCheckRequest(req, { skipBrowserCheck: true });
  if (pre) return pre;

  if (!appTokenSecret()) {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  let body: { email?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const hash = user?.password || DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);
  if (!user?.password || !ok) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const token = await signAppToken(user.id, user.email ?? undefined, appTokenSecret()!);
  return NextResponse.json(
    { token, email: user.email },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
