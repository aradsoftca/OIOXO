import { NextResponse } from 'next/server';
import { preCheckRequest } from '@/lib/oioxo/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the decryption key for the on-device WASM brain core — the "permission"
 * that turns a copied client into useless bytes. Gated by ORIGIN, not login, so
 * the open/offline experience is unchanged: a real session of our app (same
 * origin) gets the key; a copied client hosted on another domain sends a
 * cross-origin Origin the browser stamps and can't forge, so it's rejected.
 *
 * (A server-side proxy can still relay requests — that's the inherent ceiling of
 * any client gate; this raises the cost + gives us a rate-limitable chokepoint.
 * The durable moat remains the fine-tuned model whose value can't be copied.)
 */

export async function GET(req: Request) {
  // Shared rate-limit + UA + origin/referer pre-check (lib/oioxo/gate). Note
  // this now REQUIRES one of Origin/Referer — same-origin browser GETs always
  // send Referer for navigation/fetch within the app, so legitimate callers
  // still pass; previous "no Origin → pass" behavior was the gap.
  const pre = preCheckRequest(req);
  if (pre) return pre;

  const key = process.env.BRAIN_WASM_KEY;
  if (!key) {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }
  return NextResponse.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
}
