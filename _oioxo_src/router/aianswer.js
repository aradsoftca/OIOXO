/**
 * AI answer — extractive synthesis from top web results. Pure on-device,
 * no model required (a model can later replace the extractive heuristic).
 *
 * Strategy:
 *   1. Take top N web results from webresults.search()
 *   2. Tokenise + score each sentence by:
 *      - query-term overlap (BM25-lite)
 *      - position weight (earlier sentences score higher)
 *      - length penalty (≤30 chars excluded)
 *   3. Pick 2-3 highest-scoring sentences from DISTINCT sources
 *   4. Stitch with citation markers [1][2][3]
 *
 * The result has the same shape Google's AI Overview would: a synthesised
 * paragraph + a list of citations. Each citation = { n, title, url, source }.
 *
 * Exposes window.oioxoAiAnswer = { synthesize, fromWebResults }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoAiAnswer) return;

  const STOPS = new Set([
    'the','a','an','and','or','but','of','to','in','on','for','with','at','by','from',
    'is','are','was','were','be','been','being','do','does','did','have','has','had',
    'this','that','these','those','it','its','as','if','then','than','so','also',
  ]);

  function tokens(s){
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter((t) => t && !STOPS.has(t) && t.length > 1);
  }

  function splitSentences(text){
    if (!text) return [];
    return String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  }

  /** Score one sentence vs the query tokens. Lightweight BM25-ish. */
  function scoreSentence(sentence, qTokens, position){
    if (!sentence || sentence.length < 30) return 0;
    const sTokens = tokens(sentence);
    if (!sTokens.length) return 0;
    let hits = 0;
    const sSet = new Set(sTokens);
    for (const q of qTokens) if (sSet.has(q)) hits++;
    if (!hits) return 0;
    const overlapTerm = hits / Math.max(1, qTokens.length);
    const positionTerm = Math.max(0.4, 1 - position * 0.15);
    const lengthTerm = Math.min(1, sentence.length / 180);
    return overlapTerm * positionTerm * lengthTerm;
  }

  /** Synthesize an answer from a list of {title, snippet, url, source}. */
  function synthesize(query, sources, opts){
    opts = opts || {};
    if (!sources || !sources.length) return null;
    const qTokens = tokens(query);
    if (!qTokens.length) return null;
    const candidates = [];
    for (let si = 0; si < sources.length; si++){
      const src = sources[si];
      const sentences = splitSentences(src.snippet || src.title || '');
      for (let i = 0; i < sentences.length; i++){
        const s = scoreSentence(sentences[i], qTokens, i);
        if (s > 0) candidates.push({ sentence: sentences[i], score: s, sourceIdx: si });
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);

    const pickedSources = new Set();
    const used = [];
    for (const c of candidates){
      if (used.length >= (opts.maxSentences || 3)) break;
      if (pickedSources.has(c.sourceIdx)) continue;
      pickedSources.add(c.sourceIdx);
      used.push(c);
    }
    if (used.length < (opts.minSentences || 1)) return null;

    const citations = [];
    const citeMap = new Map();
    const parts = used.map((c) => {
      let n = citeMap.get(c.sourceIdx);
      if (!n){
        n = citations.length + 1;
        citeMap.set(c.sourceIdx, n);
        const src = sources[c.sourceIdx];
        citations.push({ n, title: src.title, url: src.url, source: src.source });
      }
      return c.sentence.replace(/[.!?]?\s*$/, '') + ' [' + n + ']';
    });

    return {
      kind: 'ai-answer',
      answer: parts.join('. ') + '.',
      citations,
      coverage: used.length / Math.max(1, (opts.maxSentences || 3)),
      confidence: Math.min(0.9, candidates[0].score * 1.2),
    };
  }

  /** Convenience: call webresults.search() then synthesize. */
  async function fromWebResults(query, catalog, opts){
    if (!window.oioxoWebResults) return null;
    const r = await window.oioxoWebResults.search(query, opts || {});
    if (!r || !r.results || !r.results.length) return null;
    return synthesize(query, r.results, opts);
  }

  window.oioxoAiAnswer = { synthesize, fromWebResults, scoreSentence, splitSentences };
})();
