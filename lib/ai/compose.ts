/**
 * Xonvert AI — long-form composition engine (the WRITE step).
 *
 * Why this exists: a 0.6B with a 2048 context can't one-shot a long, organised
 * essay — and the rest of the app caps generations at ~220 tokens, which is what
 * makes "write me a detailed article" come out stunted. The fix matches the
 * brain's whole philosophy: do it as MANY bounded steps. Outline the piece
 * (model picks a handful of headings), write EACH section in its own call, then
 * stitch. Total length is unbounded because we're on-device with no token bill —
 * the thing frontier models won't do, we can.
 *
 * This module is PURE: it builds the prompts, parses the outline, sizes the work,
 * and assembles the final document. `AiApp` owns the engine that runs the calls.
 * Node-testable.
 */

import type { WriteForm } from './job';

export interface ComposeSpec {
  form: WriteForm;
  topic: string;
  length: 'short' | 'medium' | 'long';
  lang: string;
}

/** How many sections + tokens-per-section a length maps to. */
export function workload(length: ComposeSpec['length']): { sections: number; tokensPerSection: number } {
  // Sized for a tiny on-device model: every section is a separate, sequential
  // generation on the user's GPU, so fewer/leaner sections = much faster, and
  // the small model can't fill more than this with quality anyway. "long" is a
  // tidy multi-section draft, NOT a 20-page paper (that's beyond a 0.6B).
  switch (length) {
    case 'short': return { sections: 1, tokensPerSection: 240 };
    case 'medium': return { sections: 3, tokensPerSection: 300 };
    case 'long': return { sections: 4, tokensPerSection: 340 };
  }
}

const FORM_VOICE: Partial<Record<WriteForm, string>> = {
  article: 'an informative, engaging article',
  essay: 'a structured, argumentative essay',
  report: 'a clear, factual report',
  blog: 'a friendly, conversational blog post',
  story: 'an imaginative short story',
  poem: 'a poem',
  song: 'song lyrics with verses and a chorus',
  letter: 'a warm, well-formed letter',
  email: 'a concise, professional email',
  'cover-letter': 'a persuasive cover letter',
  speech: 'a compelling spoken speech',
  script: 'a script with scene directions and dialogue',
  guide: 'a practical, step-by-step guide',
  review: 'a balanced review',
  explainer: 'a clear explainer',
};

function voiceOf(form: WriteForm): string {
  return FORM_VOICE[form] ?? `a well-written ${form}`;
}

const langLine = (lang: string) =>
  lang && lang !== 'en' && lang !== 'auto' ? ` Write in ${lang}.` : '';

/**
 * Prompt to produce an OUTLINE — a short list of section headings. Grammar-
 * constrained to an array of strings so a tiny model can't ramble or break JSON.
 * Creative single-block forms (poem/short) get one implicit section instead.
 */
export function outlinePrompt(spec: ComposeSpec): {
  messages: { role: 'system' | 'user'; content: string }[];
  schema: string;
  count: number;
} {
  const { sections } = workload(spec.length);
  const system =
    `You are planning ${voiceOf(spec.form)}. Propose exactly ${sections} concise section ` +
    `headings that together cover the topic well, in a sensible order. ` +
    `Reply with ONLY JSON: {"sections":["…","…"]}.${langLine(spec.lang)} /no_think`;
  const user = `Topic: ${spec.topic}`;
  const schema = JSON.stringify({
    type: 'object',
    properties: { sections: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: sections } },
    required: ['sections'],
  });
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema, count: sections };
}

// Generic, form-aware section scaffolds — the deterministic guarantee that a
// long piece is actually SECTIONED even when the tiny model (no grammar on the
// WASM path) ignores the outline instruction and just starts writing.
const SCAFFOLDS: Partial<Record<WriteForm, string[]>> = {
  article: ['Introduction', 'Background', 'Key factors', 'Why it matters', 'Challenges', 'Conclusion'],
  blog: ['Introduction', 'The main idea', 'In everyday life', 'Tips', 'Final thoughts'],
  essay: ['Introduction', 'Main argument', 'Supporting evidence', 'Counterpoints', 'Conclusion'],
  report: ['Overview', 'Background', 'Findings', 'Analysis', 'Recommendations', 'Conclusion'],
  guide: ['Overview', 'Getting started', 'Step by step', 'Tips', 'Common mistakes', 'Summary'],
  review: ['Overview', 'Strengths', 'Weaknesses', 'Verdict'],
  explainer: ['What it is', 'How it works', 'Why it matters', 'Summary'],
  speech: ['Opening', 'Main message', 'Closing'],
};

