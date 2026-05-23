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
      { role: 'system', content: 'Turn the user question into 1 to 3 focused web search queries that would find the best pages to answer it (use keywords, not full sentences). For a comparison, make one query per thing. Reply ONLY JSON: {"queries":["..."]}.' },
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

/** Deterministic queries when the model can't plan (cold / WASM / bad output). */
export function fallbackQueries(question: string, extraTopics: string[] = []): string[] {
  const qs = [cleanQuery(question), ...extraTopics.map((t) => cleanQuery(t))].filter(Boolean);
  return Array.from(new Set(qs)).slice(0, 3);
}

/** Run the queries and collect clean, de-duplicated passages (the synthesis input). */
export async function gatherForQueries(queries: string[]): Promise<Evidence[]> {
  const seen = new Set<string>();
  const ev: Evidence[] = [];
  for (const q of queries.slice(0, 3)) {
    const passages = await gatherPassages(q, 2);
    for (const p of passages) {
      if (seen.has(p.source.url) || !p.text) continue;
      seen.add(p.source.url);
      ev.push({ topic: q, text: p.text, source: p.source });
      if (ev.length >= 4) return ev;
    }
  }
  return ev;
}

/** Build the synthesis messages: write ONE organized answer from the passages. */
export function buildResearchSynthesis(question: string, evidence: Evidence[]): { system: string; user: string } {
  const notes = evidence.map((e, i) => `Source ${i + 1} (${e.source.site}):\n"""${e.text}"""`).join('\n\n');
  return {
    system:
      'Write a clear, well-organized answer to the question using ONLY the sources below. Merge the relevant facts across sources; do NOT copy one source verbatim and do NOT add anything not in the sources. 4–7 sentences, neutral and concise. No preamble, no "according to the sources".',
    user: `${notes}\n\nQuestion: ${question}`,
  };
}

/** Dedup citations from gathered evidence (for the answer's source chips). */
export function researchSources(evidence: Evidence[]) {
  const seen = new Set<string>();
  return evidence.filter((e) => e.source.url && !seen.has(e.source.url) && seen.add(e.source.url)).map((e) => e.source).slice(0, 3);
}
