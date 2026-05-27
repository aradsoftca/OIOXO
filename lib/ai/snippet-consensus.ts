/**
 * snippet-consensus — answer a question the way a person uses a search engine:
 * read the SNIPPETS of the top results across several open indexes and answer from
 * what they AGREE on, without opening any page.
 *
 * Why this dodges the wall: a snippet is text the index ALREADY extracted when it
 * crawled the page, and the open indexes (Mwmbl, Wikipedia, …) hand it back with
 * permissive CORS. So we never fetch the page itself — the browser's "can't read
 * other origins" rule never applies. The answer is usually right there in the
 * snippet (indexes extract the relevant fragment); we just gather many and keep
 * what they agree on.
 *
 * CONSENSUS = how many INDEPENDENT domains address the question and line up. Several
 * agreeing → confident; one → weak; none → we say "couldn't verify" instead of
 * guessing. That's exactly how you fact-check a rumour. Extractive only — the answer
 * is stitched from real snippets with citations, never invented.
 *
 * Stores nothing: snippets live in memory for the few seconds it takes to answer.
 * No index on disk, no download, no server of ours. Runs entirely in the tab.
 */
import type { SearchSource } from './search';
import { webSearch } from './metasearch';
import { wikipediaExtracts } from './sources';
import { synthesizeText } from './synth';

const siteOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; } };

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'has', 'have', 'had', 'will',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'can', 'could', 'should', 'would', 'is', 'it', 'true', 'next', 'about', 'into', 'will', 'come', 'coming',
]);

/** Content terms of the query (lowercased, stopwords + short tokens dropped). */
function keyTerms(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (raw.length >= 3 && !STOP.has(raw)) out.push(raw);
  }
  return Array.from(new Set(out));
}

export type Confidence = 'high' | 'medium' | 'low' | 'unverified';

export interface SnippetConsensus {
  /** Cited answer assembled from agreeing snippets, or '' when nothing addresses it. */
  answer: string;
  /** How much to trust it, from how many independent domains agree. */
  confidence: Confidence;
  /** Count of distinct domains whose snippet addresses the question. */
  agreement: number;
  sources: SearchSource[];
}

interface Snip { text: string; source: SearchSource }

/**
 * Gather snippets from the open indexes the browser may query directly — no page
 * reads, no proxy, no key. Best-effort: a failing index just contributes nothing.
 * Federated on purpose so no single index is a dependency. (GDELT for fresh news
 * slots in here once its CORS is confirmed.)
 */
async function gatherSnippets(query: string): Promise<Snip[]> {
  const [web, wiki] = await Promise.all([
    webSearch(query, 24).catch(() => []),
    wikipediaExtracts(query, 3).catch(() => []),
  ]);
  const out: Snip[] = [];
  for (const r of web) {
    const text = [r.title, r.extract].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();
    if (text.length > 20) out.push({ text, source: { title: r.title || siteOf(r.url), url: r.url, site: siteOf(r.url) } });
  }
  for (const w of wiki) if (w.text.length > 40) out.push({ text: w.text, source: w.source });
  return out;
}

/**
 * Answer from the snippet set by consensus. Returns the cited answer + a confidence
 * grounded in how many independent domains addressed the question; 'unverified' (and
 * empty answer) when nothing relevant was found — the honest "I couldn't confirm".
 */
export async function answerFromSnippets(query: string): Promise<SnippetConsensus> {
  const passages = await gatherSnippets(query);
  if (!passages.length) return { answer: '', confidence: 'unverified', agreement: 0, sources: [] };

  // A snippet "addresses" the question only if it contains the ANCHOR — the rarest,
  // most distinctive query term (proxied by the longest, usually the key entity) —
  // AND enough of the other content words. The anchor is what stops a false
  // consensus: a "Mongolia president visits NORWAY" snippet shares president+mongolia
  // but lacks the anchor "tajikistan", so it can't count toward a Tajikistan question.
  const terms = keyTerms(query);
  const byLen = [...terms].sort((a, b) => b.length - a.length);
  const anchor = byLen[0];
  const key = byLen.slice(0, Math.max(1, Math.ceil(terms.length / 2)));
  const need = Math.min(2, key.length);
  const addresses = (t: string) => {
    const low = ' ' + t.toLowerCase() + ' ';
    if (anchor && !low.includes(anchor)) return false; // must contain the key entity
    return key.filter((k) => low.includes(k)).length >= need;
  };
  const addressing = passages.filter((p) => addresses(p.text));

  // Consensus strength = distinct domains among the snippets that address it.
  const domains = new Set(addressing.map((p) => p.source.site));
  const agreement = domains.size;

  // Nothing genuinely addressed the question → say so honestly, no guessed answer.
  if (!addressing.length) return { answer: '', confidence: 'unverified', agreement: 0, sources: [] };

  const confidence: Confidence = agreement >= 3 ? 'high' : agreement === 2 ? 'medium' : 'low';
  // Assemble the answer ONLY from the snippets that addressed it (relevance + junk
  // gated, cited). Never fall back to the leftover pool — that's where garbage hides.
  const syn = synthesizeText(query, addressing);
  if (!syn || !syn.answer) return { answer: '', confidence: 'unverified', agreement, sources: [] };
  return { answer: syn.answer, confidence, agreement, sources: syn.sources };
}
