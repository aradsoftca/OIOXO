type ProgressFn = (phase: string, ratio: number) => void;

let modelPromise: Promise<any> | null = null;

/**
 * Robustly decide which mask label is the SUBJECT to KEEP. The selfie segmenter
 * normally labels person=non-zero / background=0, but the labels can be flipped
 * by model build, and on ambiguous/non-selfie content the model can confidently
 * invert — which is what caused "Remove BG erased the subject and kept the
 * background" in the audit.
 *
 * Prior: the background hugs the image borders; the subject is central. We count
 * how strongly each label touches the border ring vs how much of the frame it
 * fills. The label that dominates the border is the background, so we keep the
 * OTHER one. Returns true if the non-zero label is the subject to keep.
 */
function subjectIsNonZero(mask: Uint8Array, mw: number, mh: number): boolean {
  let nonZero = 0;
  let borderNonZero = 0;
  let borderTotal = 0;
  for (let y = 0; y < mh; y++) {
    const onVBorder = y === 0 || y === mh - 1;
    for (let x = 0; x < mw; x++) {
      const isBorder = onVBorder || x === 0 || x === mw - 1;
      const nz = mask[y * mw + x] !== 0;
      if (nz) nonZero++;
      if (isBorder) {
        borderTotal++;
        if (nz) borderNonZero++;
      }
    }
  }
  const total = mw * mh;
  const zero = total - nonZero;
  // Fraction of the BORDER ring occupied by each label.
  const borderNonZeroFrac = borderTotal ? borderNonZero / borderTotal : 0;
  const borderZeroFrac = 1 - borderNonZeroFrac;
  // The background is the label that fills most of the border. Keep the other.
  // Tie-break (rare) toward the conventional person=non-zero so normal selfies
  // are unaffected.
  if (Math.abs(borderNonZeroFrac - borderZeroFrac) < 0.02) {
    // Border is split — fall back to "subject is the smaller region" (a subject
    // rarely fills more than the background), defaulting to non-zero on a tie.
    return nonZero <= zero;
  }
  return borderNonZeroFrac < borderZeroFrac;
}

async function loadSelfieSegmenter() {
  if (modelPromise) return modelPromise;
  const p = (async () => {
    const url = 'https://esm.run/@mediapipe/tasks-vision';
    const mp: any = await (new Function('u', 'return import(u)'))(url);
    const fileset = await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm');
    const seg = await mp.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    return seg;
  })();
  modelPromise = p;
  // Drop the cache on rejection so a transient CDN/network failure doesn't
  // permanently disable studio Auto-BG-Remove for the session.
  p.catch(() => { if (modelPromise === p) modelPromise = null; });
  return p;
}

export async function removeBackgroundAuto(src: HTMLCanvasElement, onProgress?: ProgressFn): Promise<HTMLCanvasElement> {
  onProgress?.('Loading model…', 0.05);
  const seg = await loadSelfieSegmenter();
  onProgress?.('Segmenting…', 0.4);

  const result = seg.segment(src);
  const mask = result.categoryMask;
  if (!mask) throw new Error('Segmentation produced no mask');
  const maskData: Uint8Array = mask.getAsUint8Array();
  const mw = mask.width, mh = mask.height;

  // Decide which mask label is the SUBJECT (keep) vs BACKGROUND (cut). The selfie
  // segmenter usually labels person=non-zero, background=0 — but the labels can
  // be flipped depending on the model build, and on non-selfie content the model
  // can confidently mislabel, producing the catastrophic "erased the subject,
  // kept the background" inversion the audit caught. So instead of trusting a
  // fixed label we use a robust prior: the BACKGROUND is the region that hugs the
  // image borders. We measure how much each label touches the border vs the
  // interior and keep whichever label is more "central".
  const keepNonZero = subjectIsNonZero(maskData, mw, mh);

  onProgress?.('Compositing…', 0.85);
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);

  const sx = mw / src.width;
  const sy = mh / src.height;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const mx = Math.min(mw - 1, Math.floor(x * sx));
      const my = Math.min(mh - 1, Math.floor(y * sy));
      const isNonZero = maskData[my * mw + mx] !== 0;
      const isSubject = keepNonZero ? isNonZero : !isNonZero;
      const o = (y * src.width + x) * 4;
      if (!isSubject) img.data[o + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  try { mask.close?.(); } catch {}

  onProgress?.('Done', 1);
  return out;
}

