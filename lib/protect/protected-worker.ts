/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * Load an ENCRYPTED tool engine worker — the same "permission as a key" lock the
 * oioxo AI uses (lib/oioxo/unlock.ts), applied to Xonvert's heavy compute workers
 * (image / codec / audio / cad / model3d). Shared by BOTH brands.
 *
 * The worker bundle ships AES-256-GCM encrypted at /protected/{assetId}.worker.js.enc
 * (emitted by scripts/encrypt-workers.mjs). To run it the device completes a fresh
 * ECDHE unlock handshake with /api/tool-key, which only plays along for a request
 * coming from OUR origin (the browser stamps the Origin and a copied site can't
 * forge it) carrying a live, server-signed, device-bound entitlement. No key → the
 * bytes are inert → a cloned site does nothing. The key is wrapped per-session and
 * never crosses the wire reusably; it rotates per release, so a memory-dumped key
 * dies on the next deploy.
 *
 * Honest ceiling (same as the AI gate): the worker decrypts in the tab to run, so a
 * determined paid session can dump it once, and a server-side proxy can relay the
 * key. This is not DRM — it turns a 10-minute `wget` clone into an ongoing
 * reverse-engineering war, and gives us a rate-limitable, per-account chokepoint.
 *
 * Once unlocked, the decrypted bundle is cached as a Blob URL for the page session
 * (and the .enc is HTTP-cached), so repeat use is instant and works offline within
 * the entitlement grace window. Per-action DAILY LIMITS are enforced separately by
 * the usage gate before each gated action — this layer protects the CODE.
 */

import { deviceId } from '@/lib/oioxo/entitlement-client';
import { decodeClaims } from '@/lib/oioxo/entitlement';
import { requestUnlock } from '@/lib/oioxo/unlock';

/**
 * SECOND wall — periodic re-validation after the initial handshake.
 *
 * Without this, a paid session that decrypted the workers held usable Blob URLs
 * for the whole tab lifetime — a multi-hour scraping window. With it, network
 * egress to /api/unlock-heartbeat is a continuous requirement; any
 * server-side revocation (ban / refund / plan change) takes effect on the next
 * beat (≤5 min). Each MISS counts toward a tolerance budget — three in a row
 * and we wipe the Blob URL cache + force a full re-handshake. A clone on the
 * wrong origin can NEVER pass the heartbeat (Origin gate) so its workers
 * self-revoke within minutes of any usage.
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const HEARTBEAT_FAIL_BUDGET = 3;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatFails = 0;
let currentEntitlement: string | null = null;
let currentDevice: string | null = null;

function revokeAllBlobUrls() {
  for (const url of blobUrls.values()) {
    try { URL.revokeObjectURL(url); } catch { /* */ }
  }
  blobUrls.clear();
  // Drop in-flight unlocks too — without this, a revocation that races a
  // first-time load would let the resolving promise re-populate blobUrls
  // with a URL born of the now-revoked entitlement, leaving an unauthorised
  // worker live until the next heartbeat tick.
  blobInflight.clear();
  sessionPro = null;
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  currentEntitlement = null;
  currentDevice = null;
  heartbeatFails = 0;
}

async function beat(): Promise<void> {
  if (!currentEntitlement || !currentDevice) return;
  try {
    const r = await fetch('/api/unlock-heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({ entitlement: currentEntitlement, device: currentDevice }),
    });
    if (r.status === 403) {
      // Server explicitly says no — wipe everything immediately.
      revokeAllBlobUrls();
      return;
    }
    if (!r.ok) {
      heartbeatFails += 1;
      if (heartbeatFails >= HEARTBEAT_FAIL_BUDGET) revokeAllBlobUrls();
      return;
    }
    const j = (await r.json()) as { valid?: boolean };
    if (j.valid) {
      heartbeatFails = 0;
    } else {
      heartbeatFails += 1;
      if (heartbeatFails >= HEARTBEAT_FAIL_BUDGET) revokeAllBlobUrls();
    }
  } catch {
    // Transient network issue — tolerate up to the budget, then wipe.
    heartbeatFails += 1;
    if (heartbeatFails >= HEARTBEAT_FAIL_BUDGET) revokeAllBlobUrls();
  }
}

function startHeartbeat(entitlement: string, device: string) {
  currentEntitlement = entitlement;
  currentDevice = device;
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => { void beat(); }, HEARTBEAT_INTERVAL_MS);
}

/** Asset ids — must match the keys scripts/encrypt-workers.mjs emits. */
export type ProtectedWorkerId = 'image' | 'codec' | 'audio' | 'cad' | 'model3d';

const KEY_ENDPOINT = '/api/tool-key';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const assetUrl = (id: string) => `${BASE}/protected/${id}.worker.js.enc`;

/** Per-session decrypted-bundle cache (assetId → Blob URL). */
const blobUrls = new Map<string, string>();
/** In-flight decryptions (assetId → Promise<url>). Two concurrent loadProtectedWorker
 *  calls for the same asset must share ONE unlock handshake + ONE Blob URL; the old
 *  code raced and leaked a duplicate URL plus burned an extra /api/entitlement call. */
