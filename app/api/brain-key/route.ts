import { NextResponse } from 'next/server';

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

// Hosts allowed to receive the key even when an Origin is present.
const ALLOWED_HOSTS = new Set([
  'xonvert.com',
  'www.xonvert.com',
  'new.xonvert.com',
  'oioxo.com',
  'www.oioxo.com',
  'localhost:3000',
  'localhost:3001',
  '127.0.0.1:3001',
]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const reqHost = (req.headers.get('host') || '').toLowerCase();
  const originHost = hostOf(req.headers.get('origin'));

  // Same-origin GETs usually omit Origin → allow. Only reject a PRESENT Origin
  // whose host is neither our request host nor an allowed host (= a cross-site copy).
  if (originHost && originHost !== reqHost && !ALLOWED_HOSTS.has(originHost)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const key = process.env.BRAIN_WASM_KEY;
  if (!key) {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }
  return NextResponse.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
}
