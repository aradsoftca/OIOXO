/**
 * Xonvert AI — research loop (Strategy B: multi-source synthesis).
 *
 * What ChatGPT does for a rich question, done with a 0.5B + the live web:
 *   1. PLAN — turn the question into 1–3 focused search queries (the model is
 *      good at this; it's a short task). "knows what to search."
 *   2. GATHER — search each, read the top pages, pull CLEAN relevant passages
 *      (not raw HTML — the model drowns in that).
 *   3. SYNTHESIZE — the model writes one organized answer from those passages,
 *      using ONLY them, then we VERIFY it's grounded and cite every source.
 *
 * Honest ceiling: the writing is short and plain (a 0.5B), but it's a real
 * multi-source synthesis — organized and truthful — not a copy-pasted snippet.
 * This module is pure (prompts + parsing + gather); the model calls live in
 * AiApp. The query planner and gather are Node-testable.
 */

import { cleanQuery } from './search';
import { gatherPassages } from './web-read';
import { isGrounded, type Evidence } from './reason';

export { isGrounded };
export type { Evidence };

/** Messages + schema for the model to plan focused search queries. */
export function planQueriesMessages(question: string): { messages: { role: 'system' | 'user'; content: string }[]; schema: string } {
  return {
    messages: [
      { role: 'system', content: 'Turn the user question into 1 to 3 focused web search queries that would find the best pages to answer it (use keywords, not full sentences). For a comparison, make one query per thing. Reply ONLY JSON: {"queries":["..."]}. /no_think' },
      { role: 'user', content: question },
    ],
    schema: JSON.stringify({ type: 'object', properties: { queries: { type: 'array', items: { type: 'string' } } }, required: ['queries'] }),
  };
}

/** Parse the planned queries from the model reply (tolerant of WASM prose). */
export function parseQueries(raw: string): string[] {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : raw);
    return Array.isArray(o.queries) ? o.queries.filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 1).map((q: string) => q.trim()).slice(0, 3) : [];
  } catch { return []; }
}

/**
 * Decompose an explanatory question into facets to gather from several angles —
 * the deterministic backbone of multi-hop answers ("why did Rome fall" → the
 * event + its causes + its effects). Reliable (not the weak model), so the
 * synthesis always has multiple facts to connect. Returns 1 query for simple
 * lookups.
 */
export function facetQueries(question: string): string[] {
  const core = cleanQuery(question);
  const lc = question.toLowerCase();
  // GENERIC multi-part handling (structural, no topic vocabulary): a question
  // that asks more than one thing — two+ interrogatives, or clauses joined by
  // "and"/commas — is researched part-by-part. We split into clauses and ground
  // any subjectless aspect in the shared subject (the words before the first
  // question word). Works for ANY multi-part question, not a memorised pattern.
  const interro = question.match(QWORD_G) || [];
  if (interro.length >= 2) {
    const clauses = question.split(/\s*(?:,|;|\band\b|\balso\b)\s*/i).map((c) => c.trim()).filter(Boolean);
    // The shared subject comes from the FIRST clause: the words before its first
    // question word ("ww1 how…" → "world war i"), else the clause's cleaned head.
    const head = clauses[0] ?? question;
    const beforeQ = head.split(QWORD)[0].trim();
    const subject = (beforeQ.length >= 2 ? cleanQuery(beforeQ) : cleanQuery(head)).split(/\s+/).slice(0, 3).join(' ');
    const qs = clauses.map((c) => {
      const cc = cleanQuery(c);
      if (!cc) return '';
      // Ground a short subjectless aspect ("how ended") in the shared subject.
      return cc.split(/\s+/).length <= 2 && subject && !cc.includes(subject) ? `${subject} ${cc}` : cc;
    });
    const out = uniq(qs.filter(Boolean));
    if (out.length >= 2) return out;
  }
  if (/\bwhy\b/.test(lc)) return uniq([core, `${core} causes`, `${core} reasons explained`]);
  if (/\bhow (does|do|did|is|are|can)\b/.test(lc) || /^\s*how\b/.test(lc)) return uniq([core, `${core} explained`, `${core} step by step`]);
  if (/\bdifference between\b|\bvs\b|\bversus\b|\bcompared? to\b/.test(lc)) return uniq([core]); // comparison handled by per-entity gather
  if (/\beffects?\b|\bimpact\b|\bconsequences?\b/.test(lc)) return uniq([core, `${core} consequences`, `${core} explained`]);
  return [core];
}

const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean))).slice(0, 3);

// Interrogatives — the structural markers of "a question" (used to split a
// multi-part question into its parts). Not topic vocabulary.
const QWORD = /\b(?:how|why|what|when|where|who|which|whom|whose)\b/i;
const QWORD_G = /\b(?:how|why|what|when|where|who|which|whom|whose)\b/gi;

