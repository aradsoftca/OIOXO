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

const CACHE = 'transformers-cache'; // @xenova/transformers default browser cache

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
 */
export async function loadProtectedModel(opts: { modelId: string; host: string; keyUrl?: string }): Promise<ProtectedModel> {
  const host = opts.host.replace(/\/$/, '');
  const keyUrl = opts.keyUrl ?? '/api/code-key';

  const keyRes = await fetch(keyUrl, { cache: 'no-store' });
  if (keyRes.status === 403) throw new Error('This model only runs inside oioxo.');
  if (!keyRes.ok) throw new Error('The model key is unavailable right now.');
  const { key, pro } = (await keyRes.json()) as { key: string; pro: boolean };

  const onnxUrl = `${host}/${opts.modelId}/onnx/model_quantized.onnx`;
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
