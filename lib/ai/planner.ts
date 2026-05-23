/**
 * Xonvert AI — multi-step planner.
 *
 * Turns one compound request ("take this word doc, delete pages 5-7 and add
 * page numbers") into an ordered chain of tool steps the assistant can run and
 * narrate. The decomposition is deterministic — we segment the sentence, route
 * each clause through the same lexical ranker the rest of the AI trusts, infer
 * any prerequisite conversion (you can't delete PDF pages from a .docx until
 * it's a PDF), and extract typed parameters (page ranges, titles, sizes) with
 * regexes. The 0.5B model is never asked to invent a plan — at most it later
 * tie-breaks an ambiguous step, grammar-constrained to the candidate ids.
 *
 * Pure / DOM-free so the eval harness can score plans in Node.
 */

import { searchTools, confidence } from './retrieval';
import { docById, type IndexDoc } from './tool-index';
import { detectTranslate } from './translate-op';

export type Medium = 'image' | 'audio' | 'video' | 'pdf' | 'doc' | 'text' | null;

export interface PlanStep {
  toolId: string;
  name: string;
  href: string;
  /** The user's own words this step came from (for narration). */
  clause: string;
  /** Typed parameters extracted from the clause. */
  params: Record<string, unknown>;
  /** Present-tense phrase: "delete pages 5-7", for the narration line. */
  narration: string;
  confidence: 'confident' | 'ambiguous' | 'weak';
  /** Alternatives when ambiguous (for a model tie-break or user choice). */
  candidates: { id: string; name: string }[];
  /** True when the step was inserted by the planner, not asked for. */
  inferred?: boolean;
}

export interface Plan {
  steps: PlanStep[];
  /** Clauses that looked like actions but matched no tool confidently. */
  unresolved: string[];
  /** True when more than one user-requested step was found. */
  multi: boolean;
}

export interface PlanOptions {
  /** The medium of the file in play, if known (drives prerequisite inserts). */
  inputMedium?: Medium;
}

// Verbs that mark the start of an actionable clause. Broader than the router's
// ACTION_RE on purpose — "add page numbers" and "rearrange pages" are actions
// the planner must recognise even though they don't name a format.
const VERB = /\b(convert|compress|resize|crop|rotate|flip|mirror|merge|combine|join|split|trim|cut|extract|pull|remove|delete|strip|erase|clear|add|insert|put|apply|stamp|watermark|sign|protect|encrypt|lock|unlock|decrypt|paginate|number|upscale|enhance|enlarge|denoise|sharpen|blur|brighten|darken|adjust|normali[sz]e|reverse|speed|slow|fade|loop|export|save|change|turn|make|create|generate|draw|scan|ocr|transcribe|summari[sz]e|translate|count|format|minify|beautify|encode|decode|hash|rename|reorder|rearrange|sort|isolate)\b/i;

// Swap the inner " and " of fixed phrases for a sentinel the split regex won't
// match, then restore it after splitting — so "black and white" stays one clause.
const SENT = ' § ';
const AND_PHRASES = [/black\s+and\s+white/gi, /salt\s+and\s+pepper/gi, /cut\s+and\s+paste/gi];
function protectAnd(s: string): string {
  return AND_PHRASES.reduce((a, re) => a.replace(re, (m) => m.replace(/\s+and\s+/i, SENT)), s);
}
function restoreAnd(s: string): string {
  return s.replace(/§/g, 'and').replace(/\s{2,}/g, ' ');
}

/**
 * Break a request into ordered action clauses. Splits on strong delimiters
 * (";", "then", commas) and on bare "and" only between two action-like parts,
 * then drops leading non-action context ("take this word doc") and merges any
 * object-only fragment back onto the action it belongs to.
 */
export function segment(text: string): string[] {
  const protectedText = protectAnd(text.trim());
  const raw = protectedText
    .split(/\s*(?:;|\bthen\b|after\s+that|,|\band\b)\s*/i)
    .map((p) => restoreAnd(p).trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const part of raw) {
    if (VERB.test(part)) {
      clauses.push(part);
    } else if (clauses.length) {
      // Object-only continuation ("white" after "black", "the result") — fold
      // it back onto the previous clause so its words still inform routing.
      clauses[clauses.length - 1] += ' ' + part;
    }
    // else: leading non-action context with no clause yet -> drop it.
  }
  return clauses.length ? clauses : [text.trim()];
}

