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
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    const onMeta = () => { cleanup(); resolve({ video, url }); };
    const onErr = () => { cleanup(); URL.revokeObjectURL(url); reject(new Error('Could not load this video.')); };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
  });
}

export async function getVideoInfo(file: File): Promise<{ info: VideoInfo; video: HTMLVideoElement; url: string }> {
  const { video, url } = await loadVideoElement(file);
  const hasAudio = (video as unknown as { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number; audioTracks?: { length: number } }).audioTracks?.length
    ? true
    : (video as unknown as { mozHasAudio?: boolean }).mozHasAudio
    ?? ((video as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount ?? 0) > 0;
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
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    const onErr = () => { video.removeEventListener('error', onErr); reject(new Error('Seek failed.')); };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    video.currentTime = target;
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

/** Record an HTMLVideoElement playback range to a Blob via MediaRecorder. */
export async function recordRange(
  video: HTMLVideoElement,
  startSec: number,
  endSec: number,
  opts: { withVideo?: boolean; withAudio?: boolean; mimeType?: string; onProgress?: (t: number) => void } = {},
): Promise<Blob> {
  const { withVideo = true, withAudio = true, mimeType, onProgress } = opts;
  const stream: MediaStream = (video as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream?.()
    ?? (video as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream!();
  if (!stream) throw new Error('captureStream not supported in this browser.');

  // Filter tracks
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
    'audio/webm;codecs=opus',
    'audio/webm',
  ].filter(Boolean) as string[];
  const chosen = fallbackTypes.find((t) => MediaRecorder.isTypeSupported(t));
  if (!chosen) throw new Error('No supported MediaRecorder format.');

  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream, { mimeType: chosen, videoBitsPerSecond: 4_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  await seekTo(video, startSec);
  return new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: chosen }));
    rec.onerror = (e) => reject(new Error('Recorder error: ' + (e as unknown as { error: { message: string } }).error?.message));

    let raf = 0;
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
    }).catch((err) => reject(err));
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  // Deferred so the usage-gate download interceptor can still read the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
