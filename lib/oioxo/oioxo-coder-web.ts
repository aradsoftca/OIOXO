/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OIOXO coder — ONLINE runtime (browser). Runs our protected GGUF coder fully in the tab
 * via wllama (llama.cpp WASM), reusing the SAME assets + unlock as the desktop app:
 *
 *   unlock (ECDHE /api/code-key, server-gated) → fetch + AES-256-GCM decrypt chunks
 *   (WebCrypto) → assemble GGUF in memory → wllama.loadModel → a codeloop GenerateFn.
 *
 * Identity = OIOXO (fine-tuned + the system preamble). The key never persists; the bytes
 * live in memory for the session. A cracked page with no valid session gets no key → the
 * chunks are inert (matches MODELS_AND_SECRET.md / unlock.ts "permission IS the key").
 *
 * Browser-memory reality: q4 weights must fit a tab — Basic (~0.7 GB) and Moderate (~2 GB)
 * are comfortable; Prime (~4.7 GB) is borderline; Ultra (~9 GB) is desktop-only. The picker
 * should offer only tiers that fit (recommendByMemory below).
 */
import type { Edit, GenContext, GenerateFn } from './codeloop';
import { buildPrompt, parseEdits } from './codegen';
import { retrieveContext } from './retrieve';
import { requestUnlock } from './unlock';
import { decodeClaims, newDeviceId } from './entitlement';
import { CoderManifest, isCoderManifest, resolveChunkUrl, manifestUrlFor, OIOXO_WEB_CODERS } from './coder-asset';
import type { AssetsPathConfig } from '@wllama/wllama'; // type-only (erased) — runtime import stays lazy

const OIOXO_SYSTEM =
  'You are OIOXO Coder, the on-device coding assistant built by OIOXO. If asked what model ' +
  'you are or who made you, say only that you are OIOXO Coder by OIOXO. ' +
  'Make the SMALLEST change that satisfies the task or fixes the error. Output ONLY the files ' +
  'you create or change — each as a fenced code block whose info line is the file PATH, e.g.\n' +
  '```src/add.js\n<contents>\n```\nNo prose.';

const DEVICE_LS = 'oioxo-device-id';

function deviceId(): string {
  if (typeof localStorage === 'undefined') return 'nodevice';
  let d = localStorage.getItem(DEVICE_LS);
  if (!d) { d = newDeviceId(); localStorage.setItem(DEVICE_LS, d); }
  return d;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/** Server-gated content key for THIS session (no key → throws; no fallback). */
async function unlockKey(assetId: string): Promise<Uint8Array> {
  const device = deviceId();
  const entRes = await fetch('/api/entitlement', {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device }),
  });
  if (!entRes.ok) throw new Error('This model only runs inside OIOXO (sign in / reconnect).');
  const { entitlement } = (await entRes.json()) as { entitlement?: string };
  const claims = entitlement ? decodeClaims(entitlement) : null;
  if (!entitlement || !claims) throw new Error('Could not establish a session.');
  return requestUnlock('/api/code-key', { entitlement, sub: claims.sub, device, assetId });
}

/** Fetch every chunk, AES-256-GCM decrypt (ciphertext ‖ tag), assemble the GGUF, verify. */
async function fetchDecryptAssemble(
  assetId: string, key: Uint8Array, onProgress?: (ratio: number) => void,
): Promise<{ bytes: Uint8Array; manifest: CoderManifest }> {
  const manifestUrl = manifestUrlFor(assetId);
  const manifest = await (await fetch(manifestUrl)).json();
  if (!isCoderManifest(manifest)) throw new Error('OIOXO manifest is malformed.');

  const ck = await crypto.subtle.importKey('raw', key as any, { name: 'AES-GCM' }, false, ['decrypt']);
  const out = new Uint8Array(manifest.totalBytes);
  let offset = 0;
  const chunks = [...manifest.chunks].sort((a, b) => a.index - b.index);
  for (const chunk of chunks) {
    const enc = new Uint8Array(await (await fetch(resolveChunkUrl(manifestUrl, chunk.url))).arrayBuffer());
    const iv = b64ToBytes(chunk.iv);
    // WebCrypto AES-GCM expects ciphertext ‖ 16-byte tag (exactly our chunk layout).
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, ck, enc as any));
    out.set(plain, offset);
    offset += plain.byteLength;
    onProgress?.(offset / manifest.totalBytes);
  }
  if (offset !== manifest.totalBytes) throw new Error('OIOXO assembled size mismatch.');
  const digest = toHex(await crypto.subtle.digest('SHA-256', out as any));
  if (digest !== manifest.sha256) throw new Error('OIOXO coder integrity check failed.');
  return { bytes: out, manifest };
}

