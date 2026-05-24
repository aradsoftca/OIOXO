/**
 * oioxo — device capability detection.
 *
 * The platform sizes downloadable skill models to the user's hardware. We can't
 * read VRAM directly in a browser, so we infer a coarse tier from WebGPU
 * presence + adapter limits + device memory + cores. Honest and conservative:
 * better to under-promise a tier than to recommend a model that won't run.
 */
export type Tier = 'none' | 'low' | 'mid' | 'high';

export interface HardwareInfo {
  /** WebGPU available — required to run models in the browser. */
  webgpu: boolean;
  /** navigator.deviceMemory (GB, coarse, Chromium only) or null. */
  deviceMemoryGB: number | null;
  /** Logical CPU cores. */
  cores: number;
  /** GPU vendor/arch string when WebGPU exposes it. */
  gpu: string | null;
  /** Largest GPU buffer (bytes) — a proxy for GPU class. */
  maxBufferBytes: number | null;
  /** Inferred capability tier. */
  tier: Tier;
}

const RANK: Record<Tier, number> = { none: 0, low: 1, mid: 2, high: 3 };
export const tierRank = (t: Tier): number => RANK[t];
export const tierAtLeast = (have: Tier, need: Tier): boolean => RANK[have] >= RANK[need];

export const TIER_LABEL: Record<Tier, string> = {
  none: 'CPU only',
  low: 'Entry GPU',
  mid: 'Capable GPU',
  high: 'Strong GPU',
};

/** Detect the device's capability. Never throws; returns conservative defaults. */
export async function detectHardware(): Promise<HardwareInfo> {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const deviceMemoryGB =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null)
      : null;

  let webgpu = false;
  let gpu: string | null = null;
  let maxBufferBytes: number | null = null;

  try {
    // WebGPU globals aren't in the project's TS lib; access loosely.
    const gpuApi = (navigator as unknown as { gpu?: { requestAdapter: (o?: unknown) => Promise<unknown> } }).gpu;
    if (gpuApi) {
      const adapter = (await gpuApi.requestAdapter({ powerPreference: 'high-performance' })) as
        | { limits?: { maxBufferSize?: number }; info?: { vendor?: string; architecture?: string } }
        | null;
      if (adapter) {
        webgpu = true;
        maxBufferBytes = adapter.limits?.maxBufferSize ?? null;
        const info = adapter.info;
        if (info) gpu = [info.vendor, info.architecture].filter(Boolean).join(' ') || null;
      }
    }
  } catch {
    /* no WebGPU */
  }

  return { webgpu, deviceMemoryGB, cores, gpu, maxBufferBytes, tier: inferTier({ webgpu, deviceMemoryGB, cores, maxBufferBytes }) };
}

function inferTier(h: { webgpu: boolean; deviceMemoryGB: number | null; cores: number; maxBufferBytes: number | null }): Tier {
  if (!h.webgpu) return 'none';
  const gb = (h.maxBufferBytes ?? 0) / 1e9;
  const mem = h.deviceMemoryGB ?? 4;
  // Discrete/strong GPUs expose large max buffers; integrated ones are small.
  if (gb >= 2 && mem >= 8 && h.cores >= 8) return 'high';
  if (gb >= 1 && mem >= 8) return 'mid';
  if (gb >= 0.5 || mem >= 4) return 'low';
  return 'low';
}
