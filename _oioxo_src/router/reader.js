/**
 * Reader — fetches full page content via r.jina.ai (CORS-clean) for top N
 * web results, runs TF-IDF + QA-pattern + authority scoring on the
 * FULL body (not just snippets), produces a synthesized answer with
 * paragraph-level citations.
 *
 *   read(url) → { md, title }
 *   answer(query, webResults, opts) → ai-answer intent
 *
 * Used by serp.js when context.deepRead is true (heavy queries only).
 *
 * Exposes window.oioxoReader = { read, answer }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoReader) return;

  const BUDGET_MS = 2500;
  const cache = new Map();
  const CACHE_TTL_MS = 15 * 60 * 1000;

  async function read(url){
    if (typeof fetch === 'undefined' || !url) return null;
    const c = cache.get(url);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const proxied = 'https://r.jina.ai/' + url;
      const r = await Promise.race([
        fetch(proxied).then((r) => r.ok ? r.text() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r) return null;
      const lines = r.split('\n').map((l) => l.trim());
      const titleLine = lines.find((l) => /^#\s+/.test(l));
      const title = titleLine ? titleLine.replace(/^#\s+/, '') : '';
      const paragraphs = [];
      let buf = [];
      for (const ln of lines){
        if (!ln){ if (buf.length){ paragraphs.push(buf.join(' ')); buf = []; } }
        else if (!/^[#>*\-+|\[]/.test(ln)){ buf.push(ln); }
      }
      if (buf.length) paragraphs.push(buf.join(' '));
      const result = { title, paragraphs: paragraphs.filter((p) => p.length > 60).slice(0, 12) };
      cache.set(url, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function answer(query, webResults, opts){
    opts = opts || {};
    if (!webResults || !webResults.results || !webResults.results.length) return null;
    const topN = Math.min(3, webResults.results.length);
    const pages = await Promise.all(webResults.results.slice(0, topN).map((r) => read(r.url)));
    const sources = [];
    const pool = [];
    const sourceMap = [];
    for (let i = 0; i < topN; i++){
      const page = pages[i];
      const src = webResults.results[i];
      if (!page) continue;
      sources.push({ title: page.title || src.title, url: src.url, source: src.source });
      for (const p of page.paragraphs){
        pool.push(p);
        sourceMap.push(sources.length - 1);
      }
    }
    if (!pool.length || !window.oioxoTfidf || !window.oioxoQaPattern || !window.oioxoAuthority){
      return null;
    }
    const scored = window.oioxoTfidf.score(query, pool);
    const qaKind = window.oioxoQaPattern.classify(query).kind;
    const biased = window.oioxoQaPattern.biasSentences(scored, qaKind);
    const withAuth = biased.map((x) => {
      const auth = window.oioxoAuthority.score(sources[sourceMap[x.idx]].url);
      return Object.assign({}, x, { score: x.score * auth, sourceIdx: sourceMap[x.idx] });
    }).sort((a, b) => b.score - a.score);

    const used = []; const seen = new Set();
    for (const c of withAuth){
      if (used.length >= 3) break;
      if (seen.has(c.sourceIdx)) continue;
      seen.add(c.sourceIdx);
      used.push(c);
    }
    if (!used.length) return null;
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
      return c.sentence.slice(0, 280).replace(/[.!?]?\s*$/, '') + ' [' + n + ']';
    });
    return {
      kind: 'ai-answer',
      answer: parts.join('. ') + '.',
      citations,
      method: 'reader+tfidf+qa+auth',
      confidence: Math.min(0.92, used[0].score),
    };
  }

  window.oioxoReader = { read, answer };
})();
