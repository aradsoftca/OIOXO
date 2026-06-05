/**
 * TF-IDF scorer — replaces the naive token-overlap heuristic in
 * aianswer.js with a proper Term-Frequency Inverse-Document-Frequency
 * score over the candidate sentence pool.
 *
 *   score(query, sentences) → array of {sentence, idx, score, terms}
 *
 * Pure on-device, ~100 lines, no model required.
 *
 * Exposes window.oioxoTfidf = { score, idf, tokens }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTfidf) return;

  const STOP = new Set([
    'a','an','the','of','to','in','on','for','with','at','by','from','as','is','are',
    'was','were','be','been','this','that','these','those','it','its','and','or','but',
    'not','no','so','what','when','where','why','how','who','which','my','your','our',
  ]);

  function tokens(s){
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP.has(t));
  }

  /** Inverse document frequency across a sentence pool. */
  function idf(sentences){
    const df = new Map();
    const N = sentences.length;
    for (const s of sentences){
      const seen = new Set();
      for (const tok of tokens(s)){
        if (seen.has(tok)) continue;
        seen.add(tok);
        df.set(tok, (df.get(tok) || 0) + 1);
      }
    }
    const idfMap = new Map();
    for (const [tok, count] of df.entries()){
      idfMap.set(tok, Math.log((N + 1) / (count + 1)) + 1);
    }
    return idfMap;
  }

  /** Score each sentence against the query.
   *  Returns descending. Position penalty applied for very-late sentences. */
  function score(query, sentences){
    const qTokens = new Set(tokens(query));
    if (!qTokens.size || !sentences.length) return [];
    const idfMap = idf(sentences);
    const out = sentences.map((s, idx) => {
      const sTokens = tokens(s);
      if (!sTokens.length) return { sentence: s, idx, score: 0, terms: 0 };
      let tfidfSum = 0;
      let hits = 0;
      const tf = new Map();
      for (const tok of sTokens) tf.set(tok, (tf.get(tok) || 0) + 1);
      for (const tok of qTokens){
        const tfVal = tf.get(tok);
        if (!tfVal) continue;
        hits++;
        tfidfSum += (tfVal / sTokens.length) * (idfMap.get(tok) || 0);
      }
      if (!hits) return { sentence: s, idx, score: 0, terms: 0 };
      // Position decay — earlier sentences are usually more important
      // (lede). Modest decay to avoid burying late but relevant ones.
      const posDecay = Math.max(0.6, 1 - idx * 0.08);
      const lengthBoost = Math.min(1, sTokens.length / 30);
      return { sentence: s, idx, score: tfidfSum * posDecay * lengthBoost, terms: hits };
    });
    return out.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  }

  window.oioxoTfidf = { score, idf, tokens };
})();
