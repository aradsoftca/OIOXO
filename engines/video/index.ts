/**
 * Video engine — browser-native video processing.
 *
 * Strategy:
 *  - Metadata + frame extraction: HTMLVideoElement + canvas (no encoder)
 *  - Real-time export (trim/mute/extract-audio): MediaRecorder + captureStream → WebM
 *  - GIF encoding: gif.js (worker)
 *  - ZIP packaging: jszip
 *
 * Heavy operations that need re-encoding to MP4 (merge, crop, watermark, format-convert)
 * are deferred until WebCodecs + mp4-muxer wave.
 */
import { WM_DOMAIN } from '@/lib/watermark/config';

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  hasAudio: boolean;
  fileSize: number;
  mimeType: string;
  framerate: number | null;
}

/** Load a File into an HTMLVideoElement and return it once metadata is ready. */
export function loadVideoElement(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;
    let done = false;
    const cleanup = () => {
      done = true;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const onMeta = () => { if (done) return; cleanup(); resolve({ video, url }); };
    const onErr = () => { if (done) return; cleanup(); URL.revokeObjectURL(url); reject(new Error('Could not load this video.')); };
    // Hard timeout. Without this, a corrupt or unsupported video would leave
    // the promise pending forever (no `loadedmetadata`, no `error`), hanging
    // every video tool's loading spinner indefinitely.
    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('Video metadata took too long — file may be corrupt or unsupported.'));
    }, 30_000);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
  });
}

export async function getVideoInfo(file: File): Promise<{ info: VideoInfo; video: HTMLVideoElement; url: string }> {
  const { video, url } = await loadVideoElement(file);
  // Only trust an API that can actually answer at loadedmetadata. Chrome has no
  // audioTracks (flagged off) and webkitAudioDecodedByteCount is 0 before any
  // playback, so the old check called EVERY video silent in Chrome and disabled
  // audio tools for all Chrome users. Unknown → assume audio; ffmpeg reports
  // a missing stream if there really is none.
  const v = video as unknown as { mozHasAudio?: boolean; audioTracks?: { length: number } };
  // Safari/WKWebView (every iOS app) reports audioTracks.length 0 at loadedmetadata even when
  // the file has sound, which disabled Extract Audio on iPhone. Only a positive count is proof.
  const hasAudio = (v.audioTracks && v.audioTracks.length > 0) || (v.mozHasAudio ?? true);
  const info: VideoInfo = {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    aspectRatio: simplifyRatio(video.videoWidth, video.videoHeight),
    hasAudio: !!hasAudio,
    fileSize: file.size,
    mimeType: file.type || 'video/*',
    framerate: null,
  };
  return { info, video, url };
}

function simplifyRatio(w: number, h: number): string {
  if (!w || !h) return '—';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/** Seek a video element to a specific time and resolve when frame is rendered. */
export function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.min(Math.max(0, t), video.duration);
    // If duration is NaN (metadata not yet loaded) or the playhead is already
    // within a frame of target, browsers may not fire `seeked` — the promise
    // would hang forever. Resolve quickly in those cases.
    if (!Number.isFinite(target)) { resolve(); return; }
    if (Math.abs(video.currentTime - target) < 0.001) { resolve(); return; }
    let done = false;
    const cleanup = () => {
      done = true;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const onSeeked = () => { if (done) return; cleanup(); resolve(); };
    const onErr = () => { if (done) return; cleanup(); reject(new Error('Seek failed.')); };
    // 4-second hard cap so a stalled decoder doesn't deadlock the caller.
    const timer = setTimeout(() => { if (done) return; cleanup(); resolve(); }, 4000);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    try { video.currentTime = target; } catch { cleanup(); resolve(); }
  });
}

/** Capture a frame at the current playhead into a fresh canvas. */
export function captureFrame(video: HTMLVideoElement, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(video.videoWidth * scale));
  c.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))), type, quality);
  });
}

export async function extractFrameAt(video: HTMLVideoElement, t: number, scale = 1, type = 'image/png', quality = 0.92): Promise<Blob> {
  await seekTo(video, t);
  const c = captureFrame(video, scale);
  return canvasToBlob(c, type, quality);
}

