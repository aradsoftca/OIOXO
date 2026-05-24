/**
 * Xonvert AI — WASM brain-core bridge.
 *
 * Loads the Rust→WASM brain core ONCE (browser only) and exposes its functions.
 * Every caller falls back to the identical TS implementation when the WASM isn't
 * loaded yet or fails to load — so the app behaves the same regardless, and the
 * WASM can never break it. The wasm bytes are embedded (base64) to avoid
 * basePath / public-asset / webpack-wasm headaches.
 */
import { WASM_ENC } from './wasm/wasm-bytes';

function b64ToBuf(s: string): ArrayBuffer {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a.buffer;
}

// Fetch the decryption key from the gated server route. Not persisted — fetched
// per session when online; offline/denied → null → caller uses the TS fallback,
// so the app still works (just not via WASM). A copied client on another domain
// is rejected by the route's origin check → no key → encrypted brain is useless.
async function fetchBrainKey(): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch('/api/brain-key', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return null;
    const j = (await r.json()) as { key?: string };
    return typeof j.key === 'string' && j.key ? b64ToBuf(j.key) : null;
  } catch {
    return null;
  }
}

async function decryptWasm(key: ArrayBuffer): Promise<ArrayBuffer> {
  const ck = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(WASM_ENC.iv) }, ck, b64ToBuf(WASM_ENC.enc));
}

export interface BrainWasm {
  mime_family(s: string): string;
  mime_format(s: string): string;
  word_family(s: string): string;
  word_to_format(s: string): string;
  guardrail_tool(message: string, candsJson: string, inputFam: string, conf: string): string;
  chain_connects(toolsJson: string, candsJson: string): boolean;
  parse_decision(raw: string, candsJson: string): string;
  brain_core_version(): string;
}

let _w: BrainWasm | null = null;
let _p: Promise<boolean> | null = null;

/** The loaded WASM core, or null if not ready (caller uses TS fallback). */
export function getBrainWasm(): BrainWasm | null {
  return _w;
}

/** Load + init the WASM brain core once. Returns false on any failure. */
export function initBrainWasm(): Promise<boolean> {
  if (_w) return Promise.resolve(true);
  if (!_p) {
    _p = (async () => {
      try {
        if (typeof window === 'undefined' || typeof WebAssembly === 'undefined' || !crypto?.subtle) return false;
        const key = await fetchBrainKey();
        if (!key) return false; // no permission/offline → TS fallback keeps the app working
        const bytes = await decryptWasm(key);
        const mod = (await import('./wasm/pkg/brain_core.js')) as unknown as BrainWasm & { default: (b: ArrayBuffer) => Promise<unknown> };
        await mod.default(bytes);
        _w = mod;
        return true;
      } catch {
        _w = null;
        return false;
      }
    })();
  }
  return _p;
}
