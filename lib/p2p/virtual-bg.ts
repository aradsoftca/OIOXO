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

  // Feathered mask at output size, updated by segmentation; reused every frame.
  const maskScaled = document.createElement('canvas'); maskScaled.width = W; maskScaled.height = H;
  const msctx = maskScaled.getContext('2d')!;
  let haveMask = false;

  let mode: BgMode = initial;
  let image: HTMLImageElement | null = null;
  let running = true;
  let lastSeg = 0;
  const MIN_DT = 1000 / 20; // re-segment at most ~20fps; drawing stays smooth

  // Turn a segmentation result into a soft-edged alpha mask at output size.
  const onSeg = (res: any) => {
    const m = res?.confidenceMasks?.[0];
    if (!m) return;
    const mw = m.width, mh = m.height;
    const arr = m.getAsFloat32Array();
    maskC.width = mw; maskC.height = mh;
    const id = mctx.createImageData(mw, mh);
    for (let i = 0; i < arr.length; i++) {
      // Smootherstep around the decision band for cleaner edges.
      const v = arr[i];
      const a = v <= 0.3 ? 0 : v >= 0.7 ? 255 : Math.round(((v - 0.3) / 0.4) ** 2 * (3 - 2 * ((v - 0.3) / 0.4)) * 255);
      id.data[i * 4] = 255; id.data[i * 4 + 1] = 255; id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a;
    }
    mctx.putImageData(id, 0, 0);
    try { m.close?.(); } catch { /* */ }
    // Scale up with a feather so the person/background seam is soft, not jagged.
    msctx.clearRect(0, 0, W, H);
    msctx.filter = 'blur(3px)';
    msctx.imageSmoothingEnabled = true;
    msctx.drawImage(maskC, 0, 0, W, H);
    msctx.filter = 'none';
    haveMask = true;
  };

  const render = (now: number) => {
    if (!running) return;
    requestAnimationFrame(render);
    if (!source.videoWidth) return;

    // Re-segment at a capped rate (cheap-ish), but composite EVERY frame so the
    // self-view and outgoing track are smooth even between mask updates.
    if (now - lastSeg >= MIN_DT) { lastSeg = now; try { segmenter.segmentForVideo(source, now, onSeg); } catch { /* skip */ } }
    if (!haveMask) { // until the first mask, just pass the camera through
      octx.globalCompositeOperation = 'source-over';
      octx.clearRect(0, 0, W, H);
      drawCover(octx, source, source.videoWidth, source.videoHeight, W, H);
      return;
    }

    // Background layer (blurred camera or chosen image).
    bctx.clearRect(0, 0, W, H);
    if (mode === 'image' && image && image.naturalWidth) {
      drawCover(bctx, image, image.naturalWidth, image.naturalHeight, W, H);
    } else {
      bctx.filter = 'blur(16px)';
      drawCover(bctx, source, source.videoWidth, source.videoHeight, W, H);
      bctx.filter = 'none';
    }

    // Person = camera ∩ feathered mask, composited over the background.
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, W, H);
    drawCover(octx, source, source.videoWidth, source.videoHeight, W, H);
    octx.globalCompositeOperation = 'destination-in';
    octx.imageSmoothingEnabled = true;
    octx.drawImage(maskScaled, 0, 0, W, H);
    octx.globalCompositeOperation = 'destination-over';
    octx.drawImage(bgC, 0, 0);
    octx.globalCompositeOperation = 'source-over';
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
