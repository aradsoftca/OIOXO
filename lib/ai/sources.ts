/**
 * sources — federated, 100% on-device gathering (no proxy, no server of ours).
 *
 * Picks the right open sources for the question and reads them directly from the
 * user's browser:
 *   • facts / definitions / explanations → Wikipedia REST (CORS-open, origin=*)
 *   • opinions / comparisons / recommendations → Reddit (JSONP, see ./reddit-read)
 * Everything returns the engine's Evidence shape so the reading machine
 * (./assemble) can rank + extract uniformly. Best-effort: any source that fails
 * just contributes nothing.
 */
import type { Evidence } from './reason';
import type { AnswerPlan } from './oioxo-engine';
import { redditOpinions } from './reddit-read';
import { webSearch, type WebResult } from './metasearch';
import { ccReadUrl } from './cc-read';
import { stackExchangeRead } from './stack-read';
import { mapWithConcurrency } from '../compute/concurrency';

// Wikipedia gates on User-Agent (Node's default UA gets an HTML error page, not
// JSON). `Api-User-Agent` is browser-safe (User-Agent is a forbidden header in
// browsers but ignored there; Node honors User-Agent). Send both → works in
// Node (battery) AND the browser.
const WIKI_HEADERS = { 'Api-User-Agent': 'oioxo/1.0 (https://oioxo.com)', 'User-Agent': 'oioxo/1.0 (https://oioxo.com)' };

/** Evidence that may carry a community score (Reddit upvotes) for ranking. */
export interface RankedEvidence extends Evidence { votes?: number }

/** Wikipedia intro extracts for the top matching articles — CORS-direct. */
export async function wikipediaExtracts(query: string, limit = 3, full = false): Promise<RankedEvidence[]> {
  // `full` pulls substantial BODY text (exchars) instead of just the intro — for
  // explain/define/fact the answer (the mechanism, the value) often lives a
  // paragraph or two in, not in the lead. The sentence-reranker then picks it.
  const sizeParam = full ? '&exchars=3000' : '&exintro=1';
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&prop=extracts${sizeParam}&explaintext=1&redirects=1` +
    `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}`;
  try {
    const r = await fetch(url, { cache: 'no-store', headers: WIKI_HEADERS });
    const j: any = await r.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const pages = j?.query?.pages ?? {};
    // Wikipedia returns pages keyed arbitrarily; keep search-rank order via `index`.
    return Object.values<any>(pages) // eslint-disable-line @typescript-eslint/no-explicit-any
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .map((p) => ({
        topic: query,
        text: String(p.extract ?? '').replace(/\s+/g, ' ').trim(),
        source: { title: String(p.title ?? ''), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p.title ?? '').replace(/\s/g, '_'))}`, site: 'wikipedia.org' },
      }))
      .filter((e) => e.text.length > 60);
  } catch {
    return [];
  }
}

/** Full plain-text extract of a SPECIFIC Wikipedia article (the BODY, not just
 *  the intro) — CORS-direct. Used to read the page the reranker picked, so an
 *  explanation/definition comes from the real article body, not a thin snippet. */