// --- parameter extraction ---------------------------------------------------

/** "pages 5-7", "5 to 7", "delete 5-7", "the last page", "page 3". */
function extractPages(clause: string): { pages?: number[]; last?: boolean; first?: boolean } {
  const lc = clause.toLowerCase();
  const range = lc.match(/(\d+)\s*(?:to|-|–|—|through|thru)\s*(\d+)/);
  if (range) {
    const a = +range[1], b = +range[2];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const list: number[] = [];
    for (let i = lo; i <= hi; i++) list.push(i);
    return { pages: list };
  }
  if (/\blast\b/.test(lc)) return { last: true };
  if (/\bfirst\b/.test(lc)) return { first: true };
  const single = lc.match(/page\s+(\d+)/);
  if (single) return { pages: [+single[1]] };
  const bare = lc.match(/\b(\d+)\b/);
  if (bare && /(page|delete|remove|extract)/.test(lc)) return { pages: [+bare[1]] };
  return {};
}

/** title to "X", named "X", call it "X". */
function extractTitle(clause: string): string | undefined {
  const m = clause.match(/(?:title|name|call(?:ed)?|rename)\s*(?:it|to|as|:)?\s*["“]?([^"”]+?)["”]?\s*$/i);
  return m ? m[1].trim() : undefined;
}

/** Per-step typed params, by tool family. Extend as runners need more. */
function extractParams(toolId: string, clause: string): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (/pages?|extract|reorder|split/.test(toolId) || /\bpages?\b/i.test(clause)) Object.assign(p, extractPages(clause));
  // Watermark / stamp text: "watermark with CONFIDENTIAL", 'stamp "DRAFT"'.
  if (/watermark|stamp/.test(toolId)) {
    const wm = clause.match(/(?:say(?:ing)?|with|text|reads?|labell?ed?|:)\s*["“]?([^"”]+?)["”]?\s*$/i);
    if (wm && wm[1].trim()) p.title = wm[1].trim();
  }
  const title = extractTitle(clause);
  if (title && /title|rename|name/.test(toolId + ' ' + clause)) p.title = title;
  const pct = clause.match(/(\d{1,3})\s*%/);
  if (pct) p.percent = +pct[1];
  const dims = clause.match(/(\d{2,5})\s*(?:x|×|by)\s*(\d{2,5})/i);
  if (dims) { p.width = +dims[1]; p.height = +dims[2]; }
  const secs = clause.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/i);
  if (secs) p.seconds = +secs[1];
  return p;
}

// --- prerequisite inference -------------------------------------------------

/** Tools that can only operate on a PDF input. */
function isPdfTool(id: string): boolean { return id.startsWith('pdf-'); }

/** Does the request / file imply a non-PDF document that must be converted? */
function impliesNonPdfDoc(text: string, inputMedium: Medium): boolean {
  if (inputMedium === 'doc') return true;
  return /\b(word|docx?|\.docx?|odt|rtf|pages\s+document|google\s+doc)\b/i.test(text);
}

// --- routing one clause -----------------------------------------------------

type FilterMedium = 'image' | 'audio' | 'video' | 'pdf' | null;

function routeClause(clause: string, medium: FilterMedium): { doc: IndexDoc | null; conf: PlanStep['confidence']; cands: IndexDoc[] } {
  // Medium continuity: once the chain is working on (say) an image, a bare
  // "compress it" must mean image-compress, not video-compress. Filtering to
  // the established medium resolves these context-dependent clauses. If the
  // filter starves the result (clause needs a different medium), fall back.
  let ranked = medium ? searchTools(clause, { fileCategory: medium, limit: 4 }) : [];
  if (!ranked.length) ranked = searchTools(clause, { limit: 4 });
  const conf = confidence(ranked);
  return {
    doc: ranked[0]?.doc ?? null,
    conf,
    cands: ranked.slice(0, 3).map((r) => r.doc),
  };
}

/** A tool's medium, for carrying context to the next clause. */
function mediumOf(category: string): FilterMedium {
  return category === 'image' || category === 'audio' || category === 'video' || category === 'pdf' ? category : null;
}