const blobInflight = new Map<string, Promise<string>>();
/** Pro state for this session (from the entitlement), shared across all workers. */
let sessionPro: boolean | null = null;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The HARD unlock: get a device-bound entitlement, then run the ECDHE handshake to
 * recover the content key for this asset. Throws (→ "only runs on the official
 * site") on any denial; there is intentionally no soft path.
 */
async function recoverKey(assetId: string): Promise<{ key: Uint8Array; pro: boolean }> {
  const device = deviceId();
  const entRes = await fetch('/api/entitlement', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device }),
  });
  if (!entRes.ok) throw new Error('This tool only runs on the official site.');
  const { entitlement, tier } = (await entRes.json()) as { entitlement?: string; tier?: string };
  const claims = entitlement ? decodeClaims(entitlement) : null;
  if (!entitlement || !claims) throw new Error('Could not establish a session.');
  const key = await requestUnlock(KEY_ENDPOINT, { entitlement, sub: claims.sub, device, assetId });
  // Start (or refresh) the periodic re-validation. Any server-side revocation
  // takes effect on the next heartbeat (≤5 min) and wipes the Blob cache.
  startHeartbeat(entitlement, device);
  // pro/team → no brand watermark; the worker reads this via the __wmInit message.
  return { key, pro: !!tier && tier !== 'free' };
}

async function decryptBundle(assetId: string, key: Uint8Array): Promise<string> {
  // Import as a NON-extractable CryptoKey so the raw key bytes can't be read
  // back out via exportKey('raw', ...) by hostile code — the bytes live in
  // the WebCrypto sandbox, not the JS heap, from this point on.
  const ck = await crypto.subtle.importKey('raw', key as unknown as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  // Overwrite the input key bytes immediately — the CryptoKey is the only
  // copy we keep alive (and it's non-extractable).
  key.fill(0);
  const open = async (cache: RequestCache) => {
    const enc = new Uint8Array(await (await fetch(assetUrl(assetId), { cache })).arrayBuffer());
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: enc.slice(0, 12) as unknown as BufferSource }, ck, enc.slice(12) as unknown as BufferSource);
  };
  // A deploy re-encrypts every bundle with a new key, so a cached .enc from the
  // previous build no longer decrypts (OperationError). Refetch from the network once.
  let plain: ArrayBuffer;
  try { plain = await open('force-cache'); } catch { plain = await open('reload'); }
  // A blob: worker has no usable import.meta.url, so jsquash's
  // `new URL("x.wasm", import.meta.url)` would throw. encrypt-workers.mjs maps
  // import.meta.url → globalThis.__XW_BASE__; set it here to the real same-origin
  // dir where copy-jsquash put the wasm + MT .worker.mjs (trailing slash matters).
  const base = `${location.origin}${BASE}/jsquash/`;
  const banner = `globalThis.__XW_BASE__=${JSON.stringify(base)};\n`;
  return URL.createObjectURL(new Blob([banner, plain], { type: 'text/javascript' }));
}

/**
 * Unlock + instantiate a protected engine worker. Drop-in for
 * `new Worker(new URL('./x.worker.ts', import.meta.url))` — the only difference is
 * it's async (the unlock handshake) and returns a classic Worker built from the
 * decrypted bundle. Throws if the gate denies (offline first-run, cross-origin
 * clone, no/invalid session) — the caller surfaces a clear failure, never a tool
 * that silently runs unlicensed.
 */
export async function loadProtectedWorker(assetId: ProtectedWorkerId): Promise<Worker> {
  let url = blobUrls.get(assetId);
  if (!url) {
    let pending = blobInflight.get(assetId);
    if (!pending) {
      pending = (async () => {
        const { key, pro } = await recoverKey(assetId);
        sessionPro = pro;
        const newUrl = await decryptBundle(assetId, key);
        // If a heartbeat revocation fired while we were unlocking, the
        // entry has been cleared. Don't restore an unauthorised URL —
        // throw so callers surface the same "session ended" error they'd
        // get on a fresh attempt.
        if (!blobInflight.has(assetId)) {
          try { URL.revokeObjectURL(newUrl); } catch { /* */ }
          throw new Error('This tool only runs on the official site.');
        }
        blobUrls.set(assetId, newUrl);
        return newUrl;
      })();
      // On failure, drop the in-flight promise so the next call retries the
      // handshake rather than re-handing the same rejection forever.
      pending.catch(() => { blobInflight.delete(assetId); });
      // On success, the resolved URL is in blobUrls; drop the in-flight ref
      // so the map doesn't grow without bound across the session.
      pending.then(() => { blobInflight.delete(assetId); });
      blobInflight.set(assetId, pending);
    }
    url = await pending;
  }
  const w = new Worker(url);
  // Tell the worker whether to brand its output (free) or not (Pro/Team). The
  // decision + the stamping both live inside the encrypted worker, so it can't be
  // removed with a client-side toggle. Posted first → arrives before any job.
  w.postMessage({ __wmInit: true, pro: sessionPro === true });
  return w;
}
