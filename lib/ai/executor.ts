/**
 * Xonvert AI — plan executor (the assistant's hands).
 *
 * Given an ordered Plan from the planner, this runs each step for real by
 * threading one working file through the chain: the output of step N becomes the
 * input of step N+1, and only the final result is shown. Image/audio steps reuse
 * the validated inline capabilities; PDF and document steps call the same
 * headless engines the tool pages use. A step with no runner stops the chain
 * cleanly so the caller can hand the rest off as guided tool cards.
 *
 * Everything runs on-device — the file never leaves the browser.
 */

import { planConvert, runConvert, fileCategory, type ActionResult } from '@/lib/ai-actions';
import type { PlanStep } from './planner';
import { inlineCap } from './capabilities';
import { textOpFor } from './text-ops';

/** A step runner turns a working file + extracted params into a new file. */
export type StepRunner = (file: File, params: Record<string, unknown>, clause: string) => Promise<ActionResult>;

function baseName(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(0, dot) : file.name;
}

/** Bytes from an ActionResult so the next step can consume them as a File. */
function resultToFile(res: ActionResult, fallbackName: string): File | null {
  if (res.kind === 'file') return new File([res.blob], res.filename, { type: res.blob.type });
  if (res.kind === 'image' && res.blob) return new File([res.blob], res.filename ?? fallbackName, { type: res.blob.type });
  return null;
}

function pdfResult(bytes: Uint8Array, filename: string, note?: string): ActionResult {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { kind: 'file', blob: new Blob([buf], { type: 'application/pdf' }), filename, note };
}

/** 1-based page numbers from the planner → 0-based indices pdf-lib expects. */
function pageIndices(params: Record<string, unknown>, pageCount: number): number[] {
  const pages = params.pages as number[] | undefined;
  if (pages?.length) return pages.map((p) => p - 1).filter((i) => i >= 0 && i < pageCount);
  if (params.last) return [pageCount - 1];
  if (params.first) return [0];
  return [];
}

// --- PDF runners (engines/pdf) ---------------------------------------------

async function runPdf(file: File, op: (pdf: typeof import('@/engines/pdf'), buf: ArrayBuffer, count: number, indices: number[]) => Promise<Uint8Array>, suffix: string, params: Record<string, unknown>): Promise<ActionResult> {
  const pdf = await import('@/engines/pdf');
  const buf = await file.arrayBuffer();
  const info = await pdf.getPdfInfo(buf.slice(0));
  const indices = pageIndices(params, info.pageCount);
  const out = await op(pdf, buf, info.pageCount, indices);
  return pdfResult(out, `${baseName(file)}-${suffix}.pdf`);
}

// Format conversion as a chain step (e.g. "…and convert to jpg"). Reuses the
// validated convert planner/runner so a step like image-convert-format runs
// inline and feeds the next step. Falls back to a sensible default format when
// the clause names none.
const convertStep: StepRunner = async (file, _params, clause) => {
  const cat = fileCategory(file);
  if (cat !== 'image' && cat !== 'audio') return { kind: 'error', text: `I can’t convert ${cat} files inline yet.` };
  const plan = planConvert(clause, cat);
  if (plan.kind === 'run') return runConvert(file, plan.category, plan.target);
  return runConvert(file, cat, cat === 'image' ? 'png' : 'mp3');
};

// --- the runner registry ----------------------------------------------------

const RUNNERS: Record<string, StepRunner> = {
  'image-convert-format': convertStep,
  'image-heic-convert': convertStep,
  'audio-convert-format': convertStep,
  'convert-anything': convertStep,
  'doc-convert': async (file) => {
    // Text-based render — fast and works on any device (no html2canvas), so the
    // AI's doc→PDF never stalls a low-end phone. The tool page keeps full layout.
    const { docxToPdfText } = await import('@/engines/document');
    const blob = await docxToPdfText(file);
    return { kind: 'file', blob, filename: `${baseName(file)}.pdf`, note: 'converted to PDF' };
  },
  'pdf-delete-pages': (file, params) =>
    runPdf(file, async (pdf, buf, _c, idx) => pdf.deletePages(buf, idx), 'pages-removed', params),
  'pdf-extract-pages': (file, params) =>
    runPdf(file, async (pdf, buf, _c, idx) => pdf.extractPages(buf, idx), 'pages', params),
  'pdf-rotate': (file, params) =>
    runPdf(file, async (pdf, buf, _c, idx) => pdf.rotatePages(buf, 90, idx.length ? idx : 'all'), 'rotated', params),
  'pdf-page-numbers': (file, params) =>
    runPdf(file, async (pdf, buf) => pdf.addPageNumbers(buf, {}), 'numbered', params),
  'pdf-watermark': (file, params) =>
    runPdf(file, async (pdf, buf) => pdf.addTextWatermark(buf, { text: String(params.title ?? 'WATERMARK') }), 'watermarked', params),
  // Extract a PDF's text as a chain step, so a binary PDF can flow into a
  // text-only AI ability (translate / summarize).
  'pdf-to-text': async (file) => {
    const { extractPdfText } = await import('@/engines/pdf/rasterize');
    const pages = await extractPdfText(await file.arrayBuffer());
    const text = pages.map((p) => p.text).join('\n\n').trim();
    return { kind: 'text', text: text || '(no extractable text in this PDF)' };
  },
};