/** Deterministic queries when the model can't plan (cold / WASM / bad output) —
 *  uses facet decomposition so explanatory questions still gather many angles. */
export function fallbackQueries(question: string, extraTopics: string[] = []): string[] {
  const facets = facetQueries(question);
  if (facets.length > 1) return facets;
  return uniq([cleanQuery(question), ...extraTopics.map((t) => cleanQuery(t))]);
}

/**
 * Run the queries and collect clean passages from MANY sources — the synthesis
 * input. Broad on purpose (up to `cap` passages) and DIVERSE: at most 2 from any
 * one site, so the answer weighs several independent sources instead of leaning
 * on one (e.g. Wikipedia). Snippet-first, fetched in parallel → still fast.
 */
export async function gatherForQueries(queries: string[], cap = 10): Promise<Evidence[]> {
  const results = await Promise.all(
    queries.slice(0, 3).map((q) => gatherPassages(q, 6).then((ps) => ({ q, ps })).catch(() => ({ q, ps: [] as Awaited<ReturnType<typeof gatherPassages>> }))),
  );
  const seen = new Set<string>();
  const perSite = new Map<string, number>();
  const ev: Evidence[] = [];
  // Round-robin across facets so a multi-part question (start AND end) keeps both
  // sides, rather than filling up on whichever facet returned first.
  const maxDepth = Math.max(0, ...results.map((r) => r.ps.length));
  for (let i = 0; i < maxDepth && ev.length < cap; i++) {
    for (const { q, ps } of results) {
      const p = ps[i];
      if (!p || !p.text || seen.has(p.source.url)) continue;
      const site = p.source.site || 'web';
      if ((perSite.get(site) ?? 0) >= 2) continue; // diversity cap per source
      seen.add(p.source.url);
      perSite.set(site, (perSite.get(site) ?? 0) + 1);
      ev.push({ topic: q, text: p.text, source: p.source });
      if (ev.length >= cap) break;
    }
  }
  return ev;
}

/**
 * Gather rich, multi-source notes for a DECISION between options. Reads EACH
 * side broadly AND head-to-head sources, so the answer can actually weigh them
 * instead of parroting one listing ("read all, then analyze"). Snippet-first +
 * diversity-capped via gatherForQueries, so it stays fast and multi-source.
 */
export async function gatherComparison(topics: string[], _question: string): Promise<Evidence[]> {
  const [a, b] = topics;
  // Exactly three queries (gatherForQueries reads the first three): each option
  // on its own, plus a head-to-head query that surfaces real comparison pages.
  const queries = [cleanQuery(a), cleanQuery(b), `${cleanQuery(a)} vs ${cleanQuery(b)} comparison`].filter(Boolean);
  return gatherForQueries(queries, 12);
}

/** Build the synthesis messages: write ONE organized answer from the passages. */
export function buildResearchSynthesis(question: string, evidence: Evidence[]): { system: string; user: string } {
  const notes = evidence.map((e, i) => `Source ${i + 1} (${e.source.site}):\n"""${e.text}"""`).join('\n\n');
  return {
    system:
      'Answer the question using ONLY the sources below. Be SHORT — 2–3 sentences, direct, no filler, no preamble, no "according to the sources" or "S1/S2". CONNECT the facts across the sources to explain (especially for how/why questions). If the sources do not support an answer or connection, say you could not find it. Do not copy one source verbatim; add nothing not in the sources. /no_think',
    user: `${notes}\n\nQuestion: ${question}`,
  };
}

/**
 * Stricter retry prompt for self-correction: used when the first synthesis was
 * rejected by the grounding gate (it drifted/invented). Forces literal copying
 * of names/numbers and an explicit "not found" escape.
 */
export function buildStrictSynthesis(question: string, evidence: Evidence[]): { system: string; user: string } {
  const notes = evidence.map((e, i) => `Source ${i + 1} (${e.source.site}):\n"""${e.text}"""`).join('\n\n');
  return {
    system:
      'Answer the question using ONLY the sources. Copy every name, number and key term EXACTLY as written in the sources — invent NOTHING. If the sources do not contain the answer, reply exactly: "I couldn\'t find that in the sources." Be SHORT — 1–2 sentences, no preamble. /no_think',
    user: `${notes}\n\nQuestion: ${question}`,
  };
}

/** Dedup citations from gathered evidence (for the answer's source chips). */
export function researchSources(evidence: Evidence[]) {
  const seen = new Set<string>();
  return evidence.filter((e) => e.source.url && !seen.has(e.source.url) && seen.add(e.source.url)).map((e) => e.source).slice(0, 3);
}
