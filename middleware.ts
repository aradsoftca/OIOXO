import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { take, type Bucket as RlBucket } from '@/lib/rate-limit';

/**
 * Origin lock for our own API.
 *
 * Everything under /api exists to serve our own pages (the AI assistant's
 * server skills, network/SEO lookups, usage metering, P2P signaling, …). If
 * someone clones or iframes the site on another domain and points it back at
 * our live endpoints, the browser sends an Origin/Referer for THEIR site —
 * we reject those, so the copy gets a dead AI. The public model weights still
 * load (they're served by a public CDN, not us), but the parts that are
 * actually ours stop working off-site.
 *
 * Note: this is a deterrent against casual cloning/hotlinking, not a hard
 * security boundary — anything that runs in the browser can ultimately be
 * inspected. It costs nothing and breaks nothing legitimate.
 */

// Endpoints that MUST stay reachable from outside our origin and are therefore
// exempt: payment webhooks (called by Stripe / the crypto processor) and
// NextAuth callbacks (OAuth providers redirect the browser back to these).
const PUBLIC_API = [
  '/api/stripe/webhook',
  '/api/webhooks/stripe',
  '/api/crypto/webhook',
  '/api/auth',
];

function isPublicApi(path: string): boolean {
  return PUBLIC_API.some((p) => path === p || path.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Per-IP rate limit (abuse / scraping defense).
//
// A generous global ceiling that normal users never hit but a script hammering
// the API does. In-memory (per running instance — fine for our single PM2
// process; resets on deploy). Cloudflare in front is the real volume shield;
// this is the app-level backstop.
//
// Routes that legitimately get many calls are exempt: P2P signaling/TURN
// (Send/Chat/Call poll these constantly) and the webhook/auth endpoints.
// ---------------------------------------------------------------------------
const RL_EXEMPT = ['/api/signal', '/api/turn', ...PUBLIC_API];
const RL_MAX = 240; // requests
const RL_WINDOW_MS = 60_000; // per minute, per IP

const rlHits = new Map<string, RlBucket>();

function clientIp(req: NextRequest): string {
  const h = req.headers;
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimited(ip: string): boolean {
  return !take(rlHits, ip, { max: RL_MAX, windowMs: RL_WINDOW_MS, maxEntries: 10_000 });
}

function isRateLimitExempt(path: string): boolean {
  return RL_EXEMPT.some((p) => path === p || path.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Credentials-login brute-force gate.
//
// `/api/auth/*` is exempted from the global rate limit so OAuth provider
// redirects keep working — but that also exempts the credentials sign-in
// callback, which is the password-brute-force entry point. NextAuth itself
// has no built-in rate limit; `authorize()` happily runs a bcrypt.compare on
// every POST. The dummy-hash trick (lib/auth.ts) closes the timing-enumeration
// channel, but does NOT prevent a botnet from grinding common passwords.
// 10 attempts / 5 min / IP — same window as forgot-password — is generous
// for a forgetful real user, and turns a 4-req/s brute force into 2/min.
const SIGNIN_RL_MAX = 10;
const SIGNIN_RL_WINDOW_MS = 5 * 60_000;
const signinHits = new Map<string, RlBucket>();
function signinRateLimited(ip: string): boolean {
  return !take(signinHits, ip, { max: SIGNIN_RL_MAX, windowMs: SIGNIN_RL_WINDOW_MS, maxEntries: 10_000 });
}

// ---------------------------------------------------------------------------
// Proof-of-Work gate. The endpoints below actually cost us (outbound lookups,
// page fetches, bandwidth), so they require a valid PoW token. The token is an
// HMAC of its expiry — the same secret + format as lib/pow.ts. We re-verify it
// here with Web Crypto so abuse is blocked at the edge before hitting a route.
// `/api/pow` itself is NOT protected — that's where you earn the token.
// ---------------------------------------------------------------------------
const POW_PROTECTED = ['/api/net', '/api/seo', '/api/speedtest', '/api/fx', '/api/gpu', '/api/stock'];
// Hard-fail at boot in production if POW_SECRET isn't provisioned — with a
// hardcoded fallback, the PoW lock becomes trivially bypassable (anyone
// running the open-source code knows the fallback and can mint valid tokens
// for the live deployment). Dev keeps the placeholder for local convenience.
const POW_SECRET = (() => {
  const v = process.env.POW_SECRET;
  if (!v && process.env.NODE_ENV === 'production') {
    throw new Error('POW_SECRET must be set in production — see middleware.ts');
  }
  return v || 'dev-insecure-pow-secret-change-me';
})();
const POW_TOKEN_PREFIX = 'powtok:';

function isPowProtected(path: string): boolean {
  return POW_PROTECTED.some((p) => path === p || path.startsWith(p + '/'));
}

let _powKey: CryptoKey | null = null;
async function powKey(): Promise<CryptoKey> {
  if (_powKey) return _powKey;
  _powKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(POW_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return _powKey;
}

async function hmacHexEdge(data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await powKey(), new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Coarse client fingerprint (IP + UA). Must match lib/pow.ts `fingerprint()`
// byte-for-byte: same IP precedence, same `${ip}|${ua}` input, sha256, 16 hex.
async function clientFingerprint(req: NextRequest): Promise<string> {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${ua}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Constant-time string compare. `===` short-circuits on the first differing
 *  byte, leaking a tiny timing signal that lets an attacker recover the HMAC
 *  byte-by-byte (BREACH-style oracle, slow but real). XOR every byte and
 *  collapse at the end so the work done is independent of where the mismatch
 *  is. Length mismatch is still an early return — the token signature length
 *  is a public constant (HMAC-SHA256 → 64 hex), so no info leaks from that. */
function timingSafeStrEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// (1) Token binding: the token's HMAC covers the fingerprint, so a token lifted
// from our site can't be replayed from a different client.
async function verifyPowToken(token: string | null, fp: string): Promise<boolean> {
  if (!token) return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const exp = Number(token.slice(0, i));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHexEdge(`${POW_TOKEN_PREFIX}${exp}:${fp}`);
  return timingSafeStrEq(expected, token.slice(i + 1));
}

// ---------------------------------------------------------------------------
// (2) Per-token quota + anomaly. Even a client that earned a valid token
// shouldn't be able to *misuse* the costly endpoints. We cap how much each
// token can do — far above any human's use, but well below a script's. Keyed by
// the token signature (unique per ~30-min session). In-memory per instance.
// ---------------------------------------------------------------------------
const TOK_BURST_MAX = 90;          // requests / minute / token
const TOK_BURST_MS = 60_000;
const TOK_HOUR_MAX = 2_000;        // requests / hour / token
const TOK_HOUR_MS = 3_600_000;
const tokQuota = new Map<string, { burst: number; burstReset: number; hour: number; hourReset: number }>();

function tokenQuotaExceeded(token: string): boolean {
  const key = token.slice(token.indexOf('.') + 1); // the signature — unique per session
  const now = Date.now();
  // Same bounded-sweep: under a token-rotating scraper, all entries can be
  // fresh and the expired-sweep frees nothing. Drop oldest half by hourReset
  // when we exceed the cap so the map stays bounded.
  if (tokQuota.size > 20_000) {
    for (const [k, v] of tokQuota) if (now > v.hourReset) tokQuota.delete(k);
    if (tokQuota.size > 20_000) {
      const sorted = [...tokQuota.entries()].sort((a, b) => a[1].hourReset - b[1].hourReset);
      for (let i = 0; i < sorted.length / 2; i++) tokQuota.delete(sorted[i][0]);
    }
  }
  let e = tokQuota.get(key);
  if (!e) { e = { burst: 0, burstReset: now + TOK_BURST_MS, hour: 0, hourReset: now + TOK_HOUR_MS }; tokQuota.set(key, e); }
  if (now > e.burstReset) { e.burst = 0; e.burstReset = now + TOK_BURST_MS; }
  if (now > e.hourReset) { e.hour = 0; e.hourReset = now + TOK_HOUR_MS; }
  e.burst++; e.hour++;
  return e.burst > TOK_BURST_MAX || e.hour > TOK_HOUR_MAX;
}

/**
 * True if the request is same-origin (or we genuinely can't tell). Same-origin
 * GETs and direct navigations often send neither Origin nor Referer — we allow
 * those rather than break legitimate use. A cross-origin browser fetch, by
 * contrast, always carries an Origin, which is exactly the case we block.
 */
function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host');
  if (!host) return true;
  const src = req.headers.get('origin') ?? req.headers.get('referer');
  if (!src) return true;
  try {
    return new URL(src).host === host;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // oioxo.com is the platform: serve the oioxo shell at the root. Host-gated, so
  // it's inert on every other domain (xonvert.com is completely unaffected).
  const host = req.headers.get('host') || '';
  if (host.includes('oioxo.com') && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/oioxo';
    return NextResponse.rewrite(url);
  }

  if (!pathname.startsWith('/api/')) return NextResponse.next();

  // 1) Origin lock — reject cross-origin use of our endpoints.
  if (!isPublicApi(pathname) && !isSameOrigin(req)) {
    return NextResponse.json(
      { error: 'Cross-origin requests are not allowed.' },
      { status: 403 },
    );
  }

  // 2) Rate limit — backstop against scraping / API hammering.
  if (!isRateLimitExempt(pathname) && rateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: 'Too many requests — slow down.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  // 2b) Credentials-login brute-force backstop. NextAuth's authorize() runs
  // bcrypt.compare on every POST; without a focused limit, a botnet can grind
  // password lists at whatever the network sustains. Only POST counts as an
  // attempt (the GET on this URL is the CSRF-token fetch).
  if (req.method === 'POST' && pathname === '/api/auth/callback/credentials') {
    if (signinRateLimited(clientIp(req))) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Please try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }
  }

  // 3) Proof-of-Work — the costly endpoints need a valid, client-bound token,
  //    and even a valid token has a per-session usage quota.
  if (isPowProtected(pathname)) {
    const token = req.headers.get('x-pow-token');
    const fp = await clientFingerprint(req);
    if (!(await verifyPowToken(token, fp))) {
      return NextResponse.json(
        { error: 'Proof-of-work required.', powRequired: true },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (tokenQuotaExceeded(token!)) {
      return NextResponse.json(
        { error: 'Usage limit reached — please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/api/:path*'],
};
