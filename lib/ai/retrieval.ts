/**
 * Xonvert AI — retrieval.
 *
 * Ranks tools against a natural-language request. This is the layer that does
 * the "understanding" so the tiny model doesn't have to: a good ranked list
 * means the router can often act with no model call at all, and when it does
 * call the model it only has to choose between the top few.
 *
 * Phase 2 adds a semantic (embedding) score that blends with this lexical one;
 * the interface (`Ranked`, `searchTools`) stays the same so callers don't change.
 */

import { indexDocs, docFreq, tokenize, type IndexDoc } from './tool-index';

export interface Ranked {
  doc: IndexDoc;
  score: number;
}

export interface SearchOptions {
  /** Restrict to tools that accept this file category (when a file is attached). */
  fileCategory?: 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;
  limit?: number;
}

export function fileMatchesCategory(doc: IndexDoc, cat: NonNullable<SearchOptions['fileCategory']>): boolean {
  const a = doc.accepts.join(' ');
  switch (cat) {
    case 'image': return /image\//.test(a);
    case 'audio': return /audio\//.test(a);
    case 'video': return /video\//.test(a);
    case 'pdf':   return /pdf/.test(a);
    case 'text':  return /text|json|csv/.test(a);
  }
}

/**
 * TF-IDF cosine-ish lexical score. Rare, specific terms (e.g. "watermark")
 * count far more than common ones (e.g. "image"), which is exactly what we want
 * for routing — the distinctive word in a request usually names the tool.
 */
export function searchTools(query: string, opts: SearchOptions = {}): Ranked[] {
  const qTerms = tokenize(query);
  if (!qTerms.length) return [];

  const docs = indexDocs();
  const df = docFreq();
  const N = docs.length;
  const limit = opts.limit ?? 8;

  // Query term weights (idf), de-duplicated.
  const qWeights = new Map<string, number>();
  for (const term of qTerms) {
    const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
    qWeights.set(term, (qWeights.get(term) ?? 0) + idf);
  }

  const ranked: Ranked[] = [];
  for (const doc of docs) {
    if (opts.fileCategory && !fileMatchesCategory(doc, opts.fileCategory)) continue;

    // Term frequency in the doc.
    const tf = new Map<string, number>();
    for (const t of doc.terms) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    let matched = 0;
    for (const [term, qw] of qWeights) {
      const f = tf.get(term);
      if (!f) continue;
      matched += 1;
      score += qw * (1 + Math.log(f)); // sublinear tf
    }
    if (score === 0) continue;

    // Reward covering more of the query (helps multi-word intents).
    const coverage = matched / qWeights.size;
    score *= 0.5 + 0.5 * coverage;
    // Length-normalise so keyword-stuffed tools don't dominate.
    score /= Math.sqrt(doc.terms.length || 1);

    ranked.push({ doc, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/**
 * Confidence read on a ranked list:
 *  - `confident`: clear winner — act without the model.
 *  - `ambiguous`: a few close candidates — let the model break the tie.
 *  - `weak`: nothing strong — fall back to chat / suggestions.
 */
export function confidence(ranked: Ranked[]): 'confident' | 'ambiguous' | 'weak' {
  if (ranked.length === 0) return 'weak';
  const top = ranked[0].score;
  if (top < 0.15) return 'weak';
  const second = ranked[1]?.score ?? 0;
  const margin = top > 0 ? (top - second) / top : 1;
  if (margin >= 0.35 || ranked.length === 1) return 'confident';
  return 'ambiguous';
}