/**
 * Find the subject's centroid + bounding box (normalized 0..1) by running the
 * selfie segmenter once. Used for auto-reframe (smart crop to 9:16 etc. keeping
 * the person in frame). Returns null if no subject is found (caller centers).
 */
export async function findSubjectCenter(src: HTMLCanvasElement): Promise<{ cx: number; cy: number; minX: number; minY: number; maxX: number; maxY: number } | null> {
  const seg = await loadSelfieSegmenter();
  const result = seg.segment(src);
  const mask = result.categoryMask;
  if (!mask) return null;
  const data: Uint8Array = mask.getAsUint8Array();
  const mw = mask.width, mh = mask.height;
  const keepNonZero = subjectIsNonZero(data, mw, mh);
  let sx = 0, sy = 0, n = 0, minX = mw, minY = mh, maxX = 0, maxY = 0;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const isNonZero = data[y * mw + x] !== 0;
      if (keepNonZero ? isNonZero : !isNonZero) { // foreground
        sx += x; sy += y; n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  try { mask.close?.(); } catch {}
  if (n < mw * mh * 0.01) return null; // too little foreground → no clear subject
  return { cx: sx / n / mw, cy: sy / n / mh, minX: minX / mw, minY: minY / mh, maxX: maxX / mw, maxY: maxY / mh };
}

/**
 * Object-aware "Select Subject": run the segmenter and return a full-size mask
 * canvas where the subject (foreground) is opaque white and everything else is
 * transparent — exactly the shape an image editor's selection wants. Powers the
 * one-click "select the subject" Ferrari (vs hand-tracing or color magic-wand).
 * Returns null if no clear subject (caller can fall back to magic-wand).
 */
export async function subjectMask(src: HTMLCanvasElement, onProgress?: ProgressFn): Promise<HTMLCanvasElement | null> {
  onProgress?.('Loading model…', 0.05);
  const seg = await loadSelfieSegmenter();
  onProgress?.('Finding subject…', 0.5);
  const result = seg.segment(src);
  const mask = result.categoryMask;
  if (!mask) return null;
  const maskData: Uint8Array = mask.getAsUint8Array();
  const mw = mask.width, mh = mask.height;
  // Same border-based anti-inversion guard as removeBackgroundAuto.
  const keepNonZero = subjectIsNonZero(maskData, mw, mh);

  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(src.width, src.height);
  const sx = mw / src.width, sy = mh / src.height;
  let fg = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const mx = Math.min(mw - 1, Math.floor(x * sx));
      const my = Math.min(mh - 1, Math.floor(y * sy));
      const o = (y * src.width + x) * 4;
      const isNonZero = maskData[my * mw + mx] !== 0;
      const isSubject = keepNonZero ? isNonZero : !isNonZero;
      if (isSubject) { // foreground
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = 255;
        fg++;
      } else {
        img.data[o + 3] = 0;
      }
    }
  }
  try { mask.close?.(); } catch {}
  if (fg < src.width * src.height * 0.01) return null; // no clear subject
  ctx.putImageData(img, 0, 0);
  onProgress?.('Done', 1);
  return out;
}

export async function removeBackgroundByLuma(src: HTMLCanvasElement, tolerance = 32): Promise<HTMLCanvasElement> {
  const w = src.width, h = src.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < w; i++) {
    const top = i * 4;
    const bot = ((h - 1) * w + i) * 4;
    samples.push([data[top], data[top + 1], data[top + 2]]);
    samples.push([data[bot], data[bot + 1], data[bot + 2]]);
  }
  for (let j = 0; j < h; j++) {
    const left = (j * w) * 4;
    const right = (j * w + (w - 1)) * 4;
    samples.push([data[left], data[left + 1], data[left + 2]]);
    samples.push([data[right], data[right + 1], data[right + 2]]);
  }
  let tr = 0, tg = 0, tb = 0;
  for (const [r, g, b] of samples) { tr += r; tg += g; tb += b; }
  tr /= samples.length; tg /= samples.length; tb /= samples.length;

  const tol2 = tolerance * tolerance * 3;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb;
    const d2 = dr * dr + dg * dg + db * db;
    if (d2 < tol2) {
      const a = Math.max(0, Math.min(255, Math.floor(255 * (d2 / tol2))));
      data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
