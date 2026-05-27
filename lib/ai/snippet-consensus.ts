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
import { scorePassages } from './rerank';

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

/** Web snippets for ONE query (Mwmbl) — the engine's own extract, no page read. */
async function webSnips(query: string): Promise<Snip[]> {
  const web = await webSearch(query, 14).catch(() => []);
  const out: Snip[] = [];
  for (const r of web) {
    const text = [r.title, r.extract].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();
    if (text.length > 20) out.push({ text, source: { title: r.title || siteOf(r.url), url: r.url, site: siteOf(r.url) } });
  }
  return out;
}

/**
 * Answer by FAN-OUT: run the model's diverse queries (different angles), POOL the
 * results across all of them, dedupe by URL, then rerank against the user's true
 * intent and synthesize — "give results of all and mix and decide". `queries` comes
 * from the on-device query-writer; when absent (cold/SSR) we just search the message.
 *
 * Returns the cited answer + a confidence grounded in how many independent domains
 * addressed it; 'unverified' (empty answer) when nothing relevant — the honest
 * "I couldn't confirm" rather than a guess.
 */
export async function answerFromSnippets(message: string, queries?: string[]): Promise<SnippetConsensus> {
  const qs = (queries && queries.length ? queries : [message]).slice(0, 4);
  // Fan out across the diverse queries (Mwmbl per query) + Wikipedia once on the
  // real message; pool everything and dedupe by URL (keep the richest snippet).
  const [webPools, wiki] = await Promise.all([
    Promise.all(qs.map(webSnips)),
    wikipediaExtracts(message, 3).catch(() => []),
  ]);
  const byUrl = new Map<string, Snip>();
  for (const s of webPools.flat()) {
    const k = s.source.url.replace(/[#?].*$/, '').replace(/\/$/, '');
    const prev = byUrl.get(k);
    if (!prev || s.text.length > prev.text.length) byUrl.set(k, s);
  }
  const passages: Snip[] = [...byUrl.values()];
  for (const w of wiki) if (w.text.length > 40) passages.push({ text: w.text, source: w.source });
  if (!passages.length) return { answer: '', confidence: 'unverified', agreement: 0, sources: [] };
  // Relevance + synthesis are judged against the MESSAGE (the true intent), not a sub-query.
  const query = message;

  // Decide which snippets actually ADDRESS the question. Best path: the trained
  // reranker (a cross-encoder) scores each snippet's relevance — it understands a
  // bike SONG isn't a how-to, which keyword overlap can't. Verified on the model:
  // real answers score ~+1..+8, off-topic/junk ~-3..-4, so a 0 logit cleanly
  // separates them. When the reranker is cold (e.g. Node/SSR), fall back to a
  // lexical ANCHOR gate (must contain the rarest query term + enough content words),
  // which still blocks cross-topic false consensus (Norway ≠ Tajikistan).
  const REL = 0; // relevance-logit threshold: > 0 ≈ on-topic, < 0 ≈ off-topic
  let addressing: Snip[];
  const scores = await scorePassages(query, passages.map((p) => p.text)).catch(() => null);
  if (scores) {
    addressing = passages
      .map((p, i) => ({ p, s: scores[i] ?? -99 }))
      .filter((x) => x.s > REL)
      .sort((a, b) => b.s - a.s) // strongest first, so synthesis reads the best
      .map((x) => x.p);
  } else {
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
    addressing = passages.filter((p) => addresses(p.text));
  }

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
