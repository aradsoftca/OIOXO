/**
 * Web results — federated public web search using CORS-clean free APIs.
 * NO server, NO API keys. Operates entirely from the user's browser:
 *
 *   wikipedia        — REST API search + summary
 *   duckduckgo       — Instant Answer API (no key, CORS-friendly)
 *   reddit           — JSONP (no CORS issue)
 *   jina             — r.jina.ai for snippet extraction from any URL
 *
 * Each source has a wall-clock budget; on budget exceeded we drop the
 * source quietly and return what we have. Results are merged + deduped
 * by URL host+path. The caller (SERP) shows them as the "Web" block
 * beneath tool cards.
 *
 * Operators are honoured: `site:`, `-site:`, `filetype:`, `"phrase"`,
 * `-exclude` all filter the merged list.
 *
 * Exposes window.oioxoWebResults = { search, sources, stats, configure }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoWebResults) return;

  const BUDGET_MS = 800;
  const PER_SOURCE_BUDGET = 600;
  const enabled = { wikipedia: true, duckduckgo: true, reddit: true, jina: false };
  const stats = { wikipedia: 0, duckduckgo: 0, reddit: 0, jina: 0, errors: 0 };

  function configure(opts){
    if (!opts) return;
    if (opts.enabled) Object.assign(enabled, opts.enabled);
  }
  function sources(){ return Object.entries(enabled).filter(([, v]) => v).map(([k]) => k); }

  function withBudget(promise, ms){
    return Promise.race([
      promise,
      new Promise((res) => setTimeout(() => res(null), ms || PER_SOURCE_BUDGET)),
    ]);
  }

  // -------------------- WIKIPEDIA --------------------
  // Free, CORS-clean. Use search for candidates + summary for the top hit.
  async function searchWikipedia(q){
    if (typeof fetch === 'undefined') return [];
    try {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=' +
        encodeURIComponent(q) + '&srlimit=3&origin=*';
      const r = await withBudget(fetch(url).then((r) => r.json()));
      if (!r || !r.query || !r.query.search) return [];
      stats.wikipedia++;
      return r.query.search.slice(0, 3).map((h) => ({
        source: 'wikipedia',
        title: h.title,
        url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_')),
        snippet: String(h.snippet || '').replace(/<[^>]+>/g, ''),
        score: 0.9,
      }));
    } catch { stats.errors++; return []; }
  }

  // -------------------- DUCKDUCKGO --------------------
  // Instant Answer API. CORS is finicky; we always include no_html=1.
  async function searchDDG(q){
    if (typeof fetch === 'undefined') return [];
    try {
      const url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(q) +
        '&format=json&no_redirect=1&no_html=1&skip_disambig=1';
      const r = await withBudget(fetch(url).then((r) => r.json()));
      if (!r) return [];
      stats.duckduckgo++;
      const out = [];
      if (r.AbstractText){
        out.push({
          source: 'duckduckgo',
          title: r.Heading || q,
          url: r.AbstractURL || ('https://duckduckgo.com/?q=' + encodeURIComponent(q)),
          snippet: r.AbstractText,
          score: 0.95,
        });
      }
      for (const t of (r.RelatedTopics || []).slice(0, 4)){
        if (!t.FirstURL || !t.Text) continue;
        out.push({
          source: 'duckduckgo',
          title: t.Text.slice(0, 80),
          url: t.FirstURL,
          snippet: t.Text,
          score: 0.6,
        });
      }
      return out;
    } catch { stats.errors++; return []; }
  }

  // -------------------- REDDIT --------------------
  // JSONP works everywhere; no CORS issue.
  async function searchReddit(q){
    if (typeof window.oioxoJsonp === 'undefined') {
      // Fallback: try direct fetch — most browsers actually accept reddit.com CORS.
      if (typeof fetch === 'undefined') return [];
      try {
        const url = 'https://www.reddit.com/search.json?q=' + encodeURIComponent(q) + '&limit=4&restrict_sr=&sort=relevance';
        const r = await withBudget(fetch(url).then((r) => r.json()));
        if (!r || !r.data || !r.data.children) return [];
        stats.reddit++;
        return r.data.children.slice(0, 4).map((c) => ({
          source: 'reddit',
          title: c.data.title,
          url: 'https://www.reddit.com' + c.data.permalink,
          snippet: (c.data.selftext || '').slice(0, 200),
          score: 0.7,
        }));
      } catch { stats.errors++; return []; }
    }
    try {
      const data = await withBudget(window.oioxoJsonp('https://www.reddit.com/search.json?q=' + encodeURIComponent(q) + '&limit=4'));
      if (!data || !data.data) return [];
      stats.reddit++;
      return data.data.children.slice(0, 4).map((c) => ({
        source: 'reddit',
        title: c.data.title,
        url: 'https://www.reddit.com' + c.data.permalink,
        snippet: (c.data.selftext || '').slice(0, 200),
        score: 0.7,
      }));
    } catch { stats.errors++; return []; }
  }

  // -------------------- JINA --------------------
  // Optional: r.jina.ai extracts any URL's content as markdown. Used to
  // hydrate snippets of other results when their snippets are too short.
  async function hydrateViaJina(result){
    if (!enabled.jina || !result || !result.url) return result;
    if (typeof fetch === 'undefined') return result;
    if (result.snippet && result.snippet.length > 80) return result;
    try {
      const md = await withBudget(fetch('https://r.jina.ai/' + result.url).then((r) => r.text()), 500);
      if (md){
        stats.jina++;
        const first = md.split('\n').filter((l) => l.trim()).slice(0, 6).join(' ').slice(0, 220);
        result.snippet = first || result.snippet;
      }
    } catch { stats.errors++; }
    return result;
  }

  // -------------------- MERGE + FILTER --------------------
  function applyOperators(results, operators){
    if (!operators) return results;
    let filtered = results.slice();
    if (operators.site && operators.site.length){
      filtered = filtered.filter((r) => operators.site.some((s) => (r.url || '').toLowerCase().includes(s)));
    }
    if (operators.excludeSites && operators.excludeSites.length){
      filtered = filtered.filter((r) => !operators.excludeSites.some((s) => (r.url || '').toLowerCase().includes(s)));
    }
    if (operators.filetypes && operators.filetypes.length){
      filtered = filtered.filter((r) => {
        const u = (r.url || '').toLowerCase();
        return operators.filetypes.some((ft) => u.endsWith('.' + ft));
      });
    }
    if (operators.phrases && operators.phrases.length){
      filtered = filtered.filter((r) => {
        const blob = ((r.title || '') + ' ' + (r.snippet || '')).toLowerCase();
        return operators.phrases.every((p) => blob.includes(p.toLowerCase()));
      });
    }
    if (operators.excludes && operators.excludes.length){
      filtered = filtered.filter((r) => {
        const blob = ((r.title || '') + ' ' + (r.snippet || '')).toLowerCase();
        return !operators.excludes.some((x) => blob.includes(x.toLowerCase()));
      });
    }
    return filtered;
  }

  function dedup(results){
    const seen = new Set();
    const out = [];
    for (const r of results){
      const key = String(r.url || '').replace(/^https?:\/\//, '').split('?')[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  /** Top-level: parallel fan-out, merged + filtered + ranked. */
  async function search(rawQ, opts){
    opts = opts || {};
    const t0 = Date.now();
    const results = [];
    const todo = [];
    if (enabled.wikipedia) todo.push(searchWikipedia(rawQ));
    if (enabled.duckduckgo) todo.push(searchDDG(rawQ));
    if (enabled.reddit) todo.push(searchReddit(rawQ));
    const settled = await Promise.race([
      Promise.all(todo),
      new Promise((res) => setTimeout(() => res([]), BUDGET_MS)),
    ]);
    if (Array.isArray(settled)) for (const arr of settled) if (Array.isArray(arr)) results.push(...arr);
    let merged = dedup(results);
    if (opts.operators) merged = applyOperators(merged, opts.operators);
    if (enabled.jina && opts.hydrate){
      await Promise.all(merged.slice(0, 3).map(hydrateViaJina));
    }
    merged.sort((a, b) => (b.score || 0) - (a.score || 0));
    const limit = opts.limit || 10;
    return {
      results: merged.slice(0, limit),
      took: Date.now() - t0,
      sources: sources(),
      total: merged.length,
    };
  }

  window.oioxoWebResults = { search, sources, stats: () => Object.assign({}, stats), configure };
})();
