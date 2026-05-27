/**
 * synth — READ several sources and SYNTHESIZE an answer, instead of grabbing the
 * first snippet. This is the fix for the audit's dominant failure: the old path
 * returned one Wikipedia/DDG snippet (often the wrong entity, a forum comment, or
 * worse), never reading or reasoning.
 *
 * Pipeline:
 *   1. Structured intents (how-to / recipe / code) → richAnswer reads full pages
 *      and extracts the real steps / ingredients / code (not a definition).
 *   2. Everything else → gather passages from MANY sources, then keep ONLY the
 *      sentences that actually address the question (relevance gate) and aren't
 *      junk (quality gate), and assemble the strongest few into a cited answer.
 *
 * The relevance + quality gates are the anti-dumb core: a sentence with no overlap
 * with the question ("OBBBA contains hundreds of provisions" for a tip question) or
 * from forum/adult/nav junk is dropped. If nothing clears the floor we return null
 * → the caller asks to clarify rather than printing garbage. Extractive only — we
 * stitch real sentences from real sources; we never invent facts.
 */
import type { SearchAnswer, SearchSource } from './search';
import { trimExtract } from './search';
import { gatherPassages, richAnswer } from './web-read';
import { detectAnswerType } from './extract';

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'has', 'have', 'had',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'me', 'us', 'them',
  'about', 'into', 'than', 'then', 'so', 'if', 'not', 'no', 'yes', 'just', 'really', 'actually',
  'get', 'got', 'make', 'made', 'really', 'kinda', 'gonna', 'wanna', 'whats', "what's", 'im', "i'm",
  'some', 'any', 'all', 'more', 'most', 'much', 'many', 'very', 'too', 'also', 'from', 'up', 'out',
]);

/** Content words of the query (lowercased, stopwords + short tokens dropped). */
function keywords(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().replace(/[^a-z0-9\s%/.-]/g, ' ').split(/\s+/)) {
    const w = raw.replace(/^[.\-]+|[.\-]+$/g, '');
    if (w.length >= 2 && !STOP.has(w)) out.push(w);
  }
  return Array.from(new Set(out));
}

/** Split prose into sentences (keeps decimals like 3.5 intact). */
function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 320);
}

// Junk: nav/boilerplate, forum first-person chatter, adult/spam — never an answer.
const JUNK = /\b(sign in|log in|subscribe|cookie|privacy policy|click here|read more|terms of|menu|navigation|posted by|wrote:|replied|comment|anon\b|porn|xxx|nsfw|escort|casino|viagra|crypto signal|history for|title:\s|text:\s|ifixit|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+20\d\d)\b/i;
const FORUMY = /^(i |my |we |so i |ok |anon|lol|imo|tbh|hey |wish )/i;
// SEO promo fluff that promises an answer instead of giving one ("Find out how…",
// "In this tutorial…", "We'll show you…") — drop so synthesis keeps real content.
const PROMO = /^(find out|learn (how|more|to|about)|discover|read on|in this (article|tutorial|guide|post|video)|we'?ll (show|teach|cover)|here'?s (everything|how|what|why)|let'?s (explore|dive|look)|keep reading|want to (know|learn)|looking for|whether you'?re)\b/i;

function looksJunk(s: string): boolean {
  if (JUNK.test(s)) return true;
  if (FORUMY.test(s)) return true;
  if (PROMO.test(s)) return true;
  const letters = (s.match(/[a-z]/gi) || []).length;
  if (letters < s.length * 0.55) return true; // too many symbols/numbers = not prose
  return false;
}

/** How many distinct query keywords the sentence contains (the relevance score).
 *  Hyphen/period-insensitive so "wifi" matches "Wi-Fi", "ebike" matches "e-bike". */
function relevance(sentence: string, kws: string[]): number {
  const low = ' ' + sentence.toLowerCase().replace(/[-.]/g, '') + ' ';
  let hits = 0;
  for (const k of kws) if (low.includes(k.replace(/[-.]/g, ''))) hits++;
  return hits;
}

interface Shape { compare: string[]; howto: boolean; }
function detectShape(q: string, kws: string[]): Shape {
  const m = q.match(/\b([a-z0-9][\w.+-]*)\s+(?:vs\.?|versus|or)\s+([a-z0-9][\w.+-]*)/i);
  const compare = m ? [m[1].toLowerCase(), m[2].toLowerCase()] : [];
  const howto = /\b(how (do|to|can|should)|steps?|guide|tutorial)\b/i.test(q);
  return { compare, howto };
}

/**
 * Read several sources and synthesize a cited answer, or null when nothing
 * relevant is found (caller then asks to clarify instead of guessing).
 */
export async function readAndSynthesize(query: string): Promise<SearchAnswer | null> {
  const type = detectAnswerType(query);

  // 1) Structured intents: read full pages, extract the real steps/ingredients/code.
  if (type === 'recipe' || type === 'howto' || type === 'code') {
    try {
      const rich = await richAnswer(query, type);
      if (rich && rich.answer && rich.answer.length > 40) return rich;
    } catch { /* fall through to synthesis */ }
  }

  // 2) Gather multi-source passages and synthesize from the relevant sentences.
  const passages = await gatherPassages(query, 6).catch(() => []);
  if (!passages.length) return null;
  return synthesizeText(query, passages);
}

/**
 * The synthesis CORE: given a query and already-gathered passages (from anywhere —
 * web read, on-device gather, etc.), keep only the sentences that bear on the
 * question (relevance + quality gates) and assemble the strongest few into a cited
 * answer. Null when nothing clears the floor. Pure — no network. This is the
 * extractive "read several, decide what matters" reader that needs no trained model,
 * so it lifts the cold/degraded path (no reranker/encoder) too.
 */
export function synthesizeText(
  query: string,
  passages: { text: string; source: SearchSource }[],
): SearchAnswer | null {
  const kws = keywords(query);
  if (kws.length === 0 || !passages.length) return null;
  const shape = detectShape(query, kws);
  const minHits = Math.min(2, kws.length); // need ≥2 query words (or all, if query is 1 word)

  type Scored = { s: string; src: SearchSource; sc: number };
  const pool: Scored[] = [];
  for (const p of passages) {
    for (const s of sentences(p.text)) {
      if (looksJunk(s)) continue;
      const sc = relevance(s, kws);
      if (sc >= minHits) pool.push({ s, src: p.source, sc });
    }
  }
  if (!pool.length) return null;

  // For a comparison, prefer sentences that mention BOTH sides.
  if (shape.compare.length === 2) {
    for (const it of pool) {
      const low = it.s.toLowerCase();
      if (shape.compare.every((c) => low.includes(c))) it.sc += 3;
    }
  }
  pool.sort((a, b) => b.sc - a.sc);

  // Pick the strongest, de-duplicated sentences (a few more for how-to/compare).
  const want = shape.howto || shape.compare.length ? 6 : 4;
  const picked: Scored[] = [];
  const seen = new Set<string>();
  for (const it of pool) {
    const key = it.s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= want) break;
  }
  // Relevance floor: the best sentence must share real content with the question.
  if (!picked.length || picked[0].sc < minHits) return null;

  const answer = trimExtract(picked.map((p) => p.s).join(' '), 700, 7);
  // Cite the distinct sources the picked sentences came from.
  const srcSeen = new Set<string>();
  const sources: SearchSource[] = [];
  for (const p of picked) {
    if (srcSeen.has(p.src.url)) continue;
    srcSeen.add(p.src.url);
    sources.push(p.src);
    if (sources.length >= 3) break;
  }
  return { answer, query, sources };
}
