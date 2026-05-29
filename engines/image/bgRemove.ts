/**
 * Background removal — ships a small AI model into the page and isolates the
 * subject. Returns a transparent PNG `Blob` (alpha matte applied).
 *
 * The underlying library handles its own worker + model caching, so we only
 * need a thin wrapper that gives us our progress callback shape.
 */

export type BgRemoveQuality = 'fast' | 'balanced' | 'high';

export interface BgRemoveProgress {
  /** Phase label, e.g. "downloading model", "segmenting". */
  phase: string;
  /** 0..1 within the current phase. */
  ratio: number;
}

export interface BgRemoveOptions {
  /** Output format — default png (with transparency). */
  format?: 'image/png' | 'image/webp';
  /** Model size tradeoff. */
  quality?: BgRemoveQuality;
  /** Progress reporter. */
  onProgress?: (p: BgRemoveProgress) => void;
  /** Per-action permission ticket — engine asserts server-side before work. */
  permission?: import('@/lib/limits/permission').Permission | null;
  toolKey?: string;
  inputHash?: string;
}

const MODEL_KEY: Record<BgRemoveQuality, 'isnet_fp16' | 'isnet_quint8' | 'isnet'> = {
  fast:     'isnet_quint8',
  balanced: 'isnet_fp16',
  high:     'isnet',
};

export async function removeBackground(input: Blob, opts: BgRemoveOptions = {}): Promise<Blob> {
  if (opts.permission?.ticket && opts.toolKey) {
    const { assertPermission } = await import('@/lib/limits/permission');
    await assertPermission(opts.permission, opts.toolKey, opts.inputHash ?? '');
  }
  const { removeBackground: lib } = await import('@imgly/background-removal');
  return lib(input, {
    output: { format: opts.format ?? 'image/png', quality: 1 },
    model: MODEL_KEY[opts.quality ?? 'balanced'],
    progress: (key: string, current: number, total: number) => {
      if (!opts.onProgress) return;
      const phase = key.startsWith('fetch:') ? 'Loading model' : key === 'compute:inference' ? 'Isolating subject' : key;
      const ratio = total > 0 ? Math.min(1, current / total) : 0;
      opts.onProgress({ phase, ratio });
    },
  });
}
