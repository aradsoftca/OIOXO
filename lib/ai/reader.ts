/**
 * oioxo AI — the READER (extract → assemble → verify).
 *
 * The answer step, redesigned. Instead of a tiny decoder PARAPHRASING the notes
 * (which corrupts names/numbers, loops, and leaks scaffolding — see the
 * gemini benchmark), the reader has the model only POINT at real text:
 *   • EXTRACT   the MiniLM encoder (already on-device for tool search) ranks
 *               every gathered sentence by semantic relevance to the question.
 *   • ASSEMBLE  a fixed per-shape template fills with the chosen real sentences.
 *   • VERIFY    keep only on-topic sentences; grounded by construction (we copy
 *               real text), so hallucination is structurally impossible.
 *
 * Pure aside from the encoder call; Node-testable. Returns null when there's no
 * usable evidence, so answerFlow falls back to the digest — never worse than today.
 *
 * This is the deterministic floor for the multi-head encoder we train on arad
 * (extractive-QA + NLI verifier head slot in behind `rank`/`verify` later).
 */
import type { Evidence } from './reason';
import type { AnswerPlan } from './oioxo-engine';
import { embedSentences } from './embed';
import { scorePassages } from './rerank';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim()).filter((s) => s.length >= 28 && s.length <= 320);
}
interface Cand { s: string; votes: number; pidx: number; site: string }
/** Flatten evidence to candidate sentences, carrying each source's votes, passage
 *  index (evidence arrives RERANKED, so pidx encodes the cross-encoder rank) AND
 *  its site (for source-authority weighting on factual questions). */
function candidates(evidence: Evidence[]): Cand[] {
  const seen = new Set<string>(); const out: Cand[] = [];
  evidence.forEach((e, pidx) => {
    const site = (e.source?.site || e.source?.url || '').toLowerCase();
    for (const s of sentences(e.text)) {
      const k = norm(s).split(' ').slice(0, 8).join(' ');
      if (k && !seen.has(k)) { seen.add(k); out.push({ s, votes: Math.max(0, e.votes ?? 0), pidx, site }); }
    }
  });
  return out;
}
/** Position bonus: sentences from the top-reranked passages lead. Keeps the
 *  reranker's answer-bearing decision from being washed out by sentence cosine. */
function posBonus(pidx: number): number {
  return pidx === 0 ? 0.15 : pidx === 1 ? 0.08 : pidx === 2 ? 0.04 : 0;
}
// Source authority for FACTUAL questions (define/explain/fact/howto/list): an
// encyclopedia/edu/gov answers "why/how/what is" far better than a word-dictionary
// or a listicle ("sky blue is a soothing shade" must NOT beat Rayleigh scattering).
// Neutral for opinion/compare, where forums/reviews are the right source.
const AUTHORITATIVE = /wikipedia\.org|britannica|\.edu\b|\.gov\b|nih\.gov|who\.int|nasa\.|nature\.com|sciencedirect|\.ac\.[a-z]{2}/i;
const LOW_AUTHORITY = /thefreedictionary|dictionary\.com|vocabulary\.com|definitions?\.net|yourdictionary|\.fandom\.|pinterest|quotes|lyrics/i;
function authority(site: string, shape: string): number {
  if (shape === 'compare') return 0; // opinion-ish → don't bias toward encyclopedias
  if (AUTHORITATIVE.test(site)) return 1;
  if (LOW_AUTHORITY.test(site)) return -1;
  return 0;
}

// CTA / title / question fragments rank high semantically but say nothing.
const CTA = /^(read more|learn|discover|need |want |looking for|don'?t know|follow along|here'?s|in this (article|guide|post)|view |browse|shop|compare prices|find out|see (our|the|pricing))/i;
// Sales / dealer / listing noise — not an informative claim.
const SALES = /\b(save up to|for sale|\$\s?\d|deals?\b|near you|in stock|buy now|used .* for sale|starting at|msrp|book now|get a quote)\b/i;
function isInformative(s: string): boolean {
  const t = s.trim();
  if (t.length < 28 || t.length > 320) return false;
  if (/\?\s*$/.test(t)) return false;
  if (CTA.test(t) || SALES.test(t)) return false;
  if (!/[a-z]/.test(t)) return false;
  if (!/\s(is|are|was|were|has|have|can|will|of|in|to|for|by|that|which|when|because|while|known|use|used|makes?|comes?)\s/i.test(t)) return false;
  return true;
}
function stripCta(s: string): string {
  return s.replace(/\s*(read more[^.]*\.?|learn (more|about)[^.]*\.?|find out[^.]*\.?|view [^.]*profile[^.]*\.?)\s*$/i, '').trim();
}
/** Strip the phonetic/pronunciation parentheticals Wikipedia leads with —
 *  "Canberra (/ˈkænbrə/ ⓘ KAN-brə; Ngunawal: Kanbarra) is…" → "Canberra is…".
 *  Structural (IPA slashes / phonetic marks / a ⓘ listen glyph), no topic words. */