// AI abilities that run as text→text chain steps (not registry tools).
const AI_TEXT_OPS = new Set(['ai-translate', 'ai-summarize']);

/** Whether a plan step can be executed inline (vs needing a tool hand-off). */
export function hasRunner(toolId: string): boolean {
  return toolId in RUNNERS || AI_TEXT_OPS.has(toolId) || inlineCap(toolId) !== undefined || textOpFor(toolId) !== undefined;
}

/** Optional model hook so model-backed chain steps (summarize) can run. */
export interface ChainOpts { generate?: (system: string, user: string) => Promise<string> }

// A chain's working value is either a file (image/audio/pdf/doc steps) or a
// string (text-tool steps). The executor converts between them on demand, so a
// chain can cross the boundary (e.g. read a file's text, then transform it).
interface WorkValue { file: File | null; text: string | null }

async function asText(v: WorkValue): Promise<string | null> {
  if (v.text != null) return v.text;
  if (v.file) { try { return await v.file.text(); } catch { return null; } }
  return null;
}
function asFile(v: WorkValue): File | null {
  if (v.file) return v.file;
  if (v.text != null) return new File([v.text], 'input.txt', { type: 'text/plain' });
  return null;
}

/** Run a single step against the current working value. */
async function runStepValue(step: PlanStep, value: WorkValue, opts?: ChainOpts): Promise<ActionResult> {
  // AI translate as a chain step: take the working text (from a prior step, a
  // text file, or a text op) and translate it. Pivots through English for any
  // language pair via the shared engine (browser Translator API / Opus-MT).
  if (step.toolId === 'ai-translate') {
    const input = await asText(value);
    if (input == null || !input.trim()) return { kind: 'error', text: 'No text to translate — add a step that produces text first.' };
    const t = await import('@/lib/ai/translate');
    const to = String(step.params.to ?? 'en');
    const from = (await t.detectLanguage(input)) ?? 'en';
    const out = from === to ? input : await t.translate(input, from, to);
    return { kind: 'text', text: out && out.trim() ? out : input };
  }
  // AI summarize as a chain step: needs the model, supplied by the caller. If no
  // model is wired (e.g. Node eval), this stops the chain for a clean hand-off.
  if (step.toolId === 'ai-summarize') {
    const input = await asText(value);
    if (input == null || !input.trim()) return { kind: 'error', text: 'No text to summarize.' };
    if (!opts?.generate) return { kind: 'error', text: 'summarize-needs-model' };
    const out = await opts.generate('Summarize the text in 2–3 short sentences, using only the text. No preamble. /no_think', input.slice(0, 4000));
    return { kind: 'text', text: out && out.trim() ? out : input };
  }
  const textOp = textOpFor(step.toolId);
  if (textOp) {
    const input = await asText(value);
    if (input == null) return { kind: 'error', text: 'No text to work on.' };
    return { kind: 'text', text: textOp.run(input, step.clause) };
  }
  const file = asFile(value);
  if (!file) return { kind: 'error', text: 'No file to work on.' };
  const dedicated = RUNNERS[step.toolId];
  if (dedicated) return dedicated(file, step.params, step.clause);
  const cap = inlineCap(step.toolId);
  if (cap) return cap.run(file, step.clause);
  return { kind: 'error', text: `No inline runner for ${step.toolId}.` };
}

export interface ChainOutcome {
  /** Final produced file, if the whole runnable prefix succeeded. */
  result: ActionResult | null;
  /** How many leading steps actually ran inline. */
  ran: number;
  /** Index of the first step that couldn't run inline (needs hand-off), or -1. */
  stoppedAt: number;
  /** Any per-step error message that halted the chain. */
  error?: string;
}

/**
 * Execute the longest runnable prefix of `steps`, threading the working value
 * (file OR text) through. Stops at the first step with no runner (so the caller
 * can guide the rest) or the first engine error. `onStep(i)` fires before each
 * step for live narration. `initial` may be a File or a string of text.
 */
export async function runChain(initial: File | string, steps: PlanStep[], onStep?: (i: number, step: PlanStep) => void, shouldStop?: () => boolean, opts?: ChainOpts): Promise<ChainOutcome> {
  let value: WorkValue = typeof initial === 'string' ? { file: null, text: initial } : { file: initial, text: null };
  let last: ActionResult | null = null;
  for (let i = 0; i < steps.length; i++) {
    if (shouldStop?.()) return { result: last, ran: i, stoppedAt: -1, error: 'stopped' };
    const step = steps[i];
    if (!hasRunner(step.toolId)) return { result: last, ran: i, stoppedAt: i };
    onStep?.(i, step);
    let res: ActionResult;
    try { res = await runStepValue(step, value, opts); }
    catch (e) { return { result: last, ran: i, stoppedAt: i, error: (e as Error)?.message }; }
    if (res.kind === 'error') return { result: last, ran: i, stoppedAt: i, error: res.text };
    last = res;
    // Carry the output forward as the next step's input.
    if (res.kind === 'text') value = { file: null, text: res.text };
    else { const f = resultToFile(res, 'output'); if (f) value = { file: f, text: null }; }
  }
  return { result: last, ran: steps.length, stoppedAt: -1 };
}