function narrate(name: string, params: Record<string, unknown>): string {
  const pages = params.pages as number[] | undefined;
  if (pages?.length) {
    const span = pages.length > 1 ? `pages ${pages[0]}–${pages[pages.length - 1]}` : `page ${pages[0]}`;
    return `${name} (${span})`;
  }
  if (params.last) return `${name} (last page)`;
  if (params.title) return `${name} → “${params.title}”`;
  if (params.width && params.height) return `${name} (${params.width}×${params.height})`;
  if (params.seconds) return `${name} (${params.seconds}s)`;
  return name;
}

/**
 * Build an ordered plan from a compound request. Single-clause requests still
 * return a one-step plan (so callers can use one code path); `multi` tells them
 * whether to show the chain UI.
 */
export function planRequest(text: string, opts: PlanOptions = {}): Plan {
  const clauses = segment(text);
  const steps: PlanStep[] = [];
  const unresolved: string[] = [];

  // Seed the medium from the input file, then let each resolved step update it.
  const seed = opts.inputMedium ?? null;
  let medium: FilterMedium = seed === 'image' || seed === 'audio' || seed === 'video' || seed === 'pdf' ? seed : null;

  for (const clause of clauses) {
    // ONE engine routes every clause — tools AND AI abilities (ai-translate /
    // ai-summarize live in the same index now), so no per-ability regex.
    const { doc, conf, cands } = routeClause(clause, medium);
    if (!doc || conf === 'weak') { unresolved.push(clause); continue; }
    medium = mediumOf(doc.category) ?? medium; // carry context forward
    const params = extractParams(doc.id, clause);
    let name = doc.name;
    let narration = narrate(doc.name, params);
    // Capability-specific param extraction (not routing): the translate target
    // language. This is parsing, not a routing branch.
    if (doc.id === 'ai-translate') {
      const tr = detectTranslate(clause) ?? detectTranslate('translate ' + clause);
      if (tr) { params.to = tr.to; params.toName = tr.toName; name = `Translate to ${tr.toName}`; narration = name; }
    }
    steps.push({
      toolId: doc.id, name, href: doc.href, clause, params, narration, confidence: conf,
      candidates: cands.map((c) => ({ id: c.id, name: c.name })),
    });
  }

  // Prerequisite for an AI text-ability (translate/summarize) that leads the
  // chain on a binary file: insert the matching text-extractor first, so
  // "translate this PDF to Arabic" / "summarize this audio" run end-to-end
  // (PDF→text→translate). Only when the chain STARTS with the AI op (the common
  // single-ability case); mid-chain text is assumed produced upstream.
  const aiText = (id: string) => id === 'ai-translate' || id === 'ai-summarize';
  if (steps.length && aiText(steps[0].toolId)) {
    const extractor = seed === 'pdf' ? { id: 'pdf-to-text', name: 'Extract PDF text' }
      : seed === 'image' ? { id: 'image-ocr', name: 'Read text (OCR)' }
      : seed === 'audio' ? { id: 'audio-to-text', name: 'Transcribe' }
      : (opts.inputMedium === 'doc' ? { id: 'doc-convert', name: 'Read document' } : null);
    if (extractor) {
      steps.unshift({ toolId: extractor.id, name: extractor.name, href: `/tools/${extractor.id}`, clause: 'read the text first', params: {}, narration: extractor.name, confidence: 'confident', candidates: [], inferred: true });
    }
  }

  const userSteps = steps.length;

  // Prerequisite: PDF page operations need a PDF. If the source is a Word-style
  // doc, prepend a conversion step so the chain actually runs end-to-end.
  if (steps.some((s) => isPdfTool(s.toolId)) && impliesNonPdfDoc(text, opts.inputMedium ?? null) && !steps.some((s) => s.toolId === 'doc-convert')) {
    const conv = docById('doc-convert');
    if (conv) {
      steps.unshift({
        toolId: 'doc-convert',
        name: conv.name,
        href: conv.href,
        clause: 'convert the document to PDF first',
        params: { to: 'pdf' },
        narration: `${conv.name} → PDF`,
        confidence: 'confident',
        candidates: [],
        inferred: true,
      });
    }
  }

  return { steps, unresolved, multi: userSteps > 1 };
}
