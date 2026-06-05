type ProgressFn = (phase: string, ratio: number) => void;

let modelPromise: Promise<any> | null = null;

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
      const cat = maskData[my * mw + mx];
      const o = (y * src.width + x) * 4;
      if (cat === 0) img.data[o + 3] = 0;
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
  let sx = 0, sy = 0, n = 0, minX = mw, minY = mh, maxX = 0, maxY = 0;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (data[y * mw + x] !== 0) { // foreground
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
