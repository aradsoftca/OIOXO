/**
 * News card — aggregates current-events from CORS-clean public sources:
 *
 *   wikipedia-current-events  — daily curated headlines (CORS-clean)
 *   reddit r/worldnews        — top posts in last 24h
 *   reddit r/news             — top posts in last 24h
 *
 * The result is a deduplicated headline list with source attribution and
 * a relative timestamp. Triggers on "news" / "latest news" / "world news"
 * or topic-prefixed variants ("news about X", "X news").
 *
 * Exposes window.oioxoNews = { tryCard, fetchWikiCurrentEvents,
 *                              fetchRedditNews, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoNews) return;

  const BUDGET_MS = 800;
  const cache = { ts: 0, headlines: [] };
  const CACHE_TTL = 5 * 60 * 1000;

  const PATTERNS = [
    /^(?:latest\s+|breaking\s+|world\s+|today'?s?\s+)?news$/i,
    /^news\s+(?:about\s+|on\s+|of\s+|in\s+|from\s+)?(.+)$/i,
    /^(.+?)\s+news$/i,
    /^what(?:s|'s|\s+is)\s+happening(?:\s+in\s+the\s+world)?\??$/i,
    /^current\s+events?$/i,
    /^headlines$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (!m) continue;
      const topic = m[1] && m[1].toLowerCase() !== 'world' ? m[1].trim() : null;
      return { topic };
    }
    return null;
  }

  function withinBudget(p){
    return Promise.race([p, new Promise((res) => setTimeout(() => res(null), BUDGET_MS))]);
  }

  /** Wikipedia Current Events portal — has a daily aggregation. CORS-clean. */
  async function fetchWikiCurrentEvents(){
    if (typeof fetch === 'undefined') return [];
    try {
      const d = new Date();
      const ymd = d.toISOString().slice(0, 10);
      const url = 'https://en.wikipedia.org/api/rest_v1/feed/featured/' +
        ymd.replace(/-/g, '/');
      const r = await withinBudget(fetch(url).then((r) => r.json()));
      if (!r) return [];
      const items = [];
      if (r.news && Array.isArray(r.news)){
        for (const n of r.news.slice(0, 6)){
          const text = String(n.story || '').replace(/<[^>]+>/g, '').trim();
          if (!text) continue;
          items.push({
            source: 'wikipedia',
            title: text.split('. ')[0].slice(0, 140),
            url: n.links && n.links[0] && n.links[0].content_urls && n.links[0].content_urls.desktop && n.links[0].content_urls.desktop.page,
            snippet: text.slice(0, 240),
            ts: Date.now(),
          });
        }
      }
      return items;
    } catch { return []; }
  }

  /** Reddit JSON (CORS works on .json endpoint from many origins). */
  async function fetchRedditNews(subreddit){
    if (typeof fetch === 'undefined') return [];
    try {
      const url = 'https://www.reddit.com/r/' + (subreddit || 'worldnews') + '/top.json?t=day&limit=6';
      const r = await withinBudget(fetch(url).then((r) => r.json()));
      if (!r || !r.data || !r.data.children) return [];
      return r.data.children.slice(0, 6).map((c) => ({
        source: 'reddit:' + (subreddit || 'worldnews'),
        title: c.data.title,
        url: c.data.url_overridden_by_dest || ('https://www.reddit.com' + c.data.permalink),
        snippet: (c.data.selftext || '').slice(0, 200),
        ts: c.data.created_utc * 1000,
        score: c.data.score,
      }));
    } catch { return []; }
  }

  function dedup(headlines){
    const seen = new Set();
    const out = [];
    for (const h of headlines){
      const key = (h.title || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(h);
    }
    return out;
  }

  async function fetchAll(topic){
    if (Date.now() - cache.ts < CACHE_TTL && !topic) return cache.headlines;
    const all = (await Promise.all([
      fetchWikiCurrentEvents(),
      fetchRedditNews('worldnews'),
      fetchRedditNews('news'),
    ])).flat();
    let merged = dedup(all).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (topic){
      const t = topic.toLowerCase();
      merged = merged.filter((h) => ((h.title || '') + ' ' + (h.snippet || '')).toLowerCase().includes(t));
    } else {
      cache.ts = Date.now(); cache.headlines = merged;
    }
    return merged;
  }

  async function tryCard(query){
    const parsed = parsePattern(query);
    if (!parsed) return null;
    let headlines = (await fetchAll(parsed.topic)).slice(0, 6);
    let summarySuffix = '';
    // If topic filter returned nothing, fall back to the unfiltered top
    // headlines tagged with a "no exact match" note. Better to show
    // something than blank-out.
    if (!headlines.length && parsed.topic){
      headlines = (await fetchAll(null)).slice(0, 6);
      summarySuffix = ' (no exact match for "' + parsed.topic + '")';
    }
    if (!headlines.length) return null;
    return {
      kind: 'news',
      title: parsed.topic ? 'News: ' + parsed.topic : 'Latest news',
      icon: '📰',
      confidence: parsed.topic && summarySuffix ? 0.6 : 0.85,
      headlines,
      summary: headlines.length + ' headlines from Wikipedia + Reddit' + summarySuffix,
      inputType: 'none',
    };
  }

  window.oioxoNews = { tryCard, fetchWikiCurrentEvents, fetchRedditNews, parsePattern };
})();
