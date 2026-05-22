/**
 * Proof-of-Work client.
 *
 * `powFetch` is a drop-in for `fetch` on our protected API routes: it attaches a
 * proof-of-work access token, and if the server says one is required (401) it
 * transparently solves a fresh challenge and retries once. The token is solved
 * ONCE per ~30 min and cached, so real users pay the cost a single time.
 *
 * The hash must match the server's SHA-256 byte-for-byte — this implementation
 * is validated against Node's crypto across block-boundary and unicode inputs.
 */

const POW_HEADER = 'x-pow-token';
const STORE_KEY = 'xonvert.pow';
const SOLVE_CAP = 1 << 25; // safety bound on the solve loop

let memToken: { token: string; exp: number } | null = null;

// --- synchronous SHA-256 (UTF-8 string -> hex) -----------------------------
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const w = new Uint32Array(64);

function sha256bytes(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  const l = bytes.length;
  const total = ((l + 8) >> 6) + 1 << 6; // round up to next 64 after l+1+8
  const m = new Uint8Array(total);
  m.set(bytes);
  m[l] = 0x80;
  const dv = new DataView(m.buffer);
  const bitLen = l * 8;
  dv.setUint32(total - 4, bitLen >>> 0);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) { out[i * 4] = hs[i] >>> 24; out[i * 4 + 1] = (hs[i] >>> 16) & 255; out[i * 4 + 2] = (hs[i] >>> 8) & 255; out[i * 4 + 3] = hs[i] & 255; }
  return out;
}

function leadingZeroBits(buf: Uint8Array): number {
  let bits = 0;
  for (const b of buf) { if (b === 0) { bits += 8; continue; } bits += Math.clz32(b) - 24; break; }
  return bits;
}

// --- token cache -----------------------------------------------------------
function loadToken(): { token: string; exp: number } | null {
  if (memToken && memToken.exp > Date.now() + 5_000) return memToken;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const t = JSON.parse(raw); if (t && t.exp > Date.now() + 5_000) { memToken = t; return t; } }
  } catch { /* no storage */ }
  return null;
}
function saveToken(t: { token: string; exp: number }) {
  memToken = t;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

interface ChallengeResp { salt: string; ts: number; difficulty: number; sig: string }

async function solveAndGetToken(base: string): Promise<string | null> {
  const cr = await fetch(`${base}/api/pow`, { cache: 'no-store' });
  if (!cr.ok) return null;
  const ch = (await cr.json()) as ChallengeResp;
  const prefix = `${ch.salt}:${ch.ts}:${ch.difficulty}:`;
  let nonce = 0;
  for (; nonce < SOLVE_CAP; nonce++) {
    if (leadingZeroBits(sha256bytes(prefix + nonce)) >= ch.difficulty) break;
  }
  if (nonce >= SOLVE_CAP) return null;
  const vr = await fetch(`${base}/api/pow`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...ch, nonce: String(nonce) }),
  });
  if (!vr.ok) return null;
  const tok = (await vr.json()) as { token: string; exp: number };
  saveToken(tok);
  return tok.token;
}

let inflight: Promise<string | null> | null = null;

/** Get a valid PoW token, solving a challenge if needed (deduped). */
export async function getPowToken(): Promise<string | null> {
  const cached = loadToken();
  if (cached) return cached.token;
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '') as string;
  if (!inflight) inflight = solveAndGetToken(base).finally(() => { inflight = null; });
  return inflight;
}

/**
 * Drop-in `fetch` for protected API routes: attaches the PoW token and, on a
 * 401 "proof required", solves a fresh one and retries exactly once.
 */
export async function powFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const withToken = async (): Promise<Response> => {
    const token = await getPowToken();
    const headers = new Headers(init.headers);
    if (token) headers.set(POW_HEADER, token);
    return fetch(input, { ...init, headers });
  };
  let res = await withToken();
  if (res.status === 401) {
    memToken = null;
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    res = await withToken();
  }
  return res;
}
