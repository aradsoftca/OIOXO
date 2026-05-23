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
  /**
   * Absolute relevance, 0..1: the fraction of the query's *distinctive* (idf-
   * weighted) information this tool actually matched. Unlike `score`, this is
   * comparable across queries — a tool that scores high only by matching a
   * common word ("now", "price") has low `rel`. Used to reject spurious matches
   * ("bitcoin price" → World Clock) that the relative confidence margin misses.
   */
  rel: number;
}

export interface SearchOptions {
  /** Restrict to tools that accept this file category (when a file is attached). */
  fileCategory?: 'image' | 'audio' | 'video' | 'pdf' | 'text' | null;
  limit?: number;
}

// The four "medium" categories where naming the medium ("video", "song", "pdf")
// is a strong, reliable signal — so a request that names one shouldn't route to
// a different medium's tool (e.g. "compress this VIDEO" → never pdf-compress).
const MEDIUM_WORDS: Record<string, 'image' | 'audio' | 'video' | 'pdf'> = {
  photo: 'image', picture: 'image', pic: 'image', image: 'image', images: 'image', jpg: 'image', jpeg: 'image', png: 'image',
  song: 'audio', audio: 'audio', sound: 'audio', music: 'audio', track: 'audio', mp3: 'audio', recording: 'audio',
  video: 'video', clip: 'video', movie: 'video', footage: 'video', mp4: 'video', film: 'video',
  pdf: 'pdf',
};
const MEDIUM_CATS = new Set(['image', 'audio', 'video', 'pdf']);

/** Strongest medium named in the query, if any (first wins; ties are rare). */
function queryMedium(qTerms: string[]): 'image' | 'audio' | 'video' | 'pdf' | null {
  for (const t of qTerms) { const m = MEDIUM_WORDS[t]; if (m) return m; }
  return null;
}

const PLURAL_RE = /\b(all|these|those|multiple|several|many|every|each|bunch|batch|bulk|files|photos|images|pictures|pdfs|videos|songs)\b/i;

// --- typo tolerance --------------------------------------------------------

// Bounded Levenshtein: returns distance, or `max+1` once it provably exceeds max.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v); if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // whole row already over budget → bail
    prev = cur;
  }
  return prev[b.length];
}

let _vocab: string[] | null = null;
function vocabulary(): string[] {
  if (!_vocab) _vocab = Array.from(docFreq().keys()).filter((t) => t.length >= 4);
  return _vocab;
}

/**
 * Correct a query term that matches NO tool vocabulary to its nearest known term
 * ("kompress" → "compress", "imag" → "image"). General typo tolerance — no
 * per-word rules. Only fires for unmatched 4+ char terms, so real terms and
 * short words are untouched.
 */
function correctTerm(term: string, df: Map<string, number>): string {
  if (term.length < 4 || (df.get(term) ?? 0) > 0) return term;
  // Distance 1 only: catches the overwhelmingly common single-char typos while
  // never "correcting" a real word that's 2 edits from a tool term (e.g.
  // "protected" → "protect", which would flip unlock→protect).
  const max = 1;
  let best = term, bestD = max + 1;
  for (const v of vocabulary()) {
    if (Math.abs(v.length - term.length) > max) continue;
    const d = editDistance(term, v, bestD - 1);
    if (d < bestD) { bestD = d; best = v; if (d === 1) break; }
  }
  return best;
}

