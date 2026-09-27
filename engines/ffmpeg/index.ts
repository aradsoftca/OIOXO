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
import { BRAND_DOMAIN } from '@/lib/brand';

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

// ---- Brand watermark for VIDEO outputs (free) -------------------------------
// Composited as a second overlay pass on the produced video so it shows for the
// whole duration (and in any re-share). Default ON (free); Pro turns it off.
// Entirely defensive: ANY failure (codec missing, audio-less input, etc.) returns
// the original output untouched — a watermark is never a reason to fail an export.
let _wmOn = true;
export function setFfmpegWatermark(on: boolean): void { _wmOn = on; }

let _wmPng: Uint8Array | null = null;
async function watermarkPng(): Promise<Uint8Array | null> {
  if (_wmPng) return _wmPng;
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const text = BRAND_DOMAIN;
    const fontPx = 22, padX = 14, padY = 8;
    const font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    let c = new OffscreenCanvas(8, 8);
    let ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width);
    const w = tw + padX * 2, h = fontPx + padY * 2;
    c = new OffscreenCanvas(w, h);
    ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, padX, h / 2 + 1);
    const blob = await c.convertToBlob({ type: 'image/png' });
    _wmPng = new Uint8Array(await blob.arrayBuffer());
    return _wmPng;
  } catch {
    return null;
  }
}

function isVideoOut(name: string, mime: string): boolean {
  return /^video\//.test(mime) || /\.(mp4|webm|mov|mkv|m4v)$/i.test(name);
}

/** If free + video output, overlay the brand mark bottom-right (re-encode video,
 *  copy audio). Returns the filename to read (the watermarked one, or the original
 *  on any problem). Caller must delete the returned name if it differs. */
async function maybeWatermarkVideo(ff: FFmpeg, outName: string, mime: string): Promise<string> {
  if (!_wmOn || !isVideoOut(outName, mime)) return outName;
  try {
    const png = await watermarkPng();
    if (!png) return outName;
    await ff.writeFile('xwm.png', png);
    const wmOut = 'xwm_' + outName;
    const r = await execGuarded(ff, withThreads([
      '-i', outName, '-i', 'xwm.png',
      '-filter_complex', 'overlay=W-w-24:H-h-24',
      '-c:a', 'copy', wmOut,
    ]));
    if (r.status === 'stalled') throw new MtStall();
    if (r.status === 'failed') { try { await ff.deleteFile(wmOut); } catch { /* */ } return outName; }
    const d = await ff.readFile(wmOut);
    try { await ff.deleteFile('xwm.png'); } catch { /* ignore */ }
    if (d && (d as Uint8Array).length > 0) return wmOut;
    try { await ff.deleteFile(wmOut); } catch { /* ignore */ }
    return outName;
  } catch (e) {
    if (e instanceof MtStall) throw e; // the caller restarts the job single-threaded
    return outName;
  }
}

class MtStall extends Error { constructor() { super('mt-stall'); } }

let _instance: FFmpeg | null = null;
let _isMT = false;
// Set once the multi-thread core has stalled in this tab: every later load uses
// the single-thread core. (Live sweep: MT video encodes — compress, resize,
// mp4→webm — produced no progress and no error for 120 s, while audio jobs on
// the same core finished. ST is slower but completes.)
let _forceST = false;
const MT_STALL_MS = 30_000;

type ExecResult = { status: 'ok' | 'stalled' | 'failed'; tail: string };

/** exec() that (a) reports a non-zero exit code or a crash instead of letting
 *  the caller read a missing output file — ff.exec RESOLVES with the code, and
 *  the later readFile error has an EMPTY message, so video-convert → WebM just
 *  silently stopped — and (b) gives up if the MT core goes silent. */