export interface OioxoWebCoder {
  readonly engineTag: string;
  readonly wllama: any; // Wllama instance
}

const _cache = new Map<string, Promise<OioxoWebCoder>>();

/** Default wllama WASM paths — single-thread, served from `public/wllama/` (copied from
 *  the @wllama/wllama package). Single-thread runs everywhere; multi-thread is faster but
 *  needs COOP/COEP cross-origin isolation headers (add later if desired). */
export const DEFAULT_WLLAMA_WASM: AssetsPathConfig = {
  default: '/wllama/wllama.wasm',
  'single-thread/wllama.wasm': '/wllama/wllama.wasm',
};

export interface LoadOpts {
  /** wllama WASM asset paths. Defaults to DEFAULT_WLLAMA_WASM (served from /wllama). */
  wasmPaths?: AssetsPathConfig;
  onProgress?: (ratio: number) => void;
  nContext?: number;
}

/** Unlock → decrypt → load into wllama (cached per asset for the session). */
export async function loadOioxoCoder(assetId: string, opts: LoadOpts = {}): Promise<OioxoWebCoder> {
  const hit = _cache.get(assetId);
  if (hit) return hit;
  const p = (async () => {
    const key = await unlockKey(assetId);                  // server must permit
    const { bytes, manifest } = await fetchDecryptAssemble(assetId, key, opts.onProgress);
    const { Wllama } = await import('@wllama/wllama');      // lazy: heavy WASM
    const wllama = new Wllama((opts.wasmPaths ?? DEFAULT_WLLAMA_WASM) as never);
    await wllama.loadModel([new Blob([bytes as unknown as BlobPart])], { n_ctx: opts.nContext ?? 8192 });
    return { engineTag: manifest.engineTag, wllama };
  })();
  _cache.set(assetId, p);
  p.catch(() => _cache.delete(assetId));                   // don't cache failures
  return p;
}

/** Drop a loaded coder (e.g. sign-out / switch model) — frees memory + the plaintext. */
export async function unloadOioxoCoder(assetId: string): Promise<void> {
  const p = _cache.get(assetId);
  _cache.delete(assetId);
  try { (await p)?.wllama?.exit?.(); } catch { /* ignore */ }
}

/**
 * A codeloop GenerateFn backed by the in-browser OIOXO coder — same grounded prompt +
 * edit-parsing as every other writer, so the execute→repair loop is identical. Uses
 * wllama v3's OpenAI-compatible chat API (it applies the GGUF's own chat template).
 */
export function makeOioxoWebGenerate(
  coder: OioxoWebCoder,
  opts: { getExtApis?: () => string; temperature?: number; maxTokens?: number } = {},
): GenerateFn {
  return async (ctx: GenContext): Promise<Edit[]> => {
    const retrieved = await retrieveContext(ctx.task, ctx.files).catch(() => undefined);
    const res: any = await coder.wllama.createChatCompletion({
      messages: [
        { role: 'system', content: OIOXO_SYSTEM },
        { role: 'user', content: buildPrompt(ctx, retrieved, opts.getExtApis?.()) },
      ],
      temperature: opts.temperature ?? (ctx.attempt === 0 ? 0.3 : 0.2),
      max_tokens: opts.maxTokens ?? 1024,
    });
    const reply: string = res?.choices?.[0]?.message?.content ?? '';
    return parseEdits(reply, ctx.files);
  };
}

/** Largest tier that fits available memory (navigator.deviceMemory, GB). Ultra is desktop-only. */
export function recommendByMemory(memGB = (navigator as any)?.deviceMemory ?? 4): string {
  const budget = memGB * 1024 * 0.45; // ~45% of RAM as a safe working budget (MB)
  const fits = OIOXO_WEB_CODERS.filter(c => c.id !== 'oioxo-ultra' && c.approxMB <= budget);
  return (fits[fits.length - 1] ?? OIOXO_WEB_CODERS[0]).id;
}
