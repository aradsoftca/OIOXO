/**
 * Xonvert AI — open-web reader (Tier 2 of the answer engine).
 *
 * The browser can't read most of the web directly: CORS lets a page read only
 * servers that opt in, and almost none do. The way through — fully browser-side,
 * no Xonvert server — is a free, open-source reader that fetches a page for us
 * and hands it back with CORS headers. We use it two ways:
 *   1. SEARCH — read a DuckDuckGo results page, pull the result links + blurb.
 *   2. READ   — read the best result page as clean text and extract the answer.
 *
 * Everything stays on-device except the fetch itself; the on-device model only
 * reads the returned text (extractive, cited) — it never invents facts. Degrades
 * to null on any failure so the caller falls back to honest "I don't know".
 *
 * Privacy note: the question text + result URLs pass through the reader's
 * servers (files never do). This tier runs ONLY when the private on-device
 * sources (Wikipedia/Wikidata/weather/dictionary) can't answer.
 *
 * Independence: the reader is open-source and self-hostable — point READER_BASE
 * at an Xonvert-run instance to drop the third party entirely, no other change.
 */

import type { SearchAnswer, SearchSource } from './search';
import { trimExtract } from './search';
import { extractStructured, type AnswerType } from './extract';

// The open-web reader. `https://r.jina.ai/<url>` → that page as clean markdown,
// CORS-enabled and key-free. Swap for a self-hosted instance for full autonomy.
const READER_BASE = 'https://r.jina.ai/';

/** GET text through the reader. Header-free so it stays a CORS "simple request"
 *  (no preflight) — more reliable across browsers. Times out, never throws. */
async function readThrough(targetUrl: string, ms = 9000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(READER_BASE + targetUrl, { signal: ctl.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!r.ok) return null;
    const text = await r.text();
    return text && text.length > 20 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface WebResult { title: string; url: string; snippet: string; }

/** Run a web search through the reader and return parsed organic results — the
 *  shared entry point for callers that need the result list (e.g. video search).
 *  Empty array on any failure. */
export async function searchWeb(query: string, limit = 10): Promise<WebResult[]> {
  const md = await readThrough(DDG + encodeURIComponent(query));
  if (!md) return [];
  return parseResults(md).slice(0, limit);
}

/** Read any URL as clean text through the reader (public wrapper). Used to pull a
 *  video page's transcript/description as a normal text source. Null on failure. */
export function readPageText(url: string, ms = 9000): Promise<string | null> {
  return readThrough(url, ms);
}

// DuckDuckGo's HTML endpoint doesn't bot-block (Google does) and renders cleanly
// through the reader. Result links arrive wrapped as duckduckgo.com/l/?uddg=<url>.
const DDG = 'https://html.duckduckgo.com/html/?q=';

/** Decode a DDG redirect link to the real destination URL. */
function unwrapDdg(href: string): string | null {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

/** Tidy a DDG snippet: query terms come individually bold-wrapped with the
 *  spaces swallowed ("**World****War****I**"), so turn `**` back into spaces. */
function cleanSnippet(s: string): string {
  return s
    .replace(/\*\*/g, ' ')
    .replace(/\[[a-z]\]/gi, '')        // footnote markers like [b]
    .replace(/\s+([,.;:])/g, '$1')      // un-space punctuation we just split
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse organic results from the DDG results markdown: title, real URL, and the
 * result *snippet* (DDG's own one-line summary). Each result block looks like:
 *   ## [Title](uddg)
 *   [![icon](…)](uddg)[display-url](uddg) [date]
 *   [the snippet prose — the long link](uddg)
 * The snippet is the link whose text is long prose (not the title, not the URL).
 */
function parseResults(md: string): WebResult[] {
  const out: WebResult[] = [];
  const seen = new Set<string>();
  // Split on result headings so each block's snippet stays with its title.
  const blocks = md.split(/^##\s+/m).slice(1);
  for (const block of blocks) {
    if (out.length >= 10) break;
    // First link in the block is the title → URL.
    const head = block.match(/^\[([^\]]{2,160})\]\((https:\/\/duckduckgo\.com\/l\/\?uddg=[^)]+)\)/);
    if (!head) continue;
    const url = unwrapDdg(head[2]);
    if (!url || seen.has(url) || /duckduckgo\.com|\/y\.js|ad_provider/.test(url)) continue;
    const title = cleanSnippet(head[1]);
    // Snippet = a later link in the same block whose text is long prose.
    let snippet = '';
    const linkRe = /\[([^\]]{40,})\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=[^)]+\)/g;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(block))) {
      const txt = cleanSnippet(lm[1]);
      // Skip the title and bare display-urls; keep real sentences.
      if (txt === title || /^https?:\/\//i.test(txt) || /\.[a-z]{2,}\/?$/i.test(txt) || txt.split(' ').length < 8) continue;
      snippet = txt; break;
    }
    seen.add(url);
    out.push({ title, url, snippet });
  }
  return out;
}

/** One markdown line → readable prose, or '' if it's not a real sentence line. */
function proseLine(raw: string): string {
  const s = raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')      // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // links → text
    .replace(/[#>*_`|]+/g, ' ')                 // md punctuation
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length >= 80 && /[a-z]/i.test(s) && !/^(http|url source|title|markdown content|warning|menu|skip to|cookie|sign in|subscribe)/i.test(s)) return s;
  return '';
}

/** Strip markdown to readable prose and return the first substantial paragraph. */
function leadProse(md: string): string {
  for (const raw of md.split('\n')) { const s = proseLine(raw); if (s) return s; }
  return '';
}

/**
 * "Tell me more" — read a source page in full and return a longer extract
 * (several paragraphs), so a follow-up genuinely expands the previous answer
 * instead of repeating it. Null if the page can't be read.
 */
export async function expandFromUrl(url: string): Promise<string | null> {
  const page = await readThrough(url, 9000);
  if (!page) return null;
  const paras: string[] = [];
  for (const raw of page.split('\n')) {
    const s = proseLine(raw);
    if (s) { paras.push(s); if (paras.join(' ').length > 700) break; }
  }
  const joined = paras.join(' ');
  return joined.length >= 120 ? trimExtract(joined, 900, 8) : null;
}

const siteOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; } };

