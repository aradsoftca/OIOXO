/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Segment Anything (SAM) in the browser via transformers.js — "click an object,
 * get a precise cutout". Uses the small web-optimized SlimSAM model.
 *
 * Flow: prepare() runs the heavy image encoder ONCE (cached embeddings); then
 * segment() is fast per click, decoding a mask from the clicked point(s).
 */

let modelP: Promise<any> | null = null;
let procP: Promise<any> | null = null;
const MODEL = 'Xenova/slimsam-77-uniform';

async function getModel(onProgress?: (p: any) => void) {
  // transformers.js v3 first: v2 (@xenova 2.17.2) imports ort-wasm-simd-threaded.jsep.mjs,
  // which its ORT never shipped → 404 in the cross-origin-isolated tab (same fix as
  // engines/transcribe). Found live by scripts/live_sweep.mjs.
  const t: any = await import('@huggingface/transformers').catch(() => null) ?? await import('@xenova/transformers'); // eslint-disable-line @typescript-eslint/no-explicit-any
  t.env.allowLocalModels = false;
  if (!modelP) {
    const p = t.SamModel.from_pretrained(MODEL, { quantized: true, progress_callback: onProgress });
    // Drop the cache on rejection so a transient model-download failure
    // doesn't permanently break smart-cutout until the page reloads.
    p.catch(() => { modelP = null; });
    modelP = p;
  }
  if (!procP) {
    const p = t.AutoProcessor.from_pretrained(MODEL);
    p.catch(() => { procP = null; });
    procP = p;
  }
  return { t, model: await modelP, processor: await procP };
}

export interface SamSession {
  model: any;
  processor: any;
  imageInputs: any;
  embeddings: any;
  width: number;
  height: number;
}

export interface SamPoint { x: number; y: number; label: 0 | 1 } // pixel coords; 1=keep, 0=exclude

export async function prepare(blob: Blob, onProgress?: (p: any) => void): Promise<SamSession> {
  const { t, model, processor } = await getModel(onProgress);
  const url = URL.createObjectURL(blob);
  let image: any;
  try { image = await t.RawImage.read(url); } finally { URL.revokeObjectURL(url); }
  const imageInputs = await processor(image);
  const embeddings = await model.get_image_embeddings(imageInputs);
  return { model, processor, imageInputs, embeddings, width: image.width, height: image.height };
}

export interface SamMask { alpha: Uint8Array; width: number; height: number }

export async function segment(s: SamSession, points: SamPoint[]): Promise<SamMask> {
  const pts = [points.map((p) => [p.x, p.y])];      // [point_batch=1, nb_points, 2]
  const labels = [points.map((p) => p.label)];       // [point_batch=1, nb_points]
  const input_points = s.processor.reshape_input_points(pts, s.imageInputs.original_sizes, s.imageInputs.reshaped_input_sizes);
  const input_labels = s.processor.add_input_labels(labels, input_points);

  const outputs = await s.model({ ...s.embeddings, input_points, input_labels });
  const masks = await s.processor.post_process_masks(outputs.pred_masks, s.imageInputs.original_sizes, s.imageInputs.reshaped_input_sizes);

  const maskTensor = masks[0];                       // dims: [.. , num_masks, H, W]
  const dims: number[] = maskTensor.dims;
  const W = dims[dims.length - 1];
  const H = dims[dims.length - 2];
  const numMasks = dims[dims.length - 3] ?? 1;
  const plane = W * H;

  // Pick the highest-confidence of SAM's candidate masks.
  const scores: ArrayLike<number> = outputs.iou_scores.data;
  let best = 0;
  for (let i = 1; i < numMasks && i < scores.length; i++) if (scores[i] > scores[best]) best = i;

  const data: ArrayLike<number> = maskTensor.data;   // flattened booleans (0/1)
  const offset = best * plane;
  const alpha = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) alpha[i] = data[offset + i] ? 255 : 0;
  return { alpha, width: W, height: H };
}
