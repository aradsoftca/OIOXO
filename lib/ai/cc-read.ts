/**
 * cc-read — read the REAL web on the user's device, with NO install, NO proxy,
 * and NO server of ours. The trick: Common Crawl's index + data hosts both send
 * `Access-Control-Allow-Origin: *`, so a browser can:
 *   1. ask the INDEX which archive file + byte range holds a URL,
 *   2. RANGE-GET exactly those bytes from the data host (just that one page),
 *   3. gunzip them with the native DecompressionStream and read the HTML.
 *
 * Common Crawl is a free monthly snapshot of the whole web (Reddit, forums,
 * reviews included). Freshness is ~2–4 weeks — perfect for opinions/reviews/
 * evergreen pages; live data (prices/news) should use the CORS-open data APIs.
 *
 * Everything here is isomorphic (browser + Node ≥18): fetch, DecompressionStream,
 * TextDecoder are all global in both. No DOM needed — extraction is regex-based.
 */

import { ccLookupStatic } from './cc-static';

const INDEX_HOST = 'https://index.commoncrawl.org';
const DATA_HOST = 'https://data.commoncrawl.org';

/** One Common Crawl capture record (the fields we use). */
export interface CcRecord {
  url: string;
  filename: string;
  offset: string;
  length: string;
  status: string;
  mime?: string;
  'mime-detected'?: string;
  timestamp?: string;
  languages?: string;
}

export type MatchType = 'exact' | 'prefix' | 'domain' | 'host';

let _crawlId: string | null = null;
/** The newest crawl id (cached). The index list is CORS-open JSON. */
export async function latestCrawl(): Promise<string> {
  if (_crawlId) return _crawlId;
  try {
    const r = await fetch(`${INDEX_HOST}/collinfo.json`, { cache: 'no-store' });
    const list = (await r.json()) as { id: string }[];
    _crawlId = list?.[0]?.id ?? 'CC-MAIN-2026-21';
  } catch {
    _crawlId = 'CC-MAIN-2026-21';
  }
  return _crawlId;
}

/**
 * Look up captures of a URL/pattern in the index. `matchType` controls breadth:
 * exact (one page), prefix (everything under a path — supports a trailing `*`),
 * domain (the whole site), host. Returns newest-first, HTML 200s only by default.
 */
export async function ccLookup(
  urlPattern: string,
  opts: { matchType?: MatchType; limit?: number; htmlOnly?: boolean; crawl?: string; timeoutMs?: number } = {},
): Promise<CcRecord[]> {
  const { matchType = 'exact', limit = 10, htmlOnly = true, timeoutMs = 6000 } = opts;
  const crawl = opts.crawl ?? (await latestCrawl());
  const qs = new URLSearchParams({ url: urlPattern, output: 'json', limit: String(Math.min(limit * 4, 200)) });
  if (matchType !== 'exact') qs.set('matchType', matchType);
  let recs: CcRecord[] = [];
  // The CDX index server (index.commoncrawl.org) is frequently overloaded — a
  // request can hang indefinitely. Cap it so a slow/dead index fails fast and we
  // fall back to the snippet (or another source) instead of stalling the answer.
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${INDEX_HOST}/${crawl}-index?${qs}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) return [];
    const text = await r.text();
    recs = text.trim().split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) as CcRecord; } catch { return null; } })
      .filter((x): x is CcRecord => !!x && !!x.filename);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
  if (htmlOnly) recs = recs.filter((r) => r.status === '200' && (r['mime-detected'] === 'text/html' || r.mime === 'text/html'));
  // newest first, then de-dupe by url
  recs.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
  const seen = new Set<string>();
  return recs.filter((r) => !seen.has(r.url) && seen.add(r.url)).slice(0, limit);
}

/** Native gunzip (browser DecompressionStream / Node global). */
async function gunzip(buf: ArrayBuffer): Promise<string> {
  // DecompressionStream is global in modern browsers and Node ≥18.
  const ds = new (globalThis as { DecompressionStream: typeof DecompressionStream }).DecompressionStream('gzip');
  const stream = new Response(buf).body!.pipeThrough(ds);
  return await new Response(stream).text();
}

/** Strip a WARC record down to its HTTP body (the HTML), then to readable text. */
function warcToText(raw: string): { title: string; text: string } {
  // WARC record = WARC headers, blank line, HTTP headers, blank line, BODY.
  const htmlStart = Math.max(raw.indexOf('<!'), raw.indexOf('<html'), raw.indexOf('<HTML'));
  const body = htmlStart >= 0 ? raw.slice(htmlStart) : raw;
  const title = (body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim();
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

/** Range-fetch one capture's bytes and return its readable text. */
export async function ccFetchRecord(rec: CcRecord, timeoutMs = 12000): Promise<{ url: string; title: string; text: string } | null> {
  const off = Number(rec.offset);
  const len = Number(rec.length);
  if (!Number.isFinite(off) || !Number.isFinite(len) || len <= 0) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${DATA_HOST}/${rec.filename}`, {
      headers: { Range: `bytes=${off}-${off + len - 1}` },
      signal: ctl.signal, cache: 'no-store',
    });
    if (!r.ok && r.status !== 206) return null;
    const raw = await gunzip(await r.arrayBuffer());
    const { title, text } = warcToText(raw);
    return text.length > 80 ? { url: rec.url, title, text } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Read a specific URL (its newest HTML capture) as clean text, via the static
 *  index — our own client-side lookup against the fast CORS-open data host. We do
 *  NOT fall back to the CDX API server: it queries the same data but is chronically
 *  overloaded (it times out), so a miss there just adds latency. A URL not in the
 *  static index isn't in this crawl; the caller keeps the snippet. */
export async function ccReadUrl(url: string): Promise<{ url: string; title: string; text: string } | null> {
  const rec = (await ccLookupStatic(url, { limit: 1 }))[0];
  return rec ? ccFetchRecord(rec) : null;
}

/**
 * DISCOVERY by reading a high-signal site: enumerate captured pages under a
 * domain/path and keep the URLs whose slug mentions the query terms. This is how
 * we find "the real Reddit/forum threads about X" without a keyword search API —
 * thread URLs are slugged (…/comments/…/bmw_320_vs_c200/). Returns capture
 * records, newest first.
 */
export async function ccDiscover(
  domainOrPrefix: string,
  terms: string[],
  opts: { matchType?: MatchType; scan?: number; take?: number } = {},
): Promise<CcRecord[]> {
  const { matchType = 'prefix', scan = 200, take = 6 } = opts;
  const recs = await ccLookup(domainOrPrefix.endsWith('*') ? domainOrPrefix : `${domainOrPrefix}*`, { matchType, limit: scan });
  const toks = terms.map((t) => t.toLowerCase()).filter((t) => t.length > 1);
  const scored = recs
    .map((r) => {
      const slug = r.url.toLowerCase();
      const hits = toks.filter((t) => slug.includes(t)).length;
      return { r, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || (b.r.timestamp ?? '').localeCompare(a.r.timestamp ?? ''));
  return scored.slice(0, take).map((x) => x.r);
}