/**
 * Answer a question from the open web: search via the reader, then take the best
 * result's lead prose as an extractive, cited answer. Returns a `SearchAnswer`
 * so the existing UI renders it unchanged. Null when nothing usable is found.
 */
export async function answerFromWeb(query: string): Promise<SearchAnswer | null> {
  const md = await readThrough(DDG + encodeURIComponent(query));
  if (!md) return null;
  const results = parseResults(md);
  if (!results.length) return null;

  const sources: SearchSource[] = results.slice(0, 3).map((r) => ({ title: r.title, url: r.url, site: siteOf(r.url) }));
  const related = results.slice(0, 5).map((r) => r.title);

  // 1) A result's own snippet is a clean, relevant summary — cheapest and
  //    usually the best extractive answer (no second fetch). Prefer an
  //    authoritative source's snippet (encyclopedias) when one is present.
  const snippeted = results.filter((r) => r.snippet.length >= 60);
  const AUTH = /(^|\.)(wikipedia\.org|britannica\.com|\.gov|\.edu)$/i;
  const best = snippeted.find((r) => AUTH.test(siteOf(r.url))) ?? snippeted[0];
  if (best) {
    return { answer: trimExtract(best.snippet), query, sources, related };
  }

  // 2) No usable snippet — read the top result page and extract its lead prose.
  for (const r of results.slice(0, 2)) {
    const page = await readThrough(r.url, 9000);
    if (!page) continue;
    const prose = leadProse(page);
    if (prose && prose.length >= 80) {
      return { answer: trimExtract(prose), query, sources: [{ title: r.title, url: r.url, site: siteOf(r.url) }, ...sources.filter((s) => s.url !== r.url)].slice(0, 3), related };
    }
  }

  // 3) Links but no extractable prose → offer them as related (disambiguation).
  return { answer: '', query, sources, related };
}

/**
 * Gather CLEAN, relevant passages for a query — the critical input to synthesis.
 * Searches, then reads the top pages and pulls a few prose paragraphs from each
 * (not raw HTML/nav), so the model gets expert text it can actually merge, not a
 * dump it drowns in. Falls back to the result snippet when a page won't read.
 */
export async function gatherPassages(query: string, maxPages = 6): Promise<{ text: string; source: SearchSource }[]> {
  const md = await readThrough(DDG + encodeURIComponent(query));
  if (!md) return [];
  const results = parseResults(md);
  // SNIPPET-FIRST (fast): the search already returns a clean 1–2 sentence summary
  // per result — enough for synthesis, and it avoids a slow per-page fetch. We
  // pull a snippet from MANY results (broad, multi-source) so synthesis can weigh
  // several independent sources, not lean on one. Only read a full page when no
  // snippets are usable.
  const out: { text: string; source: SearchSource }[] = [];
  for (const r of results.slice(0, maxPages)) {
    if (r.snippet && r.snippet.length >= 40) {
      out.push({ text: trimExtract(r.snippet, 320, 3), source: { title: r.title, url: r.url, site: siteOf(r.url) } });
    }
  }
  if (out.length) return out;
  // Fallback: snippets were empty — read the top page for prose.
  const page = results[0] ? await readThrough(results[0].url, 9000) : null;
  if (page) {
    const paras: string[] = [];
    for (const raw of page.split('\n')) { const s = proseLine(raw); if (s) { paras.push(s); if (paras.join(' ').length > 600) break; } }
    const text = paras.join(' ');
    if (text) out.push({ text: trimExtract(text, 700, 6), source: { title: results[0].title, url: results[0].url, site: siteOf(results[0].url) } });
  }
  return out;
}

/**
 * Frontier-on-find-and-respond: search, then read the top result pages IN FULL
 * and pull out the structured answer the expert page already contains (recipe
 * ingredients + steps, how-to steps, a code block). The model authors nothing —
 * we surface real expert content, cited. Null → caller falls back to summary.
 */
export async function richAnswer(query: string, type: AnswerType): Promise<SearchAnswer | null> {
  const md = await readThrough(DDG + encodeURIComponent(query));
  if (!md) return null;
  const results = parseResults(md);
  if (!results.length) return null;
  for (const r of results.slice(0, 3)) {
    const page = await readThrough(r.url, 10000);
    if (!page) continue;
    const structured = extractStructured(page, type);
    if (structured) {
      return {
        answer: structured,
        query,
        sources: [{ title: r.title, url: r.url, site: siteOf(r.url) }, ...results.slice(0, 3).filter((x) => x.url !== r.url).map((x) => ({ title: x.title, url: x.url, site: siteOf(x.url) }))].slice(0, 3),
        related: results.slice(0, 5).map((x) => x.title),
      };
    }
  }
  return null;
}