/** Deterministic headings for a piece — always returns the workload's count. */
export function fallbackOutline(spec: ComposeSpec): string[] {
  const n = workload(spec.length).sections;
  if (n <= 1) return [spec.topic];
  const base = SCAFFOLDS[spec.form] ?? SCAFFOLDS.article!;
  // Keep the opening + closing as bookends when trimming, so a shortened outline
  // still reads like a whole piece (Intro … Conclusion), not a truncated one.
  if (base.length > n) return [...base.slice(0, n - 1), base[base.length - 1]];
  if (base.length === n) return [...base];
  // Pad the middle if we need more sections than the scaffold lists.
  const out = [...base];
  while (out.length < n) out.splice(out.length - 1, 0, `More on ${spec.topic}`);
  return out.slice(0, n);
}

/**
 * Parse the outline reply into headings. Tolerates JSON, a numbered/bulleted
 * list, or plain lines (the WASM model has no grammar, so it rarely emits clean
 * JSON). If it can't extract enough headings for the intended length, falls back
 * to the deterministic scaffold so long pieces are ALWAYS sectioned.
 */
export function parseOutline(raw: string, spec: ComposeSpec): string[] {
  const want = workload(spec.length).sections;
  // A single-section piece IS one block — its "heading" is just the topic; no
  // need to trust the model's outline at all.
  if (want <= 1) return [spec.topic];
  let headings: string[] = [];

  // 1) JSON {"sections":[...]}.
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const arr = JSON.parse(m[0])?.sections;
      if (Array.isArray(arr)) headings = arr.map((s: unknown) => String(s).trim()).filter(Boolean);
    }
  } catch { /* try list parsing */ }

  // 2) A numbered / bulleted / newline list. Reject lines carrying JSON/code
  //    punctuation — a malformed/truncated JSON reply (common on the WASM model)
  //    must NOT have its fragments ("sections": [, "title": "…",) read as
  //    headings; such lines fail this filter so we fall through to the scaffold.
  if (headings.length < 2) {
    headings = raw
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').replace(/^["'#\s]+|["'\s]+$/g, '').trim())
      .filter((l) => l.length >= 2 && l.length <= 60 && /\w/.test(l) && !/[.!?]$/.test(l) && !/["{}\[\]:]|=>|\bsections?\b|\bcontent\b|\btitle\b/i.test(l));
  }

  headings = dedupe(headings).slice(0, want);
  // Single-section forms are fine with one; multi-section pieces must be split —
  // if the model didn't give us enough, use the scaffold.
  if (want > 1 && headings.length < 2) return fallbackOutline(spec);
  return headings.length ? headings : [spec.topic];
}

// Phrases a chatty small model leaks that must never reach the page.
const LEAK_PATTERNS: RegExp[] = [
  /\b(as an? (ai|language model|assistant)[^.]*\.)/gi,
  /\bI (have been|was) (trained|designed|programmed)[^.]*\./gi,
  /\b(I'?m|I am) (just |only )?(an? )?(ai|language model|assistant|chatbot)[^.]*\./gi,
  /\bno meta[\s-]?commentary[^.!]*[.!]?/gi,
  /\b(here'?s?|here is|sure[,!]|certainly[,!]|of course[,!]|i'?d be happy to)[^.\n]*\b(article|blog|essay|below|following)\b[^.\n]*[.:]/gi,
  /\bjust write about[^.!]*[.!]?/gi,
  /\bI hope (this|that) helps[^.]*\./gi,
  // Conversational lead-ins a chatty small model opens with (caught in live test).
  /^[^.\n]*\bI can (provide|give|tell|share|offer|help)[^.\n]*\b(reasons?|information|details|answer|some)\b[^.\n]*\.\s*/gi,
  /^\s*(however|well|sure|okay|ok|certainly)[,!]?\s+(?=I can|here|let)/gi,
];

/** Strip persona leaks, instruction echoes, off-language tokens, AND any source
 *  attribution from a generated section — answers are presented as Xonvert's own
 *  (no site names, no "according to the sources"). `lang` lets us drop stray CJK
 *  when writing in a Latin language (the model occasionally code-switches). */
export function cleanGenerated(text: string, lang: string): string {
  let t = text;
  for (const re of LEAK_PATTERNS) t = t.replace(re, ' ');
  // Attribution scrub: bare domains and "according to / as evidenced by … the X
  // sources / studies / journal / university" — never reveal where facts came from.
  t = t.replace(/\b[a-z0-9][\w-]*\.(?:com|org|net|edu|gov|io|co|ac\.\w+)\b/gi, '');
  t = t.replace(/\b(according to|as (?:evidenced|shown|noted|reported|highlighted) (?:by|in)|per|based on|sources? (?:from|like|including)|findings from|studies (?:by|from))\b[^.,;]*(?:sources?|journal|university|study|studies|research(?:gate)?|article|paper|report|website|\.\w+)[^.,;]*/gi, '');
  t = t.replace(/\b(the\s+)?(ijps|researchgate|wikipedia|university of [a-z]+)\b/gi, '');
  // Drop a duplicated "Title?" line the model sometimes prepends.
  t = t.replace(/^\s*[^.\n]{3,60}\?\s*\n/, '');
  // For Latin-script targets, strip CJK leakage.
  if (lang !== 'zh' && lang !== 'ja' && lang !== 'ko' && lang !== 'auto') {
    t = t.replace(/[　-鿿가-힯]+/g, '');
  }
  return t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Prompt to write ONE section. The model sees the topic, this heading, the
 * headings around it (so sections don't repeat), and a summary of what's been
 * written — keeping each call small while the whole stays coherent.
 */
export function sectionPrompt(
  spec: ComposeSpec,
  heading: string,
  allHeadings: string[],
  soFar: string,
): { messages: { role: 'system' | 'user'; content: string }[]; maxTokens: number } {
  const { tokensPerSection } = workload(spec.length);
  const single = allHeadings.length <= 1;
  const system =
    `You are a skilled writer producing ${voiceOf(spec.form)} about "${spec.topic}". ` +
    (single
      ? `Write the whole piece now — well-organised and complete.`
      : `Write ONLY the body of the section "${heading}": a few solid paragraphs. ` +
        `Do not output the heading, and do not repeat other sections.`) +
    ` Start writing the content immediately. Never mention yourself, being an AI, ` +
    `or these instructions; no preamble, no sign-off. Be specific and concrete; invent no false facts.` +
    `${langLine(spec.lang)} /no_think`;
  const context = single
    ? ''
    : `\nAll sections: ${allHeadings.join('; ')}.` + (soFar ? `\nWritten so far (don't repeat): ${clip(soFar, 400)}` : '');
  const user = `Topic: ${spec.topic}${context}`;
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens: tokensPerSection };
}

/** Stitch sections into a finished document (Markdown), cleaning each body. */
export function assemble(spec: ComposeSpec, headings: string[], bodies: string[]): string {
  const title = titleCase(spec.topic);
  const single = headings.length <= 1;
  if (single) return `# ${title}\n\n${cleanGenerated(bodies[0] ?? '', spec.lang)}\n`;
  const parts = [`# ${title}\n`];
  headings.forEach((h, i) => {
    const body = cleanGenerated(bodies[i] ?? '', spec.lang);
    if (body) parts.push(`## ${h}\n\n${body}\n`);
  });
  return parts.join('\n');
}

/** Build the gather queries that feed research before writing a factual piece. */
export function gatherQueries(spec: ComposeSpec, headings: string[]): string[] {
  // One broad query for the topic, plus a focused query per heading for depth.
  const qs = [spec.topic];
  if (spec.length !== 'short') for (const h of headings) qs.push(`${spec.topic} ${h}`);
  return dedupe(qs).slice(0, spec.length === 'long' ? 7 : 3);
}

// --- small pure helpers ------------------------------------------------------

function clip(s: string, n: number): string { return s.length > n ? s.slice(0, n) + '…' : s; }
function dedupe(a: string[]): string[] { return [...new Set(a.map((s) => s.trim()).filter(Boolean))]; }
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