async function execGuarded(ff: FFmpeg, args: string[]): Promise<ExecResult> {
  let last = Date.now();
  const lines: string[] = [];
  const bump = () => { last = Date.now(); };
  const onLog = ({ message }: { message: string }) => { last = Date.now(); lines.push(message); if (lines.length > 20) lines.shift(); };
  ff.on('progress', bump);
  ff.on('log', onLog);
  let timer: ReturnType<typeof setInterval> | undefined;
  // Prefer ffmpeg's own error lines; never report a progress line ("frame= 1 fps=…")
  // as the reason, which is what the first WebM failure showed users.
  const tail = () => lines.filter((l) => /error|invalid|failed|not |unable|abort|unsupported/i.test(l)).slice(-2).join(' ')
    || lines.filter((l) => !/^\s*(frame|size)=/.test(l)).slice(-1).join('');
  try {
    const run = ff.exec(args).then(
      (code) => ({ status: code === 0 ? 'ok' : 'failed', tail: tail() }) as ExecResult,
      (e) => ({ status: 'failed', tail: (e as Error)?.message || tail() }) as ExecResult,
    );
    if (!_isMT) return await run;
    return await Promise.race([
      run,
      new Promise<ExecResult>((resolve) => {
        timer = setInterval(() => { if (Date.now() - last > MT_STALL_MS) resolve({ status: 'stalled', tail: '' }); }, 2_000);
      }),
    ]);
  } finally {
    if (timer) clearInterval(timer);
    try { ff.off('progress', bump); ff.off('log', onLog); } catch { /* */ }
  }
}

/** Drop the stalled MT instance so the next load comes up single-threaded. */
function abandonMT(ff: FFmpeg) {
  try { ff.terminate(); } catch { /* */ }
  _instance = null;
  _loadPromise = null;
  _isMT = false;
  _forceST = true;
}
let _loadPromise: Promise<FFmpeg> | null = null;

// Serialize ffmpeg runs. The engine is a singleton with one shared virtual
// FS and one progress event stream — two concurrent runs would step on each
// other's files in the finally cleanup and double-fire progress to both
// tools. Easy to trigger by navigating between tools mid-job, or by code
// that fires a batch of `runFfmpeg` calls without awaiting each one.
let _runQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = _runQueue.then(fn, fn);
  // Don't let one run's rejection poison the next.
  _runQueue = next.catch(() => {});
  return next;
}

async function loadInstance(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (_instance) return _instance;
  if (_loadPromise) return _loadPromise;
  const p = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const mt = canUseMT() && !_forceST;
    const ff = new FFmpeg();
    // NOTE: log handler is attached PER-RUN (in runFfmpeg / runFfmpegMulti),
    // not here at load time. The original code attached the first caller's
    // onLog permanently, leaking it and routing every subsequent run's logs
    // to the wrong place.
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
  // If the load promise rejects we MUST clear it so the next call tries
  // again. Previously the rejected promise stayed memoised forever —
  // a transient network failure left the tool permanently broken.
  p.catch(() => { _loadPromise = null; });
  _loadPromise = p;
  if (onLog) p.then((ff) => attachLog(ff, onLog)).catch(() => {});
  return p;
}

/** Attach a one-run log handler. The caller must dispose it after the run
 *  using the returned function (see runFfmpeg below). */
function attachLog(ff: FFmpeg, onLog: (msg: string) => void): () => void {
  const h = ({ message }: { message: string }) => onLog(message);
  ff.on('log', h);
  return () => { try { ff.off('log', h); } catch { /* */ } };
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
  /** Per-action permission ticket — when set, the engine asserts it server-side
   *  BEFORE doing real work. Pair with the toolKey + inputHash the ticket was
   *  minted for; mismatch throws "permission-denied". Pass undefined on
   *  always-free utility calls (Pro users / unconfigured envs pass through). */
  permission?: import('@/lib/limits/permission').Permission | null;
  /** Tool key the ticket was minted for — must match the ticket's claim. */
  toolKey?: string;
  /** Input fingerprint the ticket was minted for. */
  inputHash?: string;
}

/** Run a single-input ffmpeg job and return the output as a Blob. */
export async function runFfmpeg(opts: RunOptions): Promise<Blob> {
  // Per-action permission gate: when the caller passed a ticket, re-bind it
  // server-side against (toolKey, inputHash, device). A clone that strips the
  // UI's enforcePolicy / requestPermission call STILL can't drive ffmpeg —
  // this throws "permission-denied" before any decode/encode runs.
  if (opts.permission?.ticket && opts.toolKey) {
    const { assertPermission } = await import('@/lib/limits/permission');
    await assertPermission(opts.permission, opts.toolKey, opts.inputHash ?? '');
  }

  return serialize(() => runFfmpegInner(opts));
}

