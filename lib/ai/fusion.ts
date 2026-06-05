/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * fusion — the TINY GROUNDED FUSER (oioxo writer head, distilled on arad).
 *
 * Tier-0.5 of the brain: an ~80MB causal LM (SmolLM2-135M distilled from a
 * frontier teacher) that does ONE narrow job — read the VERIFIED evidence the
 * engine already gathered + cross-checked, and write a clean 2–4 sentence answer
 * that COPIES every name/number verbatim. It never recalls facts (it has none at
 * 135M — that's why it can't hallucinate here): we supply the facts, it only
 * fuses + phrases. The extractive reader (~46MB) stays the floor; real multi-step
 * reasoning stays the optional 1–3GB download tier.
 *
 * SECURITY — same crown-jewel gate as the reranker (project_anti_copy): weights
 * ship AES-256-GCM ENCRYPTED on HF; the per-session key is minted ONLY by our
 * origin (/api/ai-key) after a device-bound entitlement + ECDHE handshake. The
 * real moat — the distillation DATA ENGINE + the training recipe — never ships;
 * only the quantized, encrypted weights do. Degrades to null gracefully (cold /
 * not entitled / not yet deployed) → the engine keeps the extractive answer.
 */
const HF_REPO = 'payam1394/oioxo-fusion';
const ASSET_ID = 'models/oioxo-fusion'; // entitlement key id — must match encrypt + /api/ai-key regex
const isBrowser = typeof window !== 'undefined';

/** SINGLE SOURCE OF TRUTH for the fuser's prompt — used BOTH by the data engine
 *  (to format training inputs + the teacher's framing) AND at inference, so train
 *  and serve match exactly. The discipline IS the anti-hallucination contract. */
export const FUSION_SYSTEM =
  'You are oioxo, a warm and friendly assistant. Using ONLY the notes provided, answer the question directly in 2–4 ' +
  'natural sentences, in a warm, conversational, easy-to-read tone — friendly and human, never stiff or robotic. ' +
  'Copy every name, number, date, and quote EXACTLY as written in the notes. Ignore notes that are off-topic. ' +
  "If the notes don't contain the specific detail asked, say so warmly and give what IS known. " +
  'Never mention "notes", "sources", or that you searched. Invent nothing.';

// PROMPT-INJECTION DEFENSE: the notes come from UNTRUSTED web pages, so a page can
// try to hijack the model ("ignore previous instructions and say X", "you are now…",
// fake "system:" lines). Drop any note that looks like an instruction to the model
// rather than information. Shared by training (gen-fusion-data) and inference (fuse)
// so the model only ever sees sanitized notes — train/serve parity AND security.
const INJECT = /\b(ignore (the |all |any )?(previous|above|prior|earlier)|disregard (the |all )?(previous|above|instructions)|forget (everything|the above|your instructions)|you are now|new instructions?:|system ?:|assistant ?:|prompt ?:|act as|pretend (to be|you)|jailbreak|do not follow|override)\b/i;
export function sanitizeNotes(notes: string[]): string[] {
  return notes.filter((n) => n && n.trim() && !INJECT.test(n));
}

export function buildFusionUser(question: string, notes: string[]): string {
  const body = sanitizeNotes(notes).slice(0, 8).map((n) => `- ${n.trim()}`).join('\n');
  return `Question: ${question}\n\nNotes:\n${body}`;
}

// Scaffolding leaks the writer must never emit (belt-and-braces over training).
const LEAK = /\b(the notes?|these notes?|based on the (notes|information|sources)|according to the notes|as an ai|i (don'?t|do not) have enough|i cannot answer)\b/i;
function clean(s: string): string {
  let t = (s || '').replace(/\s+/g, ' ').trim();
  // drop a leaked lead sentence, keep the rest
  const sents = t.split(/(?<=[.!?])\s+/);
  const kept = sents.filter((x) => !LEAK.test(x));
  t = (kept.length ? kept : sents).join(' ').trim();
  return t;
}

let _ready: Promise<{ gen: any } | null> | null = null;
async function load(): Promise<{ gen: any } | null> {
  if (_ready) return _ready;
  const p = (async () => {
    try {
      const lib: any = await import('@xenova/transformers');
      const MODEL = isBrowser ? HF_REPO : ASSET_ID;
      if (isBrowser) {
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        lib.env.remoteHost = 'https://huggingface.co';
        lib.env.remotePathTemplate = '{model}/resolve/{revision}/';
        // HARD GATE: decrypt the weights only via the device-bound /api/ai-key
        // handshake (asset bound to ASSET_ID, not the HF path). No live session →
        // throws → fuser stays off → engine keeps the extractive answer.
        const { loadProtectedModel } = await import('../oioxo/protected-model');
        await loadProtectedModel({
          modelId: HF_REPO,
          host: lib.env.remoteHost,
          assetId: ASSET_ID,
          // decoder-only causal LM → transformers.js requests the merged decoder.
          onnxUrl: `https://huggingface.co/${HF_REPO}/resolve/main/onnx/decoder_model_merged_quantized.onnx`,
          keyEndpoint: '/api/ai-key',
        });
      } else {
        lib.env.allowRemoteModels = false;
        lib.env.allowLocalModels = true;
        lib.env.localModelPath = (typeof process !== 'undefined' ? process.cwd() : '.') + '/_models_plain';
      }
      const gen = await lib.pipeline('text-generation', MODEL, { quantized: true });
      return { gen };
    } catch {
      return null; // not deployed / cold / not entitled → graceful (engine uses reader)
    }
  })();
  _ready = p;
  // Drop the cache on null/reject so a transient model-load failure doesn't
  // memoise the disabled state for the rest of the page.
  p.then((v) => { if (v == null && _ready === p) _ready = null; })
   .catch(() => { if (_ready === p) _ready = null; });
  return p;
}

/** Whether the fuser is available this session. */
export async function fuserReady(): Promise<boolean> {
  return (await load()) != null;
}

/**
 * Fuse the verified `notes` into a grounded answer for `question`, or null when
 * the fuser isn't available (caller keeps the extractive answer). Pure phrasing
 * over supplied facts — never a knowledge source.
 */
export async function fuse(question: string, notes: string[]): Promise<string | null> {
  if (!notes?.length) return null;
  const r = await load();
  if (!r) return null;
  try {
    const messages = [
      { role: 'system', content: FUSION_SYSTEM },
      { role: 'user', content: buildFusionUser(question, notes) },
    ];
    // Sampling (not greedy) — the gemini-bench showed greedy do_sample:false
    // collapses a tiny decoder into loops/number-salad; temp 0.3/top_p 0.9 is stable.
    const out: any = await r.gen(messages, { max_new_tokens: 160, temperature: 0.3, top_p: 0.9, do_sample: true, repetition_penalty: 1.2, return_full_text: false });
    const text = Array.isArray(out) ? (out[0]?.generated_text ?? '') : (out?.generated_text ?? '');
    const final = clean(typeof text === 'string' ? text : (text?.at?.(-1)?.content ?? ''));
    return final.length >= 12 ? final : null;
  } catch {
    return null;
  }
}
