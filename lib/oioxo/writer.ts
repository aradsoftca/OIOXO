/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo on-device WRITER (client) — the distilled q4 model
 * (payam1394/oioxo-writer8) runs in a Web Worker (./writer.worker.ts) on WebGPU
 * (fast) with a WASM fallback, so generation NEVER freezes the UI thread. This
 * module builds the prompts (the canonical train/serve templates) and
 * round-trips them to the worker. Token caps are kept tight for speed; the
 * worker forbids repeated 3-grams to prevent degenerate loops.
 *
 * SSR / no-Worker → generate() returns '' and callers fall back to the instant
 * deterministic digest (the analyze stage), so an answer is never blocked.
 */

let _worker: Worker | null = null;
let _backend: 'webgpu' | 'wasm' | null = null;
const _pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();
let _seq = 0;

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null; // SSR / very old browsers
  if (!_worker) {
    _worker = new Worker(new URL('./writer.worker.ts', import.meta.url));
    _worker.onmessage = (e: MessageEvent) => {
      const m: any = e.data || {};
      if (m.type === 'backend') { _backend = m.backend; return; }
      const p = _pending.get(m.id);
      if (!p) return;
      _pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(typeof m.text === 'string' ? m.text : '');
    };
    _worker.onerror = (ev) => {
      const err = new Error(ev.message || 'writer worker crashed');
      for (const p of _pending.values()) p.reject(err);
      _pending.clear();
      _worker = null; // allow a fresh spawn next time
    };
  }
  return _worker;
}

/** Which backend the worker is running on ('webgpu' | 'wasm'), or null if not
 *  loaded yet — for an optional UI hint. */
export function writerBackend(): 'webgpu' | 'wasm' | null {
  return _backend;
}

/** Round-trip one generation to the worker (off the main thread). Resolves '' if
 *  there's no worker (SSR) so the caller falls back to the digest. */
function generate(prompt: string, maxNew: number): Promise<string> {
  const w = ensureWorker();
  if (!w) return Promise.resolve('');
  return new Promise<string>((resolve, reject) => {
    const id = ++_seq;
    _pending.set(id, { resolve, reject });
    w.postMessage({ id, prompt, maxNew });
  });
}

/** 2–3 sentence summary of the given source text. */
export function summarize(text: string): Promise<string> {
  return generate(`Summarize the following clearly in 2-3 sentences:\n\n${text.slice(0, 6000)}`, 150);
}

/** Short, engaging article grounded only in the given facts. */
export function writeArticle(text: string): Promise<string> {
  return generate(`Write a short, engaging article (about 120 words) based only on the facts below:\n\n${text.slice(0, 6000)}`, 200);
}

// ── CANONICAL synthesis prompts ────────────────────────────────────────────
// These EXACT templates are the train/serve contract: writer8's distillation
// set (scripts/gen_brief_data.py) generates targets from these same prompts. If
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
export function answerFromNotes(question: string, notes: string): Promise<string> {
  const prompt =
    `${PERSONA}\n\n` +
    `Answer the question in 2-4 clear sentences. If it asks for an opinion or judgment, ` +
    `give the honest case briefly and then a clear take; otherwise answer directly. ` +
    `If the notes lack the specific detail, say what IS known.\n\n` +
    `Notes:\n${notes.slice(0, 4000)}\n\nQuestion: ${question}`;
  return generate(prompt, 160);
}

/** Weigh options from the brief and RECOMMEND — a real decision answer, not a
 *  snippet. Notes are labelled per option so the model keeps the sides distinct. */
export function compareFromNotes(question: string, notes: string): Promise<string> {
  const prompt =
    `${PERSONA}\n\n` +
    `Help the person decide. In 3-5 sentences: what each option is known for, the key ` +
    `difference, who each suits — then a short, clear recommendation. If the notes don't ` +
    `favour one, say it honestly depends on priorities.\n\n` +
    `Notes:\n${notes.slice(0, 4000)}\n\nQuestion: ${question}`;
  return generate(prompt, 200);
}

/** A warm, natural conversational turn — the "talk" move (no search, no list). */
export function converseReply(message: string, history?: string): Promise<string> {
  const convo = history ? `Conversation so far:\n${history}\n\n` : '';
  const prompt =
    `You are oioxo, a warm, upbeat and lightly witty assistant. Reply to the user in 1-2 short, ` +
    `friendly, encouraging sentences — natural conversation, no lists, no sources, no preamble.\n\n` +
    `${convo}User: ${message}\noioxo:`;
  return generate(prompt, 70);
}