export function fileMatchesCategory(doc: IndexDoc, cat: NonNullable<SearchOptions['fileCategory']>): boolean {
  // AI abilities (translate/summarize) work on text extracted from ANY medium,
  // so they stay eligible under any file filter — otherwise "summarize this pdf"
  // would be filtered to PDF tools and lose the summarize intent.
  if (doc.id.startsWith('ai-')) return true;
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
  const docs = indexDocs();
  const df = docFreq();
  // Tokenize, then typo-correct any term that matches nothing → the request
  // routes correctly even when misspelled ("kompress this imag").
  const qTerms = tokenize(query).map((t) => correctTerm(t, df));
  if (!qTerms.length) return [];

  const N = docs.length;
  const limit = opts.limit ?? 8;

  // Intent signals read once from the whole query (not per-doc).
  const medium = queryMedium(qTerms);     // explicit "video"/"song"/"pdf"/…
  const plural = PLURAL_RE.test(query);   // "all", "these", "batch", plural nouns

  // Query term weights (idf), de-duplicated.
  const qWeights = new Map<string, number>();
  for (const term of qTerms) {
    const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
    qWeights.set(term, (qWeights.get(term) ?? 0) + idf);
  }
  // Total distinctive mass of the query — the denominator for `rel`. A tool's
  // relevance is how much of THIS the tool's matched terms account for.
  let queryIdf = 0;
  for (const w of qWeights.values()) queryIdf += w;

  const ranked: Ranked[] = [];
  for (const doc of docs) {
    if (opts.fileCategory && !fileMatchesCategory(doc, opts.fileCategory)) continue;

    // Term frequencies are precomputed on the doc (no per-query rebuild) — this
    // is what keeps routing instant on low-end devices even across 323 tools.
    const tf = doc.tf;

    let score = 0;
    let matched = 0;
    let matchedIdf = 0;            // idf mass this doc actually matched
    for (const [term, qw] of qWeights) {
      const f = tf.get(term);
      if (!f) continue;
      matched += 1;
      matchedIdf += qw;
      score += qw * (1 + Math.log(f)); // sublinear tf
    }
    if (score === 0) continue;

    // Reward covering more of the query (helps multi-word intents).
    const coverage = matched / qWeights.size;
    score *= 0.5 + 0.5 * coverage;
    // Length-normalise so keyword-stuffed tools don't dominate (precomputed).
    score /= doc.norm;

    // Medium anchoring: if the user named a medium and this tool belongs to a
    // *different* medium category, it almost certainly isn't what they meant
    // (the classic "compress this video" → pdf-compress bleed). Non-medium
    // categories like convert/generator/dev are never penalised.
    if (medium && MEDIUM_CATS.has(doc.category) && doc.category !== medium) score *= 0.4;

    // Batch tools answer bulk requests ("convert all to webp"), not singular
    // ones ("convert this png"). Demote them unless the query signals plurality.
    const isBatch = doc.id.includes('batch') || /\b(batch|bulk)\b/i.test(doc.name);
    if (isBatch && !plural) score *= 0.45;

    ranked.push({ doc, score, rel: queryIdf > 0 ? matchedIdf / queryIdf : 0 });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/**
 * Minimum `rel` (idf-coverage) for a match to count as relevant at all. Below
 * this, the top tool explained too little of the query's distinctive content —
 * it matched only common words ("now", "price", "best") and missed the point.
 * Genuine tool requests sit at 0.53–1.0 in the corpus; spurious off-domain hits
 * ("can you tell bitcoin price" → World Clock = 0.38) sit well below. The 0.4
 * line leaves a comfortable margin above the genuine floor.
 */
export const REL_FLOOR = 0.4;

/**
 * Confidence read on a ranked list:
 *  - `confident`: clear winner — act without the model.
 *  - `ambiguous`: a few close candidates — let the model break the tie.
 *  - `weak`: nothing strong — fall back to chat / suggestions.
 *
 * Two independent gates make a winner "weak": a low absolute score (nothing
 * matched much) OR low relevance (what matched wasn't the distinctive part of
 * the query). The second is what stops a high-scoring spurious match.
 */
export function confidence(ranked: Ranked[]): 'confident' | 'ambiguous' | 'weak' {
  if (ranked.length === 0) return 'weak';
  const top = ranked[0].score;
  if (top < 0.15) return 'weak';
  if (ranked[0].rel < REL_FLOOR) return 'weak';
  const second = ranked[1]?.score ?? 0;
  const margin = top > 0 ? (top - second) / top : 1;
  if (margin >= 0.35 || ranked.length === 1) return 'confident';
  return 'ambiguous';
}
