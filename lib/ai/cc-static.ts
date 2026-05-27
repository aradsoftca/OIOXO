/**
 * cc-static — be our OWN Common Crawl index server, on the user's device.
 *
 * The general "read any page" problem has exactly one no-proxy, no-per-site answer:
 * Common Crawl, whose data host (data.commoncrawl.org) is fast and CORS-open
 * (`Access-Control-Allow-Origin: *`, range-served). The catch was its CDX *API*
 * server (index.commoncrawl.org) — chronically overloaded, often dead — which we
 * used to find WHERE a URL lives in the crawl.
 *
 * We don't need that API. Common Crawl publishes its index as STATIC sorted files
 * on the same fast CORS-open data host:
 *   • cluster.idx  — a 2nd-level index: sorted `SURT timestamp\tcdx-NNNNN.gz\toffset\tlength`,
 *   • cdx-NNNNN.gz — the CDX records (one gzip member per block, range-addressable).
 * So the lookup runs entirely client-side:
 *   1. canonicalize the URL → SURT key (com,realpython)/path),
 *   2. BINARY-SEARCH cluster.idx by byte offset → the one cdx block that holds it,
 *   3. range-GET + gunzip that block, scan for the URL → its WARC pointer,
 *   4. range-GET + gunzip the WARC bytes → the page (done by cc-read's ccFetchRecord).
 *
 * Result: read ANY of Common Crawl's ~4 billion pages, 100% on the device, no proxy,
 * no key, no server of ours, no per-site code, and NOT depending on the dead API.
 * Freshness is the monthly snapshot (~2–4 weeks) — great for evergreen pages; live
 * data (prices/news) still uses the CORS-open data APIs.
 */
import type { CcRecord } from './cc-read';

const DATA = 'https://data.commoncrawl.org';
const idxBase = (crawl: string) => `${DATA}/cc-index/collections/${crawl}/indexes`;

/** Native gunzip (browser DecompressionStream / Node global). */
async function gunzip(buf: ArrayBuffer): Promise<string> {
  const ds = new (globalThis as { DecompressionStream: typeof DecompressionStream }).DecompressionStream('gzip');
  return await new Response(new Response(buf).body!.pipeThrough(ds)).text();
}

// The data host rate-limits aggressive clients with 403. When we see one, back off
// for a cooldown so we stop hammering (and the caller just keeps snippets).
let _blockedUntil = 0;
function note403(status: number) { if (status === 403 || status === 429) _blockedUntil = Date.now() + 60_000; }
function isBackedOff() { return Date.now() < _blockedUntil; }

