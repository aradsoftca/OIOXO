/**
 * Xonvert AI — the Answer Brain (grounded synthesis).
 *
 * The system can now COLLECT data (search, read any page, live quotes). This is
 * the part that THINKS about it before answering — instead of parroting the
 * first snippet (which once "answered" a Shaq-vs-Jordan question with an
 * unrelated politician). It:
 *   1. reads the question's SHAPE — single entity, comparison, how/why, list;
 *   2. GATHERS the right source text for each part (both entities in a compare);
 *   3. hands those notes to the on-device model to SYNTHESIZE an answer — but
 *      strictly grounded: the model may only use the notes, and we VERIFY the
 *      reply is supported before showing it (else we fall back to the notes).
 *
 * Why this is safe on a 0.5B: it never "knows", it only rewrites/compares text
 * we put in front of it. Generation is bounded by the evidence; the verify gate
 * catches drift. Pure + network gather here; the model call lives in AiApp
 * (which owns the engine), driven by `buildSynthesis` + `isGrounded`.
 */

import { fetchTopic } from './search';
import type { SearchSource } from './search';

export type QuestionKind = 'single' | 'compare' | 'explain' | 'list' | 'factoid';

export interface QuestionAnalysis {
  kind: QuestionKind;
  /** Entities/topics to gather, one source read each. */
  topics: string[];
  /** The original question, lightly cleaned. */
  question: string;
}

export interface Evidence {
  topic: string;
  text: string;
  source: SearchSource;
}

// "A vs B", "A versus B", "compare A and B", "difference between A and B",
// "which is better, A or B" — split into the two things being weighed.
const COMPARE_CUE = /\b(vs\.?|versus|compared? to|difference between|which (one )?is (better|best|worse)|better|or)\b/i;

// Strip the comparison framing to isolate the two entities.
function comparePair(text: string): string[] | null {
  let t = text.trim()
    .replace(/^\s*(which (one )?is (better|best|worse|stronger|faster|bigger)|who is (better|best)|compare|what'?s the difference between|difference between|whats better)\b[:,]?\s*/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();
  // Split on the strongest comparison delimiter present.
  const parts = t.split(/\s+(?:vs\.?|versus|or|compared to|and)\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2 && parts.every((p) => p.length >= 2 && p.length <= 60)) return parts;
  return null;
}

const HOWWHY_RE = /^\s*(how|why)\b/i;
const LIST_RE = /\b(best|top|greatest|list of|recommend|which .* (should|to))\b/i;

/** Read the shape of a question so we gather and synthesize the right way. */
export function analyzeQuestion(text: string): QuestionAnalysis {
  const question = text.trim();

  if (COMPARE_CUE.test(question)) {
    const pair = comparePair(question);
    if (pair) return { kind: 'compare', topics: pair, question };
  }
  if (HOWWHY_RE.test(question)) return { kind: 'explain', topics: [question], question };
  if (LIST_RE.test(question)) return { kind: 'list', topics: [question], question };

  // Single entity / factoid — one topic, the whole (cleaned) question.
  return { kind: 'single', topics: [question], question };
}

/** Should this question be synthesized by the model, or is extractive enough? */
export function wantsSynthesis(a: QuestionAnalysis): boolean {
  // Comparisons and how/why genuinely need the model to weave sources together.
  // Single-entity lookups are fine extractive (and faster) unless we gathered
  // multiple notes worth merging.
  return a.kind === 'compare' || a.kind === 'explain' || a.kind === 'list';
}

/** Gather one source per topic (both entities for a comparison). */
export async function gatherEvidence(a: QuestionAnalysis): Promise<Evidence[]> {
  const out: Evidence[] = [];
  const got = await Promise.all(a.topics.map((t) => fetchTopic(t)));
  got.forEach((g, i) => { if (g && g.text) out.push({ topic: a.topics[i], text: g.text, source: g.source }); });
  return out;
}

/** Build the grounded synthesis messages for the on-device model. */
export function buildSynthesis(a: QuestionAnalysis, evidence: Evidence[]): { system: string; user: string } {
  const notes = evidence.map((e, i) => `Note ${i + 1} — ${e.topic}:\n"""${e.text}"""`).join('\n\n');
  const rules =
    'You are answering using ONLY the notes provided. Do not add any fact that is not in the notes. ' +
    'If the notes do not cover something, say so briefly. Be concise, neutral, and clear. No preamble.';
  let task: string;
  switch (a.kind) {
    case 'compare':
      task = `Compare them in 3–5 sentences: what each is best known for, and how they differ. If the notes don't support a "winner", say it's a matter of opinion. Question: "${a.question}".`;
      break;
    case 'explain':
      task = `Explain it clearly in 3–5 sentences, using only the notes. Question: "${a.question}".`;
      break;
    case 'list':
      task = `Answer concisely using only the notes; if it's a ranking/opinion, attribute it to the sources. Question: "${a.question}".`;
      break;
    default:
      task = `Answer in 2–3 sentences using only the notes. Question: "${a.question}".`;
  }
  return { system: rules, user: `${notes}\n\n${task}` };
}

// --- anti-hallucination verify ---------------------------------------------

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5);
}

/**
 * Is the model's answer actually supported by the evidence? We require that
 * most of the answer's distinctive (5+ char) words appear in the notes. A low
 * overlap means it drifted into invented territory → caller shows the extractive
 * notes instead. Cheap, language-agnostic, and good enough to catch fabrication.
 */
export function isGrounded(answer: string, evidence: Evidence[]): boolean {
  const ans = words(answer);
  if (ans.length < 4) return false;
  const hay = new Set(words(evidence.map((e) => `${e.topic} ${e.text}`).join(' ')));
  if (!hay.size) return false;
  let hit = 0;
  for (const w of ans) if (hay.has(w)) hit++;
  return hit / ans.length >= 0.5;
}

/** Combine evidence into a readable extractive fallback (no model). */
export function extractiveFallback(evidence: Evidence[]): string {
  if (evidence.length === 1) return evidence[0].text;
  return evidence.map((e) => `${e.topic}: ${e.text}`).join('\n\n');
}

/** Dedup the citations across gathered evidence. */
export function evidenceSources(evidence: Evidence[]): SearchSource[] {
  const seen = new Set<string>();
  const out: SearchSource[] = [];
  for (const e of evidence) { if (e.source.url && !seen.has(e.source.url)) { seen.add(e.source.url); out.push(e.source); } }
  return out;
}
