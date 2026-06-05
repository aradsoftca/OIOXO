/**
 * OIOXO protected coder — encrypted-asset manifest format (browser side).
 * Mirrors oioxo-ide/common/oioxo/coder-asset.ts (CODER_ASSET_VERSION) so the SAME chunks
 * minted by scripts/mint_coder_asset.py load both in the desktop app and here online.
 *
 * A model = a plaintext manifest + N AES-256-GCM chunks (ciphertext ‖ 16-byte tag). The
 * manifest carries no secret; the chunks are inert without the per-release content key the
 * server hands a valid session via the ECDHE unlock handshake (unlock.ts / /api/code-key).
 */
export const CODER_ASSET_VERSION = 1;

export interface CoderChunk {
  readonly index: number;
  readonly url: string;     // relative to the manifest's directory
  readonly iv: string;      // base64 96-bit AES-GCM IV (unique per chunk)
  readonly encBytes: number;
  readonly rawBytes: number;
}

export interface CoderManifest {
  readonly version: number;
  readonly modelId: string;
  readonly engineTag: string;
  readonly release: string;
  readonly fileName: string;
  readonly totalBytes: number;
  readonly sha256: string;  // hex, of the assembled plaintext GGUF
  readonly chunks: readonly CoderChunk[];
}

export function isCoderManifest(x: unknown): x is CoderManifest {
  const m = x as CoderManifest;
  return !!m && typeof m.modelId === 'string' && typeof m.engineTag === 'string'
    && typeof m.totalBytes === 'number' && typeof m.sha256 === 'string'
    && Array.isArray(m.chunks) && m.chunks.every(c => typeof c?.url === 'string' && typeof c?.iv === 'string');
}

export function resolveChunkUrl(manifestUrl: string, chunkUrl: string): string {
  if (/^https?:\/\//i.test(chunkUrl)) return chunkUrl;
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  return base + chunkUrl.replace(/^\.?\//, '');
}

/** The four hardware tiers (must match oioxo-ide catalog ids + the HF repos). */
export const OIOXO_WEB_CODERS = [
  { id: 'oioxo-basic', name: 'OIOXO Basic', approxMB: 700 },
  { id: 'oioxo-moderate', name: 'OIOXO Moderate', approxMB: 2100 },
  { id: 'oioxo-prime', name: 'OIOXO Prime', approxMB: 4700 },
  { id: 'oioxo-ultra', name: 'OIOXO Ultra', approxMB: 9000 },
] as const;

const ASSET_HOST = (globalThis as { OIOXO_ASSET_HOST?: string }).OIOXO_ASSET_HOST || 'https://huggingface.co/payam1394';
export const manifestUrlFor = (id: string): string => `${ASSET_HOST}/${id}/resolve/main/manifest.json`;