/** Range-GET helpers against the CORS-open data host. */
async function rangeText(url: string, start: number, end: number, signal?: AbortSignal): Promise<string> {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store', signal });
  if (!r.ok && r.status !== 206) { note403(r.status); throw new Error(`range ${r.status}`); }
  return await r.text();
}
async function rangeBuf(url: string, start: number, len: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${start + len - 1}` }, cache: 'no-store', signal });
  if (!r.ok && r.status !== 206) { note403(r.status); throw new Error(`range ${r.status}`); }
  return await r.arrayBuffer();
}

/**
 * Canonicalize a URL to Common Crawl's SURT-ish key: host reversed + comma-joined,
 * `)`, then the path, lowercased. Query is dropped — we only need to land in the
 * right cdx BLOCK; the exact record is matched by URL once the block is read.
 */
export function toSurt(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const rev = host.split('.').reverse().join(',');
    return `${rev})${u.pathname || '/'}`.toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

// ── Latest-crawl discovery, without the dead API ────────────────────────────
// Common Crawl publishes ~monthly. We probe candidate ids against the fast data
// host (a 2-byte range read on cluster.idx) and take the newest that responds.
// SEQUENTIALLY, newest-first, stopping at the first hit — a parallel burst of
// probes gets rate-limited by the data host (every probe then fails → no crawl).
// The seed list is verified-live ids (newest-first); generated recent ids are
// tried ahead of it so a freshly-published crawl is picked up automatically.
const SEED_CRAWLS = [
  'CC-MAIN-2026-21', 'CC-MAIN-2026-08', 'CC-MAIN-2025-51', 'CC-MAIN-2025-43',
  'CC-MAIN-2025-38', 'CC-MAIN-2025-26', 'CC-MAIN-2025-18', 'CC-MAIN-2025-13', 'CC-MAIN-2025-08',
];
const CADENCE_WEEKS = [51, 47, 43, 38, 33, 30, 26, 21, 18, 13, 8, 5];
let _crawls: string[] | null = null;
let _crawlsAt = 0;
const CRAWL_TTL = 12 * 60 * 60 * 1000; // re-validate at most twice a day

/** Candidate crawl ids, newest-first: a few generated recent ones (to catch new
 *  publishes) then the verified seed; de-duped and capped so we never probe many. */
function candidateCrawls(): string[] {
  const y = new Date().getUTCFullYear();
  const gen: string[] = [];
  for (const yr of [y, y - 1]) for (const w of CADENCE_WEEKS) gen.push(`CC-MAIN-${yr}-${String(w).padStart(2, '0')}`);
  // keep only generated ids NEWER than the freshest seed, so we don't probe a long
  // tail of non-existent future weeks before reaching a known-good one.
  const newest = SEED_CRAWLS[0];
  const ahead = gen.filter((c) => c > newest);
  return Array.from(new Set([...ahead, ...SEED_CRAWLS])).slice(0, 14);
}

async function probeCrawl(crawl: string): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`${idxBase(crawl)}/cluster.idx`, { headers: { Range: 'bytes=0-1' }, cache: 'no-store', signal: ctl.signal });
    return r.ok || r.status === 206;
  } catch { return false; } finally { clearTimeout(t); }
}

/** The N most recent Common Crawls whose static index is live, freshest-first.
 *  Querying several snapshots is what lifts coverage of arbitrary pages: a URL
 *  missing from this month is usually in a recent one (and it widens freshness).
 *  Cached in memory + (browser) localStorage so discovery runs at most twice a day;
 *  on a transient all-fail the last-known list is kept. */
export async function recentStaticCrawls(max = 3): Promise<string[]> {
  if (_crawls && Date.now() - _crawlsAt < CRAWL_TTL) return _crawls.slice(0, max);
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls && !_crawls) {
      const saved = ls.getItem('oioxo.ccCrawls');
      const at = Number(ls.getItem('oioxo.ccCrawlsAt') || 0);
      if (saved && Date.now() - at < CRAWL_TTL) { _crawls = JSON.parse(saved); _crawlsAt = at; return (_crawls ?? []).slice(0, max); }
    }
  } catch { /* no storage */ }
  const live: string[] = [];
  for (const c of candidateCrawls()) {
    if (await probeCrawl(c)) { live.push(c); if (live.length >= Math.max(max, 4)) break; }
  }
  if (live.length) {
    _crawls = live; _crawlsAt = Date.now();
    try { const ls = (globalThis as { localStorage?: Storage }).localStorage;
      ls?.setItem('oioxo.ccCrawls', JSON.stringify(live)); ls?.setItem('oioxo.ccCrawlsAt', String(_crawlsAt)); } catch { /* ignore */ }
  }
  return (_crawls ?? []).slice(0, max);
}

/** The single newest live crawl (back-compat helper). */
export async function latestStaticCrawl(): Promise<string | null> {
  return (await recentStaticCrawls(1))[0] ?? null;
}

// ── cluster.idx binary search ───────────────────────────────────────────────
async function fileSize(url: string, signal?: AbortSignal): Promise<number> {
  const r = await fetch(url, { headers: { Range: 'bytes=0-1' }, cache: 'no-store', signal });
  return Number((r.headers.get('content-range') || '0/0').split('/')[1]) || 0;
}

interface Block { chunk: string; offset: number; length: number; }

const keyOf = (line: string) => line.split('\t')[0].split(' ')[0]; // "SURT timestamp" → SURT

/**
 * Binary-search cluster.idx for the block whose SURT range covers `target`.
 * The keys are sorted, so we find the byte offset of the FIRST line whose key is
 * STRICTLY > target, then the block we want is the LAST line with key ≤ target —
 * the line ending just before that offset. (Selecting "a line after some mid" and
 * stepping lo by one overshoots when a block's range is small, so we anchor on the
 * strict upper bound and read back to the real boundary.)
 */
async function findBlock(crawl: string, target: string, signal?: AbortSignal): Promise<Block | null> {
  const url = `${idxBase(crawl)}/cluster.idx`;
  const size = await fileSize(url, signal);
  if (!size) return null;
  // Narrow to a small window with binary search, then scan it — stopping once the
  // range is small caps requests at ~log2(size/16KB) instead of ~log2(size) (the
  // data host rate-limits bursts, so every saved request matters).
  let lo = 0, hi = size;
  while (hi - lo > 16384) {
    const mid = (lo + hi) >> 1;
    const win = await rangeText(url, mid, Math.min(mid + 2000, size - 1), signal);
    const nl = win.indexOf('\n');
    const lineStart = nl < 0 ? mid : mid + nl + 1; // start of the first whole line at/after mid
    const line = (nl < 0 ? win : win.slice(nl + 1)).split('\n')[0];
    if (!line) { hi = mid; continue; }
    if (keyOf(line) > target) hi = mid; else lo = lineStart + line.length + 1; // cluster.idx is ASCII
  }
  // Scan the narrowed window for the last line with key ≤ target (its block).
  const start = Math.max(0, lo - 4000);
  const win = await rangeText(url, start, Math.min(hi, size - 1), signal);
  const lines = win.split('\n').filter((l) => l.includes('\t'));
  if (start > 0 && lines.length) lines.shift(); // first line is partial
  let best: string | null = null;
  for (const l of lines) { if (keyOf(l) <= target) best = l; else break; }
  if (!best) return null;
  const f = best.split('\t');
  return { chunk: f[1], offset: Number(f[2]), length: Number(f[3]) };
}

/** A page key that ignores trailing slash + query, so the same page captured as
 *  `…/os.html`, `…/os.html?highlight=x` or `…/flex/` all match. */
function pageKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return `${host.split('.').reverse().join(',')})${path}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Parse a CDX block (gunzipped) into CcRecords for the lines matching `url`. */
function recordsFrom(cdx: string, url: string): CcRecord[] {
  const target = pageKey(url);
  const out: CcRecord[] = [];
  for (const line of cdx.split('\n')) {
    if (!line) continue;
    const sp = line.indexOf(' ');
    const sp2 = line.indexOf(' ', sp + 1);
    if (sp2 < 0) continue;
    let rec: CcRecord;
    try { rec = JSON.parse(line.slice(sp2 + 1)) as CcRecord; } catch { continue; }
    if (!rec.url || !rec.filename) continue;
    if (pageKey(rec.url) !== target) continue; // same page, query/slash-insensitive
    out.push(rec);
  }
  // Prefer a real 200 capture; sort newest-first within that.
  out.sort((a, b) => {
    const a2 = a.status === '200' ? 0 : 1, b2 = b.status === '200' ? 0 : 1;
    return a2 - b2 || (b.timestamp ?? '').localeCompare(a.timestamp ?? '');
  });
  return out;
}

