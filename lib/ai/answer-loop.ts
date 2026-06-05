/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * answer-loop — the GENERAL answer engine: one question-agnostic loop that beats
 * a one-shot model by ITERATING and self-VERIFYING, instead of per-class branches.
 *
 *   1. try several ANGLES on the question (different queries/sources) — general,
 *      not per-topic: encyclopedic, the literal question, a reformulated query
 *      (keyed on the interrogative, not the topic), and forum opinion when asked.
 *   2. draft an answer from each angle (the reader extracts; never authors facts).
 *   3. VERIFY every draft against the QUESTION with the trained reranker — the one
 *      universal judge ("does this actually answer it?"). Keep the best-scoring.
 *
 * This is why it can beat frontier on answerable-in-text questions: a one-shot
 * model commits to one pass; this tries multiple angles and keeps the one that
 * verifiably answers — grounded (no hallucination), fresh, cited. The per-class
 * extractors become emergent (the loop tries them as angles and verify decides).
 */
import { comprehendAnswer, type AnswerPlan } from './oioxo-engine';
import { wikipediaBestArticles, type RankedEvidence } from './sources';
import { webSearch } from './metasearch';
import { redditOpinions } from './reddit-read';
import { readAnswer } from './reader';
import { consensusAnswer } from './consensus';
import { scorePassages } from './rerank';
import { cleanQuery } from './search';
import { richAnswer } from './web-read';
import { detectAnswerType, looksInstructional, type AnswerType } from './extract';