async function runFfmpegInner(opts: RunOptions, retried = false): Promise<Blob> {
  const ff = await loadInstance();
  const { fetchFile } = await import('@ffmpeg/util');

  const onProgress = (e: { progress: number }) => {
    if (opts.onProgress) opts.onProgress(Math.max(0, Math.min(1, e.progress)));
  };
  ff.on('progress', onProgress);
  const detachLog = opts.onLog ? attachLog(ff, opts.onLog) : null;

  let finalName = opts.outputName;
  try {
    await ff.writeFile(opts.inputName, await fetchFile(opts.input));
    const r = await execGuarded(ff, withThreads(opts.args(opts.inputName, opts.outputName)));
    if (r.status !== 'ok') {
      // A stall or a failure on the MT core: retry once on the single-thread core.
      if (_isMT && !retried) {
        ff.off('progress', onProgress);
        detachLog?.();
        abandonMT(ff);
        return runFfmpegInner(opts, true);
      }
      throw new Error(r.status === 'stalled'
        ? 'Processing stalled. Please try again.'
        : `Conversion failed${r.tail ? `: ${r.tail}` : '.'}`);
    }
    try {
      finalName = await maybeWatermarkVideo(ff, opts.outputName, opts.mimeType);
    } catch (e) {
      if (!(e instanceof MtStall)) throw e;
      ff.off('progress', onProgress);
      detachLog?.();
      abandonMT(ff);
      if (retried) throw new Error('Processing stalled. Please try again.');
      return runFfmpegInner(opts, true);
    }
    const data = await ff.readFile(finalName);
    // readFile may return Uint8Array; coerce safely.
    const bytes = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
    if (!bytes.length) throw new Error('Conversion produced an empty file.');
    return new Blob([bufferOf(bytes)], { type: opts.mimeType });
  } finally {
    ff.off('progress', onProgress);
    detachLog?.();
    // Best-effort cleanup of virtual fs entries
    try { await ff.deleteFile(opts.inputName); } catch { /* ignore */ }
    try { await ff.deleteFile(opts.outputName); } catch { /* ignore */ }
    if (finalName !== opts.outputName) { try { await ff.deleteFile(finalName); } catch { /* ignore */ } }
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
  return serialize(() => runFfmpegMultiInner(opts));
}

async function runFfmpegMultiInner(opts: {
  inputs: { name: string; data: File | Blob }[];
  outputName: string;
  args: (inputNames: string[], outputName: string) => string[];
  extraFiles?: { name: string; data: string | Uint8Array }[];
  mimeType: string;
  onProgress?: (p: number) => void;
  onLog?: (msg: string) => void;
}): Promise<Blob> {
  const ff = await loadInstance();
  const { fetchFile } = await import('@ffmpeg/util');

  const onProgress = (e: { progress: number }) => opts.onProgress?.(Math.max(0, Math.min(1, e.progress)));
  ff.on('progress', onProgress);
  const detachLog = opts.onLog ? attachLog(ff, opts.onLog) : null;

  const written: string[] = [];
  let finalName = opts.outputName;
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
    finalName = await maybeWatermarkVideo(ff, opts.outputName, opts.mimeType);
    const data = await ff.readFile(finalName);
    const bytes = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
    return new Blob([bufferOf(bytes)], { type: opts.mimeType });
  } finally {
    ff.off('progress', onProgress);
    detachLog?.();
    for (const name of written) {
      try { await ff.deleteFile(name); } catch { /* ignore */ }
    }
    try { await ff.deleteFile(opts.outputName); } catch { /* ignore */ }
    if (finalName !== opts.outputName) { try { await ff.deleteFile(finalName); } catch { /* ignore */ } }
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
  // 60s defer matches the rest of the codebase — 10s was tight on slow mobile
  // networks where the system download dialog opens after a few seconds and
  // then aborts the save when the blob URL has already gone away.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Probe input filename extension to choose an appropriate ffmpeg container. */
export function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}
