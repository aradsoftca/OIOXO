/**
 * metasearch — a REAL general web search, run from the user's device.
 *
 * The missing keystone: discovery. Reading pages on-device was solved (CORS APIs,
 * Reddit JSONP, Common Crawl), but FINDING the right page for ANY query needs a
 * web index — which the device can't hold. The answer is an INDEPENDENT,
 * CORS-open search engine the browser can query directly:
 *
 *   • Mwmbl (https://mwmbl.org) — open-source, non-profit, crowdsourced web index.
 *     `api.mwmbl.org/search?s=` sends `Access-Control-Allow-Origin: *`, needs no
 *     key, and returns url + title + snippet for any query. Verified live.
 *
 * So this is general search with NO proxy, NO key, NO install, NO server of ours
 * — just the user's browser hitting a free public index (like it hits Wikipedia).
 * Designed to FEDERATE: add more CORS-open engines to `ENGINES` for breadth and
 * so no single source is a dependency. Mwmbl's index is also open + downloadable,
 * the path to a fully-local index later.
 */

export interface WebResult {
  url: string;
  title: string;
  /** The engine's own snippet of the page — often enough to answer from. */
  extract: string;
  /** Which engine returned it (for federation/debug). */
  engine: string;
}

/** Mwmbl returns title/extract as arrays of {value,is_bold} spans. */
type MwmblSpan = { value: string };
type MwmblHit = { url: string; title?: MwmblSpan[]; extract?: MwmblSpan[] };
const spans = (a?: MwmblSpan[]): string => (a ?? []).map((s) => s.value).join('').replace(/\s+/g, ' ').trim();

async function mwmbl(query: string, signal?: AbortSignal): Promise<WebResult[]> {
  const r = await fetch(`https://api.mwmbl.org/search?s=${encodeURIComponent(query)}`, {
    redirect: 'follow', cache: 'no-store', signal,
  });
  if (!r.ok) return [];
  const data = (await r.json()) as MwmblHit[];
  if (!Array.isArray(data)) return [];
  return data
    .filter((h) => h?.url)
    .map((h) => ({ url: h.url, title: spans(h.title), extract: spans(h.extract), engine: 'mwmbl' }));
}

// Wikipedia full-text search (CORS-open, origin=*) — authoritative breadth that
// mwmbl alone lacks. Snippet HTML stripped to plain text.
// Wikipedia throttles UA-less clients (429); a descriptive UA is its API policy.
// (In the browser this header is ignored/forbidden but harmless; the browser UA +
// per-user rate is accepted. This matters for SSR/Node and is good citizenship.)
export const WIKI_UA = { 'User-Agent': 'oioxo/1.0 (https://oioxo.com; search)', 'Api-User-Agent': 'oioxo/1.0 (https://oioxo.com)' };
async function wikipedia(query: string, signal?: AbortSignal): Promise<WebResult[]> {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=8&srprop=snippet`,
    { signal, cache: 'no-store', headers: WIKI_UA });
  if (!r.ok) return [];
  const d = await r.json() as { query?: { search?: { title: string; snippet?: string }[] } };
  return (d.query?.search ?? []).map((h) => ({
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
    title: h.title,
    extract: (h.snippet ?? '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(),
    engine: 'wikipedia',
  }));
}

// DuckDuckGo Instant Answer (CORS-open) — zero-click abstract + related topics;
// good for definitions/entities and a quick authoritative anchor.
async function duckduckgo(query: string, signal?: AbortSignal): Promise<WebResult[]> {
  const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=oioxo`,
    { signal, cache: 'no-store' });
  if (!r.ok) return [];
  const d = await r.json() as { AbstractText?: string; AbstractURL?: string; Heading?: string; RelatedTopics?: { Text?: string; FirstURL?: string }[] };
  const out: WebResult[] = [];
  if (d.AbstractText && d.AbstractURL) out.push({ url: d.AbstractURL, title: d.Heading ?? query, extract: d.AbstractText, engine: 'ddg' });
  for (const t of (d.RelatedTopics ?? []).slice(0, 6)) {
    if (t.FirstURL && t.Text) out.push({ url: t.FirstURL, title: t.Text.slice(0, 120), extract: t.Text, engine: 'ddg' });
  }
  return out;
}

// Hacker News via Algolia (CORS-open) — the tech/builder discussion tail, great
// for "best X", tooling, and how-to where forum experience beats encyclopedias.
async function hackernews(query: string, signal?: AbortSignal): Promise<WebResult[]> {
  const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=6`,
    { signal, cache: 'no-store' });
  if (!r.ok) return [];
  const d = await r.json() as { hits?: { title?: string; url?: string; objectID?: string; points?: number; num_comments?: number }[] };
  return (d.hits ?? []).filter((h) => h.title).map((h) => ({
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    title: h.title!,
    extract: `Hacker News discussion — ${h.points ?? 0} points, ${h.num_comments ?? 0} comments`,
    engine: 'hn',
  }));
}

// StackExchange (CORS-open) — authoritative Q&A for technical/how-to questions.
async function stackexchange(query: string, signal?: AbortSignal): Promise<WebResult[]> {
  const r = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=6&filter=!nKzQUR3Egv`,
    { signal, cache: 'no-store' });
  if (!r.ok) return [];
  const d = await r.json() as { items?: { title?: string; link?: string; score?: number; is_answered?: boolean }[] };
  return (d.items ?? []).filter((h) => h.title && h.link).map((h) => ({
    url: h.link!,
    title: h.title!.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    extract: `Stack Overflow — score ${h.score ?? 0}${h.is_answered ? ', answered' : ''}`,
    engine: 'stackexchange',
  }));
}

// CORS-open engines to federate. Add more here (other independent indexes) for
// breadth + resilience — the rest of the system doesn't change.
const ENGINES: ((q: string, signal?: AbortSignal) => Promise<WebResult[]>)[] = [mwmbl, wikipedia, duckduckgo, hackernews, stackexchange];

/**
 * General web search from the browser. Fans out to every CORS-open engine,
 * merges + de-dupes by URL (keeping the richest snippet), and returns the top
 * `limit`. Best-effort: a failing engine just contributes nothing.
 */
export async function webSearch(query: string, limit = 20, timeoutMs = 12000): Promise<WebResult[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const batches = await Promise.all(ENGINES.map((e) => e(query, ctl.signal).catch(() => [] as WebResult[])));
    // De-dupe by URL, keeping the richest snippet.
    const byUrl = new Map<string, WebResult>();
    for (const r of batches.flat()) {
      const key = r.url.replace(/[#?].*$/, '').replace(/\/$/, '');
      const prev = byUrl.get(key);
      if (!prev || r.extract.length > prev.extract.length) byUrl.set(key, r);
    }
    // ROUND-ROBIN interleave by engine so a prolific index (mwmbl) can't drown out
    // the others — every source actually contributes to the federated result.
    const perEngine = new Map<string, WebResult[]>();
    for (const r of byUrl.values()) { const a = perEngine.get(r.engine) ?? []; a.push(r); perEngine.set(r.engine, a); }
    const queues = [...perEngine.values()];
    const out: WebResult[] = [];
    for (let i = 0; out.length < limit && queues.some((q) => q.length); i++) {
      for (const q of queues) { const r = q.shift(); if (r) { out.push(r); if (out.length >= limit) break; } }
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}
