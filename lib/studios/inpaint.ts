/**
 * On-device content-aware inpainting (object removal) — Wave 3 model-backed.
 *
 * Lazy-loads onnxruntime-web + the MI-GAN inpainting model from a CDN on first
 * use (per the "no self-host, load from official CDN" rule), with a download-
 * progress callback so the UI can show "downloading model (~28 MB), on-device".
 * Nothing is uploaded — inference runs in the browser via WASM.
 *
 * Model: andraniksargsyan/migan migan_pipeline_v2.onnx (~28 MB, well under the
 * 180 MB budget). Verified I/O contract (checked against the real model):
 *   image : uint8 [batch, 3, H, W]   (NCHW, raw 0..255)
 *   mask  : uint8 [batch, 1, H, W]   (1 = remove)
 *   result: uint8 [batch, 3, H, W]   (inpainted)
 * It's a "pipeline" export (does its own normalization), so we feed raw bytes.
 * We still composite the result back over the original through the mask so only
 * the painted region changes — robust regardless of the model's edge handling.
 */

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
const ORT_URL = ORT_BASE + 'ort.min.js';
const MODEL_URL = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
// Work size cap — MI-GAN handles arbitrary H/W, but we bound it for speed/memory
// on weak devices and composite back at full resolution.
const MAX_EDGE = 768;

export interface InpaintProgress { phase: string; ratio: number }

let _ort: any = null;
let _session: Promise<any> | null = null;

async function loadOrt(): Promise<any> {
  if (_ort) return _ort;
  await new Promise<void>((res, rej) => {
    if ((window as any).ort) { res(); return; }
    const s = document.createElement('script');
    // crossOrigin: the site is cross-origin-isolated (COEP); a no-CORS cross-origin
    // script is blocked (net::ERR_BLOCKED_BY_ORB). The CDN sends ACAO:*, so request it with CORS.
    s.crossOrigin = 'anonymous';
    s.src = ORT_URL; s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('Could not load the inference runtime'));
    document.head.appendChild(s);
  });
  _ort = (window as any).ort;
  try { _ort.env.wasm.wasmPaths = ORT_BASE; } catch { /* */ }
  return _ort;
}

async function getSession(onProgress?: (p: InpaintProgress) => void): Promise<any> {
  if (_session) return _session;
  _session = (async () => {
    onProgress?.({ phase: 'Loading runtime', ratio: 0.05 });
    const ort = await loadOrt();
    onProgress?.({ phase: 'Downloading model', ratio: 0.1 });
    const resp = await fetch(MODEL_URL);
    if (!resp.ok || !resp.body) throw new Error('Could not download the inpainting model');
    const total = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.({ phase: 'Downloading model', ratio: 0.1 + (received / total) * 0.75 });
    }
    const bytes = new Uint8Array(received);
    let off = 0; for (const c of chunks) { bytes.set(c, off); off += c.length; }
    onProgress?.({ phase: 'Preparing model', ratio: 0.88 });
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    onProgress?.({ phase: 'Ready', ratio: 1 });
    return session;
  })();
  _session.catch(() => { _session = null; }); // allow retry on failure
  return _session;
}

/** Whether the model is already loaded (so the UI can skip the download notice). */
export function inpaintReady(): boolean { return _session != null && _ort != null; }

/**
 * Inpaint `image` where `mask` is white. Both canvases share the source size.
 * Returns a canvas with the masked region filled; only masked pixels change.
 */
export async function inpaint(
  image: HTMLCanvasElement, mask: HTMLCanvasElement,
  onProgress?: (p: InpaintProgress) => void,
): Promise<HTMLCanvasElement> {
  const ort = await loadOrt();
  const session = await getSession(onProgress);
  onProgress?.({ phase: 'Removing', ratio: 0.92 });

  const W = image.width, H = image.height;
  // Work at a bounded, even size (MI-GAN strides need divisibility; round to 8).
  const scale = Math.min(1, MAX_EDGE / Math.max(W, H));
  const wW = Math.max(8, Math.round((W * scale) / 8) * 8);
  const wH = Math.max(8, Math.round((H * scale) / 8) * 8);

  const sImg = scaleTo(image, wW, wH);
  const sMask = scaleTo(mask, wW, wH);
  const imgData = sImg.getContext('2d')!.getImageData(0, 0, wW, wH).data;
  const maskData = sMask.getContext('2d')!.getImageData(0, 0, wW, wH).data;

  const n = wW * wH;
  // NCHW uint8 image.
  const imgArr = new Uint8Array(3 * n);
  for (let i = 0; i < n; i++) {
    imgArr[i] = imgData[i * 4];
    imgArr[n + i] = imgData[i * 4 + 1];
    imgArr[2 * n + i] = imgData[i * 4 + 2];
  }
  // 1-channel uint8 mask: 1 where to remove.
  const maskArr = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskArr[i] = maskData[i * 4] > 127 ? 1 : 0;

  const imgT = new ort.Tensor('uint8', imgArr, [1, 3, wH, wW]);
  const mskT = new ort.Tensor('uint8', maskArr, [1, 1, wH, wW]);
  const out = await session.run({ image: imgT, mask: mskT });
  const res = (out.result ?? out[Object.keys(out)[0]]).data as Uint8Array;

  // result is NCHW uint8 → draw to a small canvas.
  const filledSmall = document.createElement('canvas');
  filledSmall.width = wW; filledSmall.height = wH;
  const fctx = filledSmall.getContext('2d')!;
  const fImg = fctx.createImageData(wW, wH);
  for (let i = 0; i < n; i++) {
    fImg.data[i * 4] = res[i];
    fImg.data[i * 4 + 1] = res[n + i];
    fImg.data[i * 4 + 2] = res[2 * n + i];
    fImg.data[i * 4 + 3] = 255;
  }
  fctx.putImageData(fImg, 0, 0);

  // Composite: original, then ONLY the masked region from the (upscaled) output
  // so unmasked pixels stay pixel-perfect at full resolution.
  const result = document.createElement('canvas');
  result.width = W; result.height = H;
  const rctx = result.getContext('2d')!;
  rctx.drawImage(image, 0, 0);
  const filledFull = scaleTo(filledSmall, W, H);
  const maskFull = scaleTo(mask, W, H);
  const fctx2 = filledFull.getContext('2d')!;
  fctx2.globalCompositeOperation = 'destination-in';
  fctx2.drawImage(maskFull, 0, 0);
  rctx.drawImage(filledFull, 0, 0);
  onProgress?.({ phase: 'Done', ratio: 1 });
  return result;
}

function scaleTo(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0, w, h);
  return c;
}
