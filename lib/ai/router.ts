/**
 * Xonvert AI — router.
 *
 * Given a natural-language request (and optional attached-file category), find
 * the tool that fulfils it. Blends the lexical ranker with the semantic
 * embedding ranker when the latter is ready, and reports a confidence so the
 * caller knows whether to act, offer choices, or fall back to chat.
 *
 * The language model is deliberately absent here — routing is done by retrieval.
 * The model's only future job (Phase 4) is to break ties among `candidates`
 * when confidence is 'ambiguous', grammar-constrained to those few IDs.
 */

import { searchTools, confidence as lexConfidence, fileMatchesCategory, REL_FLOOR, type SearchOptions } from './retrieval';
import { semanticRank, isEmbeddingsReady } from './embed';
import { docById, type IndexDoc } from './tool-index';

export type FileCategory = NonNullable<SearchOptions['fileCategory']>;

export interface ToolMatch {
  doc: IndexDoc;
  score: number;
}

export interface ToolRouting {
  confidence: 'confident' | 'ambiguous' | 'weak';
  top: ToolMatch | null;
  /** Top few matches (for showing alternatives or LLM tie-breaking). */
  candidates: ToolMatch[];
  /** Whether the semantic layer contributed (else lexical-only). */
  semantic: boolean;
}

const SEM_WEIGHT = 0.55;
const LEX_WEIGHT = 0.45;

export async function routeToTool(query: string, fileCat: FileCategory | null = null): Promise<ToolRouting> {
  const lex = searchTools(query, { fileCategory: fileCat, limit: 10 });

  // Lexical-only path (embeddings not warmed yet): reuse the validated ranker.
  if (!isEmbeddingsReady()) {
    return {
      confidence: lexConfidence(lex),
      top: lex[0] ? { doc: lex[0].doc, score: lex[0].score } : null,
      candidates: lex.slice(0, 4).map((r) => ({ doc: r.doc, score: r.score })),
      semantic: false,
    };
  }

  // Blended path. Normalise lexical to 0..1 so it composes with cosine sim.
  const maxLex = lex[0]?.score ?? 0;
  const lexNorm = new Map<string, number>();
  for (const r of lex) lexNorm.set(r.doc.id, maxLex > 0 ? r.score / maxLex : 0);

  const sem = await semanticRank(query);
  const semMap = new Map(sem.map((h) => [h.id, h.score]));

  const ids = new Set<string>(lexNorm.keys());
  for (const h of sem.slice(0, 12)) ids.add(h.id);

  const cands: ToolMatch[] = [];
  for (const id of ids) {
    const doc = docById(id);
    if (!doc) continue;
    if (fileCat && !fileMatchesCategory(doc, fileCat)) continue;
    const score = LEX_WEIGHT * (lexNorm.get(id) ?? 0) + SEM_WEIGHT * (semMap.get(id) ?? 0);
    cands.push({ doc, score });
  }
  cands.sort((a, b) => b.score - a.score);

  // Lexical relevance (idf-coverage) of the blended winner — its own absolute
  // floor, independent of the semantic score. A pure-semantic hit absent from
  // the lexical list has rel 0; we only let a strong blended score override the
  // floor, so genuine paraphrase matches survive but spurious ones don't.
  const lexRel = new Map(lex.map((r) => [r.doc.id, r.rel]));

  const top = cands[0] ?? null;
  let confidence: ToolRouting['confidence'] = 'weak';
  if (top) {
    const second = cands[1]?.score ?? 0;
    const margin = top.score > 0 ? (top.score - second) / top.score : 1;
    const rel = lexRel.get(top.doc.id) ?? 0;
    if (top.score < 0.3) confidence = 'weak';
    else if (rel < REL_FLOOR && top.score < 0.6) confidence = 'weak';
    else if (margin >= 0.15 || cands.length === 1) confidence = 'confident';
    else confidence = 'ambiguous';
  }

  return { confidence, top, candidates: cands.slice(0, 4), semantic: true };
}
