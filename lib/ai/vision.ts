/**
 * vision — the model's EYES. SmolVLM-256M image understanding, finally active in
 * the browser. The v3 brain we trained FROZE the vision tower, so v3's vision IS
 * base SmolVLM-256M's vision encoder — which ships as ONNX (q4 ≈ 128MB, under the
 * 180MB budget). It needs transformers.js v3 (@huggingface/transformers), which we
 * add ONLY for this path (the rest of the stack stays on @xenova/transformers v2,
 * so nothing existing changes).
 *
 * Loaded from the official HF CDN (base model is public — not our IP; our
 * fine-tuned PLANNING decoder stays separate + encrypted). VQA covers the owner's
 * cases: "what is this?", read a label/sign, "is this product ok for X?" (describe
 * → the answer engine reasons + searches). Output is English; the respond()
 * translation shell renders it in the user's language.
 */

const MODEL = 'HuggingFaceTB/SmolVLM-256M-Instruct';
const isBrowser = typeof window !== 'undefined';

// Lazy singletons — the ~128MB q4 model loads on first image, not at boot.
let _p: Promise<{ processor: any; model: any } | null> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
async function load() {
  _p ??= (async () => {
    try {
      const lib: any = await import('@huggingface/transformers'); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isBrowser) { lib.env.allowLocalModels = false; lib.env.allowRemoteModels = true; }
      const processor = await lib.AutoProcessor.from_pretrained(MODEL);
      const model = await lib.AutoModelForVision2Seq.from_pretrained(MODEL, {
        dtype: { embed_tokens: 'fp16', vision_encoder: 'q4', decoder_model_merged: 'q4' },
      });
      return { processor, model };
    } catch { return null; }
  })();
  return _p;
}

/** Whether vision is available this session (model loaded). */
export async function visionReady(): Promise<boolean> { return (await load()) != null; }

export type ImageInput = string | Blob; // URL/data-URL or a File/Blob

/**
 * Answer a question about an image (VQA), or describe it when no question given.
 * Returns the model's text, or null when vision is unavailable (→ caller falls
 * back to OCR / honest "can't see it"). English out; shell localizes.
 */
export async function askImage(image: ImageInput, question = 'Describe this image in one or two sentences.'): Promise<string | null> {
  const r = await load();
  if (!r) return null;
  try {
    const lib: any = await import('@huggingface/transformers'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const img = typeof image === 'string' ? await lib.load_image(image) : await lib.RawImage.fromBlob(image);
    const messages = [{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: question }] }];
    const prompt = r.processor.apply_chat_template(messages, { add_generation_prompt: true });
    const inputs = await r.processor(prompt, [img], { do_image_splitting: false });
    const gen = await r.model.generate({ ...inputs, max_new_tokens: 96, do_sample: false });
    const decoded = r.processor.batch_decode(gen.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true });
    const out = (decoded?.[0] || '').trim();
    return out || null;
  } catch { return null; }
}
