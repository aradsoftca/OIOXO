/**
 * On-device subject/face tracking for smart reframe (Wave: parity).
 *
 * Uses MediaPipe FaceDetector (@mediapipe/tasks-vision — already a repo dep,
 * same pattern as lib/p2p/virtual-bg.ts) to find where the subject is across a
 * video, so reframe can crop to follow them instead of a fixed left/center/
 * right guess. Fully on-device; model loads from the official CDN on first use.
 *
 * NEEDS BROWSER QA: the detector + per-frame seek loop can't be verified
 * headless here. The caller falls back to centered crop if tracking yields
 * nothing, so a failure degrades gracefully rather than breaking export.
 */

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let _detector: Promise<any> | null = null;
async function getDetector(): Promise<any> {
  if (_detector) return _detector;
  _detector = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL },
      runningMode: 'VIDEO',
    });
  })();
  _detector.catch(() => { _detector = null; });
  return _detector;
}

export interface TrackPoint { t: number; cx: number } // cx = normalized 0..1 subject center-x

/**
 * Sample the video at ~`fps` and return the subject's normalized horizontal
 * center over time (the largest detected face each sample). Empty array if no
 * faces are found anywhere (caller should fall back to a centered crop).
 */
export async function trackSubject(
  file: File, opts: { fps?: number; onProgress?: (r: number) => void } = {},
): Promise<TrackPoint[]> {
  const fps = opts.fps ?? 2;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url; video.muted = true; video.playsInline = true;
  await new Promise<void>((res) => { video.onloadeddata = () => res(); video.onerror = () => res(); setTimeout(res, 6000); });
  const dur = isFinite(video.duration) ? video.duration : 0;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!dur || !vw) { URL.revokeObjectURL(url); return []; }

  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext('2d')!;
  const pts: TrackPoint[] = [];
  try {
    const detector = await getDetector();
    const step = 1 / fps;
    for (let t = 0; t < dur; t += step) {
      await new Promise<void>((res) => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
        video.addEventListener('seeked', onSeek);
        try { video.currentTime = Math.min(t, dur - 0.05); } catch { res(); }
        setTimeout(res, 400);
      });
      if (video.readyState < 2) continue;
      ctx.drawImage(video, 0, 0, vw, vh);
      let result: any;
      try { result = detector.detectForVideo(canvas, Math.round(t * 1000)); } catch { continue; }
      const dets = result?.detections ?? [];
      if (dets.length) {
        // Largest face = the subject.
        let best = dets[0];
        for (const d of dets) if ((d.boundingBox?.width ?? 0) > (best.boundingBox?.width ?? 0)) best = d;
        const bb = best.boundingBox;
        if (bb) pts.push({ t, cx: Math.max(0, Math.min(1, (bb.originX + bb.width / 2) / vw)) });
      }
      opts.onProgress?.(Math.min(1, t / dur));
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return pts;
}

/** Robust single focus value (median subject center-x) for a static smart crop. */
export function medianFocus(pts: TrackPoint[], fallback = 0.5): number {
  if (!pts.length) return fallback;
  const xs = pts.map((p) => p.cx).sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)];
}
