/**
 * Low-memory device profile for the on-device AI tools.
 *
 * iOS/iPadOS WebKit (Safari AND every in-app WKWebView, incl. the Xonvert app,
 * which adds "XonvertApp/" to its UA) kills the web-content process at roughly
 * 1-1.5 GB, limits WASM memory growth, and caps total canvas memory. Models and
 * heaps that run fine on Android/desktop crash it outright, so on this profile
 * the AI engines pick the smallest model variant, run single-threaded WASM,
 * process smaller tiles/chunks and refuse inputs that cannot fit BEFORE loading
 * a model. Every other device keeps its existing behaviour.
 */

/** iPhone / iPod / iPad, including iPadOS that reports itself as "Macintosh". */
export function isIOSWebKit(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS 13+ desktop-mode UA: "Macintosh" + touch points.
    if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
    // The Xonvert app's WKWebView on iOS; the Android app's UA says "Android".
    if (/XonvertApp\//.test(ua) && !/Android/i.test(ua) && /AppleWebKit/i.test(ua) && !/Windows|Linux|CrOS/i.test(ua)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Device reports <= 2 GB (navigator.deviceMemory is Chromium-only, coarse). */
function reportsVeryLowMemory(): boolean {
  try {
    const dm = (navigator as { deviceMemory?: number }).deviceMemory;
    return typeof dm === 'number' && dm <= 2;
  } catch {
    return false;
  }
}

/** True when the AI engines must use the low-memory profile. */
export function isMemoryConstrained(): boolean {
  return isIOSWebKit() || reportsVeryLowMemory();
}

/** Limits applied on the constrained profile. Numbers keep peak well under ~700 MB. */
export const LOW_MEM = {
  /** Whisper input: max decoded length (seconds). 30 min @16 kHz mono = 115 MB. */
  maxAudioSeconds: 30 * 60,
  /** Max encoded file handed to decodeAudioData (bytes). The whole file is
   *  held in memory while the decoder also holds full-rate PCM. */
  maxAudioFileBytes: 60 * 1024 * 1024,
  maxVideoFileBytes: 150 * 1024 * 1024,
  /** Super-resolution: source tile edge, overlap and output long-edge cap. */
  upscaleTile: 128,
  upscaleOverlap: 8,
  upscaleMaxOutputEdge: 2048,
  /** Refuse to even decode images above this many pixels (a decoded 48 MP
   *  photo alone is ~190 MB of RGBA). */
  maxSourcePixels: 24_000_000,
} as const;

/** Thrown BEFORE any model load when an input cannot fit on this device. */
export class DeviceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceLimitError';
  }
}

export const IPHONE_MEMORY_MESSAGE =
  'This tool needs more memory than iPhone allows';
