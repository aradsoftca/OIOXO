import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { makeChallenge, verifySolution, issueToken, fingerprint, type Solution } from '@/lib/pow';

// Node runtime: uses node:crypto. Never cached — every challenge is fresh.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  const h = req.headers;
  return h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

// Same fingerprint the middleware recomputes when verifying the token.
function clientFp(req: NextRequest): string {
  return fingerprint(clientIp(req), req.headers.get('user-agent') || '');
}

// GET /api/pow → a fresh challenge to solve.
export function GET(req: NextRequest) {
  return NextResponse.json(makeChallenge(clientIp(req)), { headers: { 'cache-control': 'no-store' } });
}

// POST /api/pow → verify a solved challenge, return a short-lived access token.
export async function POST(req: NextRequest) {
  let body: Partial<Solution>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  const sol: Solution = {
    salt: String(body.salt ?? ''),
    ts: Number(body.ts),
    difficulty: Number(body.difficulty),
    sig: String(body.sig ?? ''),
    nonce: String(body.nonce ?? ''),
  };
  if (!verifySolution(sol)) {
    return NextResponse.json({ error: 'Invalid or expired proof-of-work.' }, { status: 400 });
  }
  const { token, exp } = issueToken(clientFp(req));
  return NextResponse.json({ token, exp }, { headers: { 'cache-control': 'no-store' } });
}