/** Sample N evenly-spaced timestamps, capture frames, return blobs. */
export async function extractFrames(video: HTMLVideoElement, count: number, scale = 1, type = 'image/png'): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(1, count - 1)) * video.duration;
    out.push(await extractFrameAt(video, t, scale, type));
  }
  return out;
}

/** Render a sprite-sheet of N frames in a grid. */
export async function buildThumbnailGrid(
  video: HTMLVideoElement,
  cols: number,
  rows: number,
  cellWidth: number,
): Promise<Blob> {
  const total = cols * rows;
  const cellHeight = Math.round((cellWidth * video.videoHeight) / video.videoWidth);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cellWidth;
  sheet.height = rows * cellHeight;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  for (let i = 0; i < total; i++) {
    const t = (i / Math.max(1, total - 1)) * video.duration;
    await seekTo(video, t);
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(video, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
  }
  return canvasToBlob(sheet, 'image/jpeg', 0.85);
}

/**
 * Encode a sequence of frames into an animated GIF using gif.js worker.
 * frames: array of canvases at identical dimensions.
 * delayMs: milliseconds per frame.
 */
export async function framesToGif(frames: HTMLCanvasElement[], delayMs: number, quality = 10): Promise<Blob> {
  if (!frames.length) throw new Error('No frames.');
  const { niceThreadCount } = await import('@/lib/compute/concurrency');
  const mod = await import('gif.js');
  const GIFEnc = (mod as unknown as { default: new (opts: Record<string, unknown>) => GifInstance }).default;
  return new Promise<Blob>((resolve, reject) => {
    const gif = new GIFEnc({
      // Spread frame encoding across cores (leaving headroom), instead of a fixed 2.
      workers: niceThreadCount(),
      quality,
      width: frames[0].width,
      height: frames[0].height,
      workerScript: '/gif.worker.js',
      transparent: null,
    });
    for (const f of frames) gif.addFrame(f, { delay: delayMs, copy: true });
    gif.on('finished', (blob: Blob) => resolve(blob));
    gif.on('abort', () => reject(new Error('GIF aborted')));
    gif.render();
  });
}

interface GifInstance {
  addFrame: (canvas: HTMLCanvasElement, opts: { delay: number; copy: boolean }) => void;
  on: (event: string, cb: (arg: Blob) => void) => void;
  render: () => void;
}

/**
 * Draw the corner brand mark into a recording canvas frame. Mirrors the live
 * stream-overlay style (bottom-right, shadowed) so every surface looks the same.
 */
function drawRecordingWatermark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!w || !h) return;
  const fp = Math.max(13, Math.round(w * 0.018));
  const pad = Math.round(w * 0.015);
  ctx.save();
  ctx.font = `600 ${fp}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = 0.72;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = Math.max(2, Math.round(fp * 0.2));
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(WM_DOMAIN, w - pad, h - pad);
  ctx.restore();
}

/** Record an HTMLVideoElement playback range to a Blob via MediaRecorder.
 *  When `watermark` is true (free session), the video is re-encoded through a
 *  canvas that stamps the corner brand into every frame; Pro callers leave it
 *  off and get the raw captureStream path unchanged. */
export async function recordRange(
  video: HTMLVideoElement,
  startSec: number,
  endSec: number,
  opts: { withVideo?: boolean; withAudio?: boolean; mimeType?: string; watermark?: boolean; onProgress?: (t: number) => void } = {},
): Promise<Blob> {
  const { withVideo = true, withAudio = true, mimeType, watermark = false, onProgress } = opts;
  // Safari/WKWebView has no HTMLMediaElement.captureStream: fail with a clear
  // message instead of a TypeError from calling undefined.
  const v = video as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const cap = v.captureStream ?? v.mozCaptureStream;
  if (typeof cap !== 'function' || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record video playback (Safari/iOS). Please use Chrome, Edge or Firefox, or pick an MP4 output.');
  }
  const srcStream: MediaStream = cap.call(video);
  if (!srcStream) throw new Error('captureStream not supported in this browser.');

  // When watermarking a video output, interpose a canvas: draw each played frame
  // + the corner brand, then record FROM the canvas. The brand becomes baked-in
  // pixels (survives re-share). Falls back to the raw source stream on any setup
  // failure or when video has no pixels (audio-only) — never blocks an export.
  let wmCanvas: HTMLCanvasElement | null = null;
  let wmRaf = 0;
  let stream = srcStream;
  if (watermark && withVideo && srcStream.getVideoTracks().length && video.videoWidth > 0) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const drawWm = () => {
          try {
            const w = video.videoWidth, h = video.videoHeight;
            if (w) {
              if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
              ctx.drawImage(video, 0, 0, w, h);
              drawRecordingWatermark(ctx, w, h);
            }
          } catch { /* keep drawing */ }
          wmRaf = requestAnimationFrame(drawWm);
        };
        wmRaf = requestAnimationFrame(drawWm);
        const wmStream = canvas.captureStream(30);
        // Carry the (un-altered) source audio across when requested.
        if (withAudio) for (const a of srcStream.getAudioTracks()) wmStream.addTrack(a);
        wmCanvas = canvas;
        stream = wmStream;
      }
    } catch {
      // Setup failed — fall back to the unbranded source stream rather than fail.
      if (wmRaf) { cancelAnimationFrame(wmRaf); wmRaf = 0; }
      wmCanvas = null;
      stream = srcStream;
    }
  }

  // Filter tracks (only meaningful for the raw source-stream path; the canvas
  // path is already built with exactly the tracks we want).
  const tracks = stream.getTracks();
  for (const t of tracks) {
    if (t.kind === 'video' && !withVideo) stream.removeTrack(t);
    if (t.kind === 'audio' && !withAudio) stream.removeTrack(t);
  }

  const fallbackTypes = [
    mimeType,
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    // Safari's MediaRecorder writes MP4 only.
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ].filter(Boolean) as string[];
  const chosen = fallbackTypes.find((t) => MediaRecorder.isTypeSupported(t));
  if (!chosen) throw new Error('No supported MediaRecorder format.');

  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream, { mimeType: chosen, videoBitsPerSecond: 4_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  await seekTo(video, startSec);
  return new Promise<Blob>((resolve, reject) => {
    let raf = 0;
    // Tear down the recorder + RAF + captureStream on any exit path. Without
    // this, a rec.onerror or a rejected video.play() would leave the
    // MediaRecorder running and the captureStream tracks live until GC.
    const teardown = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Stop the watermark draw loop and its canvas-capture track, else the RAF
      // keeps running and the captured video track stays live until GC.
      if (wmRaf) { cancelAnimationFrame(wmRaf); wmRaf = 0; }
      if (wmCanvas) { try { for (const t of stream.getVideoTracks()) t.stop(); } catch { /* */ } }
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* */ }
      try { video.pause(); } catch { /* */ }
    };
    rec.onstop = () => {
      // Recording done: stop the watermark draw loop AND its canvas-capture
      // track so neither leaks past export (the RAF would otherwise keep
      // drawing and the captured track would stay live until GC).
      if (wmRaf) { cancelAnimationFrame(wmRaf); wmRaf = 0; }
      if (wmCanvas) { try { for (const t of stream.getVideoTracks()) t.stop(); } catch { /* */ } }
      resolve(new Blob(chunks, { type: chosen }));
    };
    rec.onerror = (e) => {
      teardown();
      reject(new Error('Recorder error: ' + (e as unknown as { error: { message: string } }).error?.message));
    };

    const tick = () => {
      onProgress?.(video.currentTime - startSec);
      if (video.currentTime >= endSec || video.ended) {
        cancelAnimationFrame(raf);
        rec.stop();
        video.pause();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    rec.start(100);
    video.play().then(() => {
      raf = requestAnimationFrame(tick);
    }).catch((err) => {
      teardown();
      reject(err);
    });
  });
}

/** File extension matching a recorded Blob's MIME (MediaRecorder may give MP4 on Safari). */
export function extForRecordedMime(mime: string): string {
  if (/^video\/mp4|^audio\/mp4/i.test(mime)) return /^audio/i.test(mime) ? 'm4a' : 'mp4';
  return /^audio/i.test(mime) ? 'weba' : 'webm';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  // 60s defer matches the rest of the codebase — 10s was tight on slow mobile
  // networks where the system download dialog opens after a few seconds and
  // aborts the save when the blob URL is already revoked.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function blobsToZip(items: { name: string; blob: Blob }[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const it of items) zip.file(it.name, it.blob);
  return zip.generateAsync({ type: 'blob' });
}

export function fmtDuration(s: number): string {
  if (!isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
}
