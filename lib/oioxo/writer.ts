/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo on-device WRITER — our distilled 135M model (payam1394/oioxo-writer),
 * run in the browser via transformers.js v3/v4 (@huggingface/transformers) with
 * dtype 'q4' → loads the ~91MB q4 weights. Produces summaries / short articles
 * from source text, privately, no server. Loaded once; cached after first fetch.
 */
const MODEL = 'payam1394/oioxo-writer';

let _pipe: any = null;
let _loading: Promise<any> | null = null;

export function writerLoaded(): boolean {
  return !!_pipe;
}

/** Load (once) the writer pipeline at q4 (~91MB), reporting 0..1 progress. */
export function loadWriter(onProgress?: (p: number) => void): Promise<any> {
  if (_pipe) {
    onProgress?.(1);
    return Promise.resolve(_pipe);
  }
  _loading ??= (async () => {
    const lib: any = await import('@huggingface/transformers');
    try {
      lib.env.allowLocalModels = false;
      lib.env.allowRemoteModels = true;
    } catch {
      /* env shape differs across versions */
    }
    const fileProg: Record<string, number> = {};
    _pipe = await lib.pipeline('text-generation', MODEL, {
      dtype: 'q4', // loads onnx/model_q4.onnx (~91MB)
      progress_callback: (p: any) => {
        if (!onProgress || !p) return;
        if (p.status === 'progress' && typeof p.progress === 'number' && p.file) {
          fileProg[p.file] = p.progress;
          const vals = Object.values(fileProg);
          onProgress(Math.min(0.99, vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length) / 100));
        } else if (p.status === 'ready') {
          onProgress(1);
        }
      },
    });
    return _pipe;
  })();
  return _loading;
}

async function generate(userPrompt: string, maxNew: number, onProgress?: (p: number) => void): Promise<string> {
  const pipe = await loadWriter(onProgress);
  const res: any = await pipe([{ role: 'user', content: userPrompt }], {
    max_new_tokens: maxNew,
    do_sample: false,
  });
  return extractText(res);
}

/** 2–3 sentence summary of the given source text. */
export function summarize(text: string, onProgress?: (p: number) => void): Promise<string> {
  return generate(`Summarize the following clearly in 2-3 sentences:\n\n${text.slice(0, 6000)}`, 180, onProgress);
}

/** Short, engaging article grounded only in the given facts. */
export function writeArticle(text: string, onProgress?: (p: number) => void): Promise<string> {
  return generate(`Write a short, engaging article (about 120 words) based only on the facts below:\n\n${text.slice(0, 6000)}`, 260, onProgress);
}

// ── CANONICAL synthesis prompts ────────────────────────────────────────────
// These EXACT templates are the train/serve contract: writer8's distillation
// set (scripts/gen_synth_data.py) generates targets from these same prompts. If
// you change wording here, change it there too — a prompt the model never saw in
// training is the bug that made compare/opinion answers fail. (ANSWER_BRAIN.md §9)
//
// oioxo's persona is part of the instruction: warm, clear, confident, a little
// witty, never robotic — and strictly grounded in the notes.

const PERSONA =
  "You are oioxo — warm, clear and natural, a little witty, never robotic. " +
  "Use ONLY the notes below; add nothing that isn't in them; never mention " +
  '"notes" or sources, and never start with a preamble like "Here is".';

/** Answer a question from the gathered brief, in our voice. ONE adaptive
 *  instruction (model-first): it handles a plain fact, an explanation, OR an
 *  opinion/judgment — for an opinion it gives a brief balanced view then a clear
 *  take — without the engine needing to pre-classify the shape. */
export function answerFromNotes(question: string, notes: string, onProgress?: (p: number) => void): Promise<string> {
  const prompt =
    `${PERSONA}\n\n` +
    `Answer the question in 2-4 clear sentences. If it asks for an opinion or judgment, ` +
    `give the honest case briefly and then a clear take; otherwise answer directly. ` +
    `If the notes lack the specific detail, say what IS known.\n\n` +
    `Notes:\n${notes.slice(0, 4000)}\n\nQuestion: ${question}`;
  return generate(prompt, 220, onProgress);
}

/** Weigh options from the brief and RECOMMEND — a real decision answer, not a
 *  snippet. Notes are labelled per option so the model keeps the sides distinct. */
export function compareFromNotes(question: string, notes: string, onProgress?: (p: number) => void): Promise<string> {
  const prompt =
    `${PERSONA}\n\n` +
    `Help the person decide. In 3-5 sentences: what each option is known for, the key ` +
    `difference, who each suits — then a short, clear recommendation. If the notes don't ` +
    `favour one, say it honestly depends on priorities.\n\n` +
    `Notes:\n${notes.slice(0, 4000)}\n\nQuestion: ${question}`;
  return generate(prompt, 280, onProgress);
}

/** A warm, natural conversational turn — the "talk" move (no search, no list).
 *  oioxo's persona: upbeat, encouraging, lightly witty, always kind. (writer8's
 *  persona training makes this shine; until then it's base-model best-effort and
 *  the caller keeps a deterministic fallback.) */
export function converseReply(message: string, history?: string, onProgress?: (p: number) => void): Promise<string> {
  const convo = history ? `Conversation so far:\n${history}\n\n` : '';
  const prompt =
    `You are oioxo, a warm, upbeat and lightly witty assistant. Reply to the user in 1-2 short, ` +
    `friendly, encouraging sentences — natural conversation, no lists, no sources, no preamble.\n\n` +
    `${convo}User: ${message}\noioxo:`;
  return generate(prompt, 90, onProgress);
}

function extractText(res: any): string {
  if (typeof res === 'string') return res.trim();
  if (Array.isArray(res)) {
    const first = res[0];
    const gt = first?.generated_text ?? first;
    if (typeof gt === 'string') return gt.trim();
    if (Array.isArray(gt)) {
      const last = gt[gt.length - 1];
      return typeof last?.content === 'string' ? last.content.trim() : '';
    }
  }
  return '';
}
