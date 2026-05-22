/**
 * ffmpeg.wasm engine — lazy-loaded singleton wrapper.
 *
 * Single-threaded core (no COOP/COEP needed, works in every modern browser).
 * Core files are served from /public/ffmpeg/ so we don't depend on a CDN.
 *
 * Usage:
 *   const out = await runFfmpeg({
 *     input: file,
 *     inputName: 'in.mp4',
 *     outputName: 'out.mp4',
 *     args: (i, o) => ['-i', i, '-vf', 'scale=640:-1', o],
 *     mimeType: 'video/mp4',
 *     onProgress: (p) => setProgress(p),
 *   });
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { niceThreadCount, isLowMemory } from '@/lib/compute/concurrency';

// Single-threaded core (universal fallback).
const ST_CORE = '/ffmpeg/ffmpeg-core.js';
const ST_WASM = '/ffmpeg/ffmpeg-core.wasm';
// Multi-threaded core — uses every CPU core. Needs cross-origin isolation
// (we set COOP/COEP) + SharedArrayBuffer; falls back to ST if unavailable.
const MT_CORE = '/ffmpeg-mt/ffmpeg-core.js';
const MT_WASM = '/ffmpeg-mt/ffmpeg-core.wasm';
const MT_WORKER = '/ffmpeg-mt/ffmpeg-core.worker.js';

function canUseMT(): boolean {
  try {
    if (typeof SharedArrayBuffer === 'undefined') return false;
    if (typeof globalThis === 'undefined') return false;
    if ((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated !== true) return false;
    // The MT core keeps a SharedArrayBuffer heap that can't shrink and grows
    // with thread count — on low-memory devices that reliably OOM-crashes the
    // tab. Stay single-threaded there: slower, but it never kills the page.
    if (isLowMemory()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * How many threads to let ffmpeg actually use. We cap below the core count for
 * two reasons: leave a core free so the UI/system stays smooth (no "whole
 * machine froze" feeling), and because WASM gains plateau by ~4 threads while
 * memory keeps climbing. Returns 1 for the single-thread core.
 */
function threadCount(): number {
  return _isMT ? niceThreadCount() : 1;
}

/** Prepend a global `-threads N` unless the caller already set one. */
function withThreads(argv: string[]): string[] {
  if (argv.includes('-threads')) return argv;
  return ['-threads', String(threadCount()), ...argv];
}

let _instance: FFmpeg | null = null;
let _isMT = false;
let _loadPromise: Promise<FFmpeg> | null = null;

async function loadInstance(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (_instance) return _instance;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const mt = canUseMT();
    const ff = new FFmpeg();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    try {
      await ff.load(
        mt
          ? { coreURL: MT_CORE, wasmURL: MT_WASM, workerURL: MT_WORKER }
          : { coreURL: ST_CORE, wasmURL: ST_WASM },
      );
    } catch (e) {
      // MT can fail on some environments — fall back to the single-thread core.
      if (mt) {
        const ff2 = new FFmpeg();
        if (onLog) ff2.on('log', ({ message }) => onLog(message));
        await ff2.load({ coreURL: ST_CORE, wasmURL: ST_WASM });
        _instance = ff2;
        _isMT = false;
        return ff2;
      }
      throw e;
    }
    _instance = ff;
    _isMT = mt;
    return ff;
  })();
  return _loadPromise;
}

export interface RunOptions {
  /** Input file (single file) */
  input: File | Blob;
  /** Filename used inside ffmpeg's virtual fs (e.g. 'in.mp4') */
  inputName: string;
  /** Filename for output (e.g. 'out.mp4') */
  outputName: string;
  /** Build the ffmpeg argv. Both names are passed in. */
  args: (inputName: string, outputName: string) => string[];
  /** MIME type for the resulting Blob */
  mimeType: string;
  /** Progress 0..1 */
  onProgress?: (p: number) => void;
  /** Optional log capture */
  onLog?: (msg: string) => void;
}

/** Run a single-input ffmpeg job and return the output as a Blob. */
export async function runFfmpeg(opts: RunOptions): Promise<Blob> {
  const ff = await loadInstance(opts.onLog);
  const { fetchFile } = await import('@ffmpeg/util');

  const onProgress = (e: { progress: number }) => {
    if (opts.onProgress) opts.onProgress(Math.max(0, Math.min(1, e.progress)));
  };
  ff.on('progress', onProgress);

  try {
    await ff.writeFile(opts.inputName, await fetchFile(opts.input));
    await ff.exec(withThreads(opts.args(opts.inputName, opts.outputName)));
    const data = await ff.readFile(opts.outputName);
    // readFile may return Uint8Array; coerce safely.
    const bytes = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
    return new Blob([bufferOf(bytes)], { type: opts.mimeType });
  } finally {
    ff.off('progress', onProgress);
    // Best-effort cleanup of virtual fs entries
    try { await ff.deleteFile(opts.inputName); } catch { /* ignore */ }
    try { await ff.deleteFile(opts.outputName); } catch { /* ignore */ }
  }
}

/** Run a multi-input ffmpeg job (e.g. merge). */
export async function runFfmpegMulti(opts: {
  inputs: { name: string; data: File | Blob }[];
  outputName: string;
  args: (inputNames: string[], outputName: string) => string[];
  /** Optional extra virtual files (e.g. concat list) */
  extraFiles?: { name: string; data: string | Uint8Array }[];
  mimeType: string;
  onProgress?: (p: number) => void;
  onLog?: (msg: string) => void;
}): Promise<Blob> {
  const ff = await loadInstance(opts.onLog);
  const { fetchFile } = await import('@ffmpeg/util');

  const onProgress = (e: { progress: number }) => opts.onProgress?.(Math.max(0, Math.min(1, e.progress)));
  ff.on('progress', onProgress);

  const written: string[] = [];
  try {
    for (const inp of opts.inputs) {
      await ff.writeFile(inp.name, await fetchFile(inp.data));
      written.push(inp.name);
    }
    for (const f of opts.extraFiles ?? []) {
      await ff.writeFile(f.name, f.data);
      written.push(f.name);
    }
    await ff.exec(withThreads(opts.args(opts.inputs.map((i) => i.name), opts.outputName)));
    const data = await ff.readFile(opts.outputName);
    const bytes = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
    return new Blob([bufferOf(bytes)], { type: opts.mimeType });
  } finally {
    ff.off('progress', onProgress);
    for (const name of written) {
      try { await ff.deleteFile(name); } catch { /* ignore */ }
    }
    try { await ff.deleteFile(opts.outputName); } catch { /* ignore */ }
  }
}

function bufferOf(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** True if the ffmpeg engine has been loaded at least once this session. */
export function isLoaded(): boolean {
  return _instance !== null;
}

/**
 * Pre-warm the core (download + compile the 30 MB+ wasm) before the user hits
 * Run, so the first job starts instantly. Safe to call repeatedly — it reuses
 * the in-flight/loaded singleton and swallows errors (warming is best-effort).
 */
export function warm(): void {
  if (_instance || _loadPromise) return;
  void loadInstance().catch(() => { /* best-effort */ });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Probe input filename extension to choose an appropriate ffmpeg container. */
export function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}
