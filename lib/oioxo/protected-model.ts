/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo — load an ENCRYPTED on-device model ("permission as a key", per
 * project_anti_copy). The weights ship AES-256-GCM encrypted on any CDN (even HF
 * — it can't read them); the decryption key comes per-session from our origin
 * (/api/code-key). No key → the bytes are inert → the model is useless without us.
 *
 * Only the WEIGHTS are encrypted (the secret); config + tokenizer stay public.
 * We fetch the .enc, decrypt in-memory, and PRIME the transformers.js cache under
 * the plaintext URL it will request — so the library finds the decrypted bytes
 * (cache hit) and never fetches anything readable off the wire.
 *
 * Honest ceiling: to run, the weights are decrypted in the tab, so a determined
 * paid session can dump them once. This stops casual copying, ties leaks to an
 * account (per-user keys, later), and is a rate-limitable chokepoint — not DRM.
 */

import { requestUnlock } from './unlock';
import { decodeClaims, newDeviceId } from './entitlement';
import { keyToB64 } from './protect';

const CACHE = 'transformers-cache'; // @xenova/transformers default browser cache
const DEVICE_LS = 'oioxo-device-id';

/** A stable per-device id (persisted) — binds the entitlement so an unlocked
 *  session can't be shared to another machine. */
function deviceId(): string {
  if (typeof localStorage === 'undefined') return 'nodevice';
  let d = localStorage.getItem(DEVICE_LS);
  if (!d) { d = newDeviceId(); localStorage.setItem(DEVICE_LS, d); }
  return d;
}

/**
 * The HARD unlock: get a device-bound entitlement, then run the ECDHE handshake to
 * recover the content key — the key never crosses the wire in reusable form, and a
 * session without a valid entitlement gets nothing. Returns the key as base64 (the
 * format loadProtectedModel decrypts with). Throws (→ "needs oioxo") if denied.
 */
async function unlockKey(assetId: string, keyEndpoint: string): Promise<{ key: string; pro: boolean }> {
  const device = deviceId();
  const entRes = await fetch('/api/entitlement', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device }) });
  if (!entRes.ok) throw new Error('This model only runs inside oioxo.');
  const { entitlement, tier } = (await entRes.json()) as { entitlement: string; tier?: string };
  const claims = decodeClaims(entitlement);
  if (!entitlement || !claims) throw new Error('Could not establish a session.');
  const keyBytes = await requestUnlock(keyEndpoint, { entitlement, sub: claims.sub, device, assetId });
  return { key: keyToB64(keyBytes), pro: tier !== 'free' && !!tier };
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ProtectedModel {
  /** transformers.js model id + host (config/tokenizer load normally from here). */
  modelId: string;
  host: string;
  /** Whether the session is Pro (caller decides run-metering). */
  pro: boolean;
}

/**
 * Fetch the key (gated by our origin), fetch the encrypted weights, decrypt, and
 * prime the cache so a following transformers.js load uses them. Throws if the
 * key is denied/unconfigured (→ caller shows "needs oioxo" / paywall, no model).
 *
 * Encrypted blob format: [12-byte IV][ciphertext+16-byte GCM tag], at
 * `{host}/{modelId}/onnx/model_quantized.onnx.enc`. The cache is primed under the
 * plaintext URL `{host}/{modelId}/onnx/model_quantized.onnx`.
 *
 * Hosting is decoupled from identity: pass `onnxUrl` to fetch the .enc from any
 * CDN (we host on Hugging Face — it stores only ciphertext it can't read), and
 * `assetId` to keep the ENTITLEMENT key-derivation stable regardless of where the
 * bytes live (the AES key is derived from assetId+release, so it must match what
 * encrypt_model used — NOT the HF repo path). The cache is still primed under the
 * exact URL transformers.js will request, so the library finds the plaintext.
 */
export async function loadProtectedModel(opts: { modelId: string; host: string; keyEndpoint?: string; assetId?: string; onnxUrl?: string }): Promise<ProtectedModel> {
  const host = opts.host.replace(/\/$/, '');

  // HARD gate (strict — no fallback): recover the key ONLY via the device-bound
  // ECDHE handshake. No live entitlement / wrong device / expired → it throws and
  // the model stays encrypted noise. There is intentionally no soft path.
  // `keyEndpoint` selects the asset family's handshake (/api/code-key for the
  // coder, /api/ai-key for the main-AI models). `assetId` (defaults to modelId)
  // is what the key is bound to — keep it stable when bytes move to a CDN.
  const assetId = opts.assetId ?? opts.modelId;
  const { key, pro } = await unlockKey(assetId, opts.keyEndpoint ?? '/api/code-key');

  const onnxUrl = opts.onnxUrl ?? `${host}/${opts.modelId}/onnx/model_quantized.onnx`;
  // Already primed this session? skip the fetch+decrypt.
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE) : null;
  if (cache && (await cache.match(onnxUrl))) return { modelId: opts.modelId, host, pro: !!pro };

  const encBuf = new Uint8Array(await (await fetch(onnxUrl + '.enc')).arrayBuffer());
  const iv = encBuf.slice(0, 12);
  const ct = encBuf.slice(12);
  const ck = await crypto.subtle.importKey('raw', b64ToBytes(key) as unknown as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, ck, ct as unknown as BufferSource);

  if (cache) {
    await cache.put(onnxUrl, new Response(plain, {
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(plain.byteLength) },
    }));
  }
  return { modelId: opts.modelId, host, pro: !!pro };
}
