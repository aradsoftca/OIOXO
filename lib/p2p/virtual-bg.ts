/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Virtual background for the video call — on-device selfie segmentation
 * (MediaPipe ImageSegmenter, self-hosted model) composites the person over a
 * blurred camera feed or a chosen image, on a canvas whose captureStream() track
 * replaces the outgoing camera track. Everything stays on the device.
 *
 * Safeguards (perf policy: fast, never freeze): GPU delegate with CPU fallback,
 * processing capped to ~20fps, per-frame try/catch, and a small output size.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export type BgMode = 'blur' | 'image';

export interface VirtualBg {
  /** Processed video as a MediaStream — publish it and use it for local preview. */
  stream: MediaStream;
  setMode: (m: BgMode) => void;
  setImage: (img: HTMLImageElement | null) => void;
  stop: () => void;
}

const W = 640;
const H = 360;

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, w: number, h: number) {
  const sr = sw / sh;
  const dr = w / h;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (sr > dr) { dw = h * sr; dx = (w - dw) / 2; } else { dh = w / sr; dy = (h - dh) / 2; }
  ctx.drawImage(src, dx, dy, dw, dh);
}

export async function createVirtualBackground(source: HTMLVideoElement, initial: BgMode): Promise<VirtualBg> {
  const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(`${BASE}/mediapipe/wasm`);
  const opts = {
    baseOptions: { modelAssetPath: `${BASE}/mediapipe/selfie_segmenter.tflite`, delegate: 'GPU' as 'GPU' | 'CPU' },
    runningMode: 'VIDEO' as const,
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  };
  let segmenter: any;
  try { segmenter = await ImageSegmenter.createFromOptions(vision, opts); }
  catch { segmenter = await ImageSegmenter.createFromOptions(vision, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } }); }

  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d')!;
  const maskC = document.createElement('canvas'); const mctx = maskC.getContext('2d')!;
  const bgC = document.createElement('canvas'); bgC.width = W; bgC.height = H; const bctx = bgC.getContext('2d')!;

  let mode: BgMode = initial;
  let image: HTMLImageElement | null = null;
  let running = true;
  let last = 0;
  const MIN_DT = 1000 / 20; // cap processing ~20fps

  const composite = (res: any) => {
    const m = res?.confidenceMasks?.[0];
    if (!m) return;
    const mw = m.width, mh = m.height;
    const arr = m.getAsFloat32Array();
    maskC.width = mw; maskC.height = mh;
    const id = mctx.createImageData(mw, mh);
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i] >= 0.6 ? 255 : arr[i] <= 0.35 ? 0 : Math.round(arr[i] * 255);
      id.data[i * 4] = 255; id.data[i * 4 + 1] = 255; id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a;
    }
    mctx.putImageData(id, 0, 0);
    try { m.close?.(); } catch { /* */ }

    // Background layer.
    bctx.clearRect(0, 0, W, H);
    if (mode === 'image' && image && image.naturalWidth) {
      drawCover(bctx, image, image.naturalWidth, image.naturalHeight, W, H);
    } else {
      bctx.filter = 'blur(12px)';
      drawCover(bctx, source, source.videoWidth, source.videoHeight, W, H);
      bctx.filter = 'none';
    }

    // Person = camera ∩ mask, over the background.
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, W, H);
    drawCover(octx, source, source.videoWidth, source.videoHeight, W, H);
    octx.globalCompositeOperation = 'destination-in';
    octx.imageSmoothingEnabled = true;
    octx.drawImage(maskC, 0, 0, W, H);
    octx.globalCompositeOperation = 'destination-over';
    octx.drawImage(bgC, 0, 0);
    octx.globalCompositeOperation = 'source-over';
  };

  const render = (now: number) => {
    if (!running) return;
    if (source.videoWidth && now - last >= MIN_DT) {
      last = now;
      try { segmenter.segmentForVideo(source, now, composite); } catch { /* skip frame */ }
    }
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);

  const stream = out.captureStream(24);
  return {
    stream,
    setMode: (m) => { mode = m; },
    setImage: (img) => { image = img; },
    stop: () => { running = false; try { segmenter?.close?.(); } catch { /* */ } stream.getTracks().forEach((t) => t.stop()); },
  };
}