export async function wikipediaFullByTitle(title: string, maxChars = 4000): Promise<string | null> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&prop=extracts&explaintext=1&redirects=1&exsectionformat=plain&titles=${encodeURIComponent(title)}`;
  try {
    const r = await fetch(url, { cache: 'no-store', headers: WIKI_HEADERS });
    const j: any = await r.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const pages = j?.query?.pages ?? {};
    const first = Object.values<any>(pages)[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const text = String(first?.extract ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}

/**
 * The BEST Wikipedia article(s) for a question, as clean full BODY text. Searches
 * Wikipedia (which finds the right article even from a natural question — "why is
 * the sky blue" → "Diffuse sky radiation"), takes the top titles, and fetches each
 * article's real lead/body via wikipediaFullByTitle (NOT the generator=search
 * extract, which can return a citations slice). This is the authoritative answer
 * source for explain/define/fact — CORS-direct, best-effort.
 */
export async function wikipediaBestArticles(query: string, n = 2): Promise<RankedEvidence[]> {
  const surl =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=${n}&srnamespace=0`;
  try {
    const r = await fetch(surl, { cache: 'no-store', headers: WIKI_HEADERS });
    const j: any = await r.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const titles: string[] = (j?.query?.search ?? []).map((s: any) => s.title).filter(Boolean).slice(0, n); // eslint-disable-line @typescript-eslint/no-explicit-any
    const bodies = await Promise.all(titles.map((t) => wikipediaFullByTitle(t).then((body) => ({ t, body })).catch(() => ({ t, body: null }))));
    return bodies
      .filter((b) => b.body)
      .map((b) => ({
        topic: query,
        text: b.body as string,
        source: { title: b.t, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(b.t.replace(/\s/g, '_'))}`, site: 'wikipedia.org' },
      }));
  } catch {
    return [];
  }
}

/** A wikipedia article title from a wiki URL, or null. */
function wikiTitleOf(url: string): string | null {
  const m = (url || '').match(/\/\/[a-z]+\.wikipedia\.org\/wiki\/([^?#]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).replace(/_/g, ' '); } catch { return null; }
}

/**
 * RERANKER-GATED PAGE-BODY READ — the "open the top results and read them" step.
 * Once the reranker has ranked passages, the top ones point at the right pages, but
 * their snippets are thin (a title, a citation fragment, a one-line SEO blurb). So
 * for the top few we OPEN THE ACTUAL PAGE and swap its real body in — from ANY site,
 * not just Wikipedia: a Stack Overflow answer, an Amazon product page, a recipe blog.
 *   • wikipedia.org → its clean REST API (better than a Common Crawl capture),
 *   • everything else → Common Crawl (CORS-open, range-served) reads the real body.
 * So the reader extracts from what the page actually SAYS, not a fragment. Bounded
 * concurrency (can't stall the tab) + best-effort: a page not in the crawl just
 * keeps its snippet. Skips pages we already have a substantial body for.
 */
export async function enrichTopPages(evidence: RankedEvidence[], topN = 4): Promise<RankedEvidence[]> {
  const out = [...evidence];
  const targets = out.slice(0, topN).map((e, i) => ({ e, i }));
  await mapWithConcurrency(targets, async ({ e, i }) => {
    if (e.text.length > 1200) return; // already a real body (wiki/reddit/stack/core read) — skip
    const url = e.source?.url || '';
    if (!/^https?:\/\//i.test(url)) return;
    const title = wikiTitleOf(url);
    const body = title
      ? await wikipediaFullByTitle(title).catch(() => null)
      : await ccReadUrl(url).then((p) => (p && p.text.length > 200 ? p.text.slice(0, 4000) : null)).catch(() => null);
    if (body && body.length > e.text.length) out[i] = { ...e, text: body };
  }, 3);
  return out;
}

/** Does this question want real-people OPINION (forum/Reddit) rather than fact? */
function wantsOpinion(text: string, plan: AnswerPlan): boolean {
  if (plan.shape === 'compare' || plan.shape === 'list') return true;
  return /\b(best|worst|vs\b|versus|better|worth it|recommend|recommendation|should i (buy|get|choose|pick)|opinion|review|reliable|experience|people (say|think)|is it good)\b/i.test(text);
}

/** A programming / sysadmin question — the answer is a Stack Exchange answer, not a
 *  definition. Used to read Stack Overflow et al. directly via their fast API. */
function wantsCode(text: string, plan: AnswerPlan): boolean {
  return plan.shape === 'code'
    || /\b(error|exception|stack ?trace|code|function|class|method|variable|array|regex|compile|install|npm|pip|yarn|apt|docker|kubectl|git|python|javascript|typescript|java|c\+\+|c#|rust|golang|php|ruby|css|html|sql|bash|powershell|terminal|command|undefined|null pointer|segfault)\b/i.test(text);
}

const domainOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

/** Snippet evidence from web-search hits (title + the engine's snippet). */
function snippetEvidence(hits: WebResult[], topic: string): RankedEvidence[] {
  return hits
    .map((h) => ({
      topic,
      text: [h.title, h.extract].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim(),
      source: { title: h.title || h.url, url: h.url, site: domainOf(h.url) },
    }))
    .filter((e) => e.text.length > 30);
}

/**
 * READ inside the top discovered pages on-device, like a search engine opening the
 * first results — the snippet rarely holds the actual data (the step-by-step, the
 * spec, the real review). Reads ANY site's full body via Common Crawl (CORS-open +
 * range-served); Wikipedia is skipped here because gatherOnDevice already fetches
 * it through its clean API (a CC wiki capture is messier + duplicate). Bounded
 * concurrency so a burst of reads can't stall the tab; a page not in the crawl just
 * keeps its snippet. This is what turns "found the right page" into "here's the answer".
 */
async function readTopPages(hits: WebResult[], topic: string, n = 4): Promise<RankedEvidence[]> {
  // Bounded: each Common Crawl lookup is several range requests (binary search), and
  // the data host rate-limits bursts — so read only the top few, at low concurrency.
  const targets = hits.filter((h) => !/(^|\.)wikipedia\.org$/i.test(domainOf(h.url))).slice(0, n);
  const out = await mapWithConcurrency(targets, (h) =>
    ccReadUrl(h.url)
      .then((p) => (p && p.text.length > 200
        ? { topic, text: p.text.slice(0, 4000), source: { title: p.title || h.title, url: h.url, site: domainOf(h.url) } }
        : null))
      .catch(() => null),
  3);
  return out.filter((e): e is RankedEvidence => !!e);
}

/**
 * General web search → read inside the top hits (full page body, any site) + keep
 * the snippets for the rest. The reranker then sorts bodies and snippets together,
 * so the page that actually answers wins even when its snippet was thin.
 */
async function generalSearch(query: string, readPages = false): Promise<RankedEvidence[]> {
  const hits = await webSearch(query, 20).catch(() => []);
  const snippets = snippetEvidence(hits, query);
  if (!readPages) return snippets;
  const pages = await readTopPages(hits, query, 4);
  const readUrls = new Set(pages.map((p) => p.source.url));
  // full-page bodies first, then snippets only for the pages we couldn't open
  return [...pages, ...snippets.filter((s) => !readUrls.has(s.source.url))];
}

/**
 * Gather evidence for a question, on-device, from the sources that fit it. The
 * CORE is a real general web search (metasearch → any page for any query); on top
 * of that we add Reddit (real opinions, with upvotes) for decisions/comparisons
 * and Wikipedia (a strong factual baseline) for the entities. The reading machine
 * then ranks everything together — so the answer is "what the web says", not one
 * hardcoded source.
 */
export async function gatherOnDevice(text: string, plan: AnswerPlan): Promise<RankedEvidence[]> {
  const tasks: Promise<RankedEvidence[]>[] = [];
  // For a comparison, search each side; otherwise search the FULL question — NOT
  // the over-stripped concept. The battery proved cleanQuery mangled "what is the
  // capital of australia" → ~"australia", so the gather returned generic Australia
  // pages and never fetched "Canberra is the capital". Mwmbl handles natural
  // questions well, so the real question is the best query.
  const isCompare = (plan.topics?.length ?? 0) >= 2;
  const topics = isCompare ? plan.topics.slice(0, 3) : [text];

  // CORE — general web search over the full question, READING INSIDE the top
  // results (any site: Stack Overflow, Amazon, blogs), not just their snippets.
  // For a compare we search each side too, but on snippets only (reading 8 pages
  // per side would be excessive — the main read + Wikipedia + Reddit cover it).
  tasks.push(generalSearch(text, true));
  if (isCompare) for (const t of plan.topics.slice(0, 3)) tasks.push(generalSearch(t, false));

  // DEPTH — Wikipedia for the entities. For explain/define/fact, fetch the BEST
  // matching article's clean full BODY (the authoritative answer source); for
  // opinion/list the search-intro is enough. Reddit added below for judgments.
  const fullBody = plan.shape === 'explain' || plan.shape === 'define' || plan.shape === 'fact';
  if (fullBody) {
    tasks.push(wikipediaBestArticles(text, 2)); // the right article for the QUESTION, full body
    for (const t of topics) tasks.push(wikipediaExtracts(t, 2)); // + entity intros
  } else {
    for (const t of topics) tasks.push(wikipediaExtracts(t, 3));
  }
  if (wantsOpinion(text, plan)) {
    tasks.push(
      redditOpinions(plan.concept || text, { threads: 3, perThread: 6 })
        .then((rs) => rs.map((r) => ({ topic: text, text: r.text, source: r.source, votes: r.score })))
        .catch(() => [] as RankedEvidence[]),
    );
  }
  // CODE/SYSADMIN — read the actual Stack Overflow (et al.) ANSWER via its fast,
  // CORS-open API. This is the reliable reader for "how do I … (code/error/config)",
  // where the real answer is a Stack answer with code, not a web snippet or a
  // Wikipedia definition. Votes ride along so the reader can weight the top answer.
  if (wantsCode(text, plan)) {
    tasks.push(
      stackExchangeRead(plan.concept || text, { max: 3 })
        .then((as) => as.map((a) => ({ topic: text, text: a.text, source: { title: a.title, url: a.url, site: a.site }, votes: a.score })))
        .catch(() => [] as RankedEvidence[]),
    );
  }

  let all = (await Promise.all(tasks)).flat();

  // AUTHORITATIVE-FIRST: for factual/definitional/explanatory questions, forum &
  // Q&A chatter is noise (the battery showed "define entropy" → a Reddit "I still
  // don't really get it" comment, "center a div" → a forum question). Drop those
  // domains for non-opinion shapes so the reader ranks reference content. Opinion/
  // comparison/list questions KEEP forums (that's where real takes live).
  if (!wantsOpinion(text, plan)) {
    const FORUMISH = /\b(reddit\.com|quora\.com|answers\.yahoo|ask\.fm|\.stackexchange\.com|stackoverflow\.com|forum|community\.)/i;
    // For code/sysadmin questions Stack answers ARE the answer — keep them.
    const isTech = wantsCode(text, plan);
    const filtered = all.filter((e) => isTech || !FORUMISH.test(e.source?.url || e.source?.site || ''));
    if (filtered.length >= 2) all = filtered; // never strip down to nothing
  }

  // de-dupe by first words
  const seen = new Set<string>();
  return all.filter((e) => {
    const k = e.text.toLowerCase().split(/\s+/).slice(0, 8).join(' ');
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