const domainOf = (url: string) => (url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

function webEvidence(query: string, topic: string): Promise<RankedEvidence[]> {
  return webSearch(query, 12)
    .then((hits) => hits.map((h) => ({ topic, text: [h.title, h.extract].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim(), source: { title: h.title || h.url, url: h.url, site: domainOf(h.url) } })).filter((e) => e.text.length > 30))
    .catch(() => []);
}

/** GENERAL query reformulation — keyed on the QUESTION'S STRUCTURE (interrogative),
 *  never the topic. "why is the sky blue" → "sky blue cause scientific explanation"
 *  (which finds Rayleigh scattering, not the colour). No per-topic rules. */
function reformulate(question: string, plan: AnswerPlan): string {
  const c = (cleanQuery(question) || question).trim();
  const lc = question.toLowerCase();
  if (/\bwhy\b/.test(lc)) return `${c} cause scientific explanation`;
  if (/\bhow (do|does|to|is|are|can|did)\b|^\s*how\b/.test(lc)) return `${c} how it works mechanism steps`;
  if (/\bwhat (is|are|does)\b|\bdefine\b|\bmeaning of\b/.test(lc)) return `${c} definition meaning`;
  if (/\b(best|top|vs|versus|better|worth|recommend)\b/.test(lc)) return `${c} comparison review recommendation`;
  if (/\bhow (much|many)\b|\bcost|price|calorie|net worth\b/.test(lc)) return `${c} exact number figure`;
  return c;
}

const wantsOpinion = (q: string, plan: AnswerPlan) =>
  plan.shape === 'compare' || plan.shape === 'list' || /\b(best|worst|vs\b|versus|better|worth it|recommend|opinion|review|should i)\b/i.test(q);

export interface LoopAnswer { text: string; score: number; angle: string; sources: RankedEvidence['source'][]; agreement?: number }

/**
 * The loop. Returns the best-verified answer across angles (or null if nothing
 * usable). `plan` defaults to comprehendAnswer(question).
 */
export async function loopAnswer(question: string, plan?: AnswerPlan): Promise<LoopAnswer | null> {
  const p = plan ?? comprehendAnswer(question);
  const drafts = await draftCandidates(question, p);
  if (!drafts.length) return null;

  // STRUCTURED-first: validated expert steps/code ARE the answer (high confidence).
  const structured = drafts.find((d) => d.structured);
  if (structured) return { text: structured.text, score: 99, angle: structured.angle, sources: structured.sources };

  // VERIFY: the trained verifier scores each draft against the QUESTION; keep best.
  const scores = (await scorePassages(question, drafts.map((d) => d.text)).catch(() => null)) ?? drafts.map(() => 0);
  let best = 0;
  scores.forEach((s, i) => { if (s > scores[best]) best = i; });

  // CONSENSUS preference: a fused answer that ≥2 INDEPENDENT domains agree on is
  // more trustworthy than a marginally-higher-scoring single-source draft — and
  // it's the frontier-beating shape (complete + cross-checked + cited). Prefer it
  // unless another draft clearly out-verifies it (margin), so we never override a
  // genuinely better answer. This is the cross-check made decisive.
  const ci = drafts.findIndex((d) => d.agreement && d.agreement >= 2);
  if (ci >= 0 && ci !== best && scores[ci] >= scores[best] - 1.0) best = ci;

  return { text: drafts[best].text, score: scores[best], angle: drafts[best].angle, sources: drafts[best].sources, agreement: drafts[best].agreement };
}

export interface Draft { text: string; angle: string; sources: RankedEvidence['source'][]; structured?: boolean; agreement?: number }

/**
 * Generate candidate answers from every angle (structured + encyclopedic + web +
 * reformulated + forum). The loop verifies+picks among these; the verifier-trainer
 * judges each to learn "good vs bad answer". Returns all drafts (unverified).
 */
export async function draftCandidates(question: string, plan?: AnswerPlan): Promise<Draft[]> {
  const p = plan ?? comprehendAnswer(question);
  const drafts: Draft[] = [];

  // structured (code/recipe/howto) — the expert page's own validated steps/code
  const stype: AnswerType = detectAnswerType(question);
  if (stype === 'recipe' || stype === 'howto' || stype === 'code') {
    const rich = await richAnswer(question, stype).catch(() => null);
    if (rich?.answer && (stype === 'code' || looksInstructional(rich.answer))) {
      drafts.push({ text: rich.answer, angle: `structured:${stype}`, sources: (rich.sources ?? []).slice(0, 3) as RankedEvidence['source'][], structured: true });
    }
  }

  const angles: { name: string; ev: Promise<RankedEvidence[]> }[] = [
    { name: 'encyclopedic', ev: wikipediaBestArticles(question, 4) },
    { name: 'web-literal', ev: webEvidence(question, question) },
    { name: 'web-reformulated', ev: webEvidence(reformulate(question, p), question) },
  ];
  if (wantsOpinion(question, p)) {
    angles.push({ name: 'forum', ev: redditOpinions(question, { threads: 3, perThread: 6 }).then((rs) => rs.map((r) => ({ topic: question, text: r.text, source: r.source, votes: r.score }))).catch(() => []) });
  }
  const evs = await Promise.all(angles.map((a) => a.ev.catch(() => [] as RankedEvidence[])));
  const srcOf = (ev: RankedEvidence[]) => Array.from(new Map(ev.map((e) => [e.source?.url, e.source])).values()).filter(Boolean).slice(0, 3) as RankedEvidence['source'][];
  await Promise.all(angles.map(async (a, i) => {
    if (!evs[i].length) return;
    const r = await readAnswer(question, p, evs[i]).catch(() => null);
    if (r?.text && r.text.length > 30) drafts.push({ text: r.text, angle: a.name, sources: srcOf(evs[i]) });
  }));
  // CONSENSUS draft — cross-check every source against every other and FUSE the
  // agreed claims into one complete, cited answer. This is the research-engine
  // draft a one-pass model can't produce: it counts how many independent domains
  // back each claim and leads with the agreed ones. Replaces the old "merged"
  // reader pass (which extracted one passage and lost the complementary facts).
  const merged = evs.flat();
  if (merged.length) {
    const c = await consensusAnswer(question, p, merged).catch(() => null);
    if (c?.text && c.text.length > 30) {
      drafts.push({ text: c.text, angle: 'consensus', sources: srcOf(merged), agreement: c.agreement });
    } else {
      // fallback to the single-passage reader if consensus found nothing usable
      const r = await readAnswer(question, p, merged).catch(() => null);
      if (r?.text && r.text.length > 30) drafts.push({ text: r.text, angle: 'merged', sources: srcOf(merged) });
    }
  }
  return drafts;
}