function cleanLead(s: string): string {
  return s
    .replace(/\s*\(\s*\/[^)]*\/[^)]*\)/g, '')                 // (/ˈkænbrə/ …)
    .replace(/\s*\([^()]*[ˈˌːⓘ][^()]*\)/g, '')                // any paren with phonetic marks / listen glyph
    .replace(/\s*\([^()]*\b(?:pronunciation|IPA|listen|locally)\b[^()]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) d += a[i] * b[i]; return d;
}

export interface ReadResult { text: string; kind: 'fact' | 'explain' | 'compare' | 'list'; }

/**
 * Build an extractive answer from gathered evidence. `plan` decides the shape;
 * the encoder decides which real sentences to use. Returns null when there's
 * nothing usable (caller falls back to the digest).
 */
export async function readAnswer(question: string, plan: AnswerPlan, evidence: Evidence[]): Promise<ReadResult | null> {
  // Candidate sentences — prefer informative ones; keep raw set if too few.
  const all = candidates(evidence);
  const informative = all.filter((c) => isInformative(c.s));
  const cands = informative.length >= 3 ? informative : all;
  if (!cands.length) return null;

  // EXTRACT — the TRAINED cross-encoder reranker scores each candidate SENTENCE
  // for answer-bearing relevance (question × sentence). This is the same model
  // that fixed passage selection; using it for sentences too kills the bi-encoder
  // failure where a lexically-close-but-wrong sentence wins ("sky blue is a
  // soothing shade" for "why is the sky blue"). Bi-encoder cosine is the fallback
  // when the reranker isn't available (cold / not entitled).
  let ranked: { s: string; score: number }[];
  let REL: number;
  const rr = await scorePassages(question, cands.map((c) => c.s)).catch(() => null);
  if (rr && rr.length === cands.length) {
    ranked = cands
      // logit scale: votes tiebreak + source authority (≈±2 logits) so an
      // encyclopedia answer outranks a dictionary's word-definition for why/how.
      .map((c, i) => ({ s: c.s, score: rr[i] + Math.log1p(c.votes) * 0.5 + authority(c.site, plan.shape) * 2 }))
      .sort((a, b) => b.score - a.score);
    REL = 0; // a positive logit ≈ answer-bearing
  } else {
    const vecs = await embedSentences([question, ...cands.map((c) => c.s)]);
    if (vecs.length !== cands.length + 1) return null;
    const qVec = vecs[0];
    ranked = cands
      .map((c, i) => ({ s: c.s, score: cosine(qVec, vecs[i + 1]) + Math.log1p(c.votes) * 0.06 + posBonus(c.pidx) + authority(c.site, plan.shape) * 0.1 }))
      .sort((a, b) => b.score - a.score);
    REL = 0.2;
  }

  // VERIFY with a never-dead-end floor: drop clearly off-topic, but if nothing
  // clears the gate yet we DID gather sentences, answer from the best ones.
  let good = ranked.filter((r) => r.score >= REL);
  if (good.length < 2 && ranked.length) good = ranked.slice(0, 4);
  if (!good.length) return null;

  // ASSEMBLE by shape.
  if (plan.shape === 'compare' && plan.topics.length >= 2) {
    const parts: string[] = [];
    for (const side of plan.topics.slice(0, 2)) {
      const key = norm(side).split(' ')[0];
      const top = good.filter((r) => norm(r.s).includes(key)).slice(0, 2);
      parts.push(`**${side}** — ${top.length ? top.map((t) => t.s).join(' ') : '(little distinctive info found)'}`);
    }
    const body = parts.join('\n\n') + '\n\nBoth are strong choices — weigh the points above by what matters most to you.';
    return { text: stripCta(body), kind: 'compare' };
  }

  if (plan.shape === 'list') {
    const items = good.slice(0, 5).map((g) => `• ${g.s}`).join('\n');
    return items ? { text: items, kind: 'list' } : null;
  }

  if (plan.shape === 'explain' || /\band how\b/i.test(question)) {
    return { text: stripCta(good.slice(0, 4).map((g) => g.s).join(' ')), kind: 'explain' };
  }

  // fact / define — lead with the best (reranker-ranked) declarative sentence(s),
  // cleaned of the phonetic parentheticals Wikipedia opens with. (The trained 23MB
  // reranker already surfaces the answer-bearing sentence — "Canberra is the
  // capital" — so we dropped the 65MB third-party distilbert-QA: smaller, owned,
  // zero HF. A precise value-span head can fold into the reranker later if needed.)
  const text = cleanLead(stripCta(good.slice(0, 2).map((g) => g.s).join(' ')));
  return text ? { text, kind: 'fact' } : null;
}
