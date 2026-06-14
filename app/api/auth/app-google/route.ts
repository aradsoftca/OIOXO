import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { preCheckRequest } from '@/lib/oioxo/gate';
import { signAppToken, appTokenSecret } from '@/lib/oioxo/app-token';
import { appCorsHeaders, appCorsPreflight } from '@/lib/oioxo/app-cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return appCorsPreflight(req);
}

/**
 * Google sign-in for the native Xtudio apps (Capacitor). The app performs the
 * native Google sign-in and POSTs the resulting Google ID token here. We verify
 * the token against Google's tokeninfo endpoint, confirm it was minted for OUR
 * OAuth client, find-or-create the matching user by email (mirroring the web's
 * GoogleProvider + allowDangerousEmailAccountLinking), and return the SAME signed
 * app bearer token /api/auth/app-login returns. The bearer is NOT the Pro gate —
 * it only lets the app request a fresh, device-bound entitlement re-derived from
 * the live subscription. So a Google-only account (no password) can now use the
 * apps, and a user who is Pro on the web is Pro in the apps automatically.
 */

interface GoogleTokenInfo {
  aud?: string;          // the OAuth client id the token was minted for
  sub?: string;          // stable Google user id
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string;          // unix seconds
  error_description?: string;
}

export async function POST(req: Request) {
  const pre = preCheckRequest(req, { skipBrowserCheck: true });
  if (pre) return pre;

  if (!appTokenSecret()) {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }
  const cors = appCorsHeaders(req);

  let body: { idToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400, headers: cors }); }
  const idToken = (body.idToken || '').trim();
  if (!idToken) {
    return NextResponse.json({ error: 'idToken required' }, { status: 400, headers: cors });
  }

  // Verify the Google ID token. Google's tokeninfo endpoint validates the
  // signature + expiry for us; we additionally check the audience is one of our
  // OAuth clients (web client and/or the native Android/iOS client ids).
  let info: GoogleTokenInfo;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { cache: 'no-store' });
    info = (await r.json()) as GoogleTokenInfo;
    if (!r.ok || info.error_description) {
      return NextResponse.json({ error: 'Invalid Google token.' }, { status: 401, headers: cors });
    }
  } catch {
    return NextResponse.json({ error: 'Could not verify Google token.' }, { status: 502, headers: cors });
  }

  // The token must be minted for one of our OAuth clients. Accept the web client
  // (GOOGLE_CLIENT_ID) plus optional native client ids set via env.
  const allowedAud = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter(Boolean) as string[];
  if (!info.aud || !allowedAud.includes(info.aud)) {
    return NextResponse.json({ error: 'Token audience mismatch.' }, { status: 401, headers: cors });
  }

  const emailVerified = info.email_verified === true || info.email_verified === 'true';
  const email = (info.email || '').trim().toLowerCase();
  if (!email || !emailVerified) {
    return NextResponse.json({ error: 'A verified Google email is required.' }, { status: 401, headers: cors });
  }

  // Find or create the user by email — same linking behaviour as the web
  // GoogleProvider (allowDangerousEmailAccountLinking). A pre-existing email/
  // password user (or a migrated Google user) is reused; new Google users start
  // on the FREE plan.
  let user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: info.name || null,
        image: info.picture || null,
        emailVerified: new Date(),
      },
      select: { id: true, email: true },
    });
  }

  const token = await signAppToken(user.id, user.email ?? undefined, appTokenSecret()!);
  return NextResponse.json(
    { token, email: user.email },
    { headers: { 'Cache-Control': 'no-store', ...cors } },
  );
}