/**
 * Look up a URL in Common Crawl via the static index (no API server). Returns the
 * newest HTML 200 captures, or [] if not in the crawl. Best-effort + timed so a
 * slow read can't stall the caller.
 */
export async function ccLookupStatic(url: string, opts: { limit?: number; timeoutMs?: number; maxCrawls?: number } = {}): Promise<CcRecord[]> {
  const { limit = 3, timeoutMs = 14000, maxCrawls = 3 } = opts;
  if (isBackedOff()) return []; // rate-limited recently — don't hammer the host
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const crawls = await recentStaticCrawls(maxCrawls);
    const target = toSurt(url);
    // Walk recent snapshots newest-first; the first that has the page wins (so a
    // hit costs one crawl, only misses pay for the next). Lifts coverage a lot.
    for (const crawl of crawls) {
      if (isBackedOff()) break;
      const block = await findBlock(crawl, target, ctl.signal).catch(() => null);
      if (!block || !block.length) continue;
      const buf = await rangeBuf(`${idxBase(crawl)}/${block.chunk}`, block.offset, block.length, ctl.signal).catch(() => null);
      if (!buf) continue;
      const recs = recordsFrom(await gunzip(buf), url)
        .filter((r) => r.status === '200' && (r['mime-detected'] === 'text/html' || r.mime === 'text/html'));
      if (recs.length) return recs.slice(0, limit);
    }
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
