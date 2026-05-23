/**
 * Xonvert AI — on-device answer engine.
 *
 * Lets the assistant answer factual questions ("who invented the lightbulb",
 * "what is photosynthesis") by searching the live web — entirely from the user's
 * browser, with no Xonvert server in the loop. The browser calls a small set of
 * CORS-enabled, key-free public APIs directly (Wikipedia, DuckDuckGo), and the
 * answer is built EXTRACTIVELY: the facts come verbatim from the source, with a
 * citation, never invented by the on-device language model. That single rule is
 * what makes a tiny model trustworthy for Q&A — it reads, it does not "know".
 *
 * CORS reality: a browser can only read responses from servers that allow it.
 * Wikipedia (origin=*) and DuckDuckGo's instant-answer API do; most of the open
 * web does not. So this is a real answer engine for facts/definitions, not a
 * general "top-10 links" search — which would need a server relay we don't want.
 *
 * Everything degrades gracefully: any failure (offline, blocked, empty) returns
 * null so the caller falls back to the chat model.
 */

export interface SearchSource {
  title: string;
  url: string;
  site: string;
}

export interface SearchAnswer {
  /** Extractive answer text — pulled from a source, lightly trimmed. */
  answer: string;
  /** The cleaned query we actually searched for. */
  query: string;
  /** Citations the answer is grounded in (shown as chips). */
  sources: SearchSource[];
  /** Disambiguation / related topics, offered as follow-up chips. */
  related?: string[];
  /** True when served from the on-device cache (no network this time). */
  cached?: boolean;
}

// --- query cleaning --------------------------------------------------------

// Leading phrasing we strip to get at the actual topic/entity. Order matters:
// longest, most specific patterns first. Conversational wrappers ("do you know",
// "i want to know", "can you tell me") get stripped too — searching them
// verbatim was matching noise ("do you know how ww1 started" → a tank officer).
const LEAD = [
  /^\s*(do you know|did you know|any idea|i(’|')?m curious( about)?|i (just )?(want|need|would like|wanted) to know|i was wondering)\b/i,
  /^\s*(can you (please )?(tell me|explain|describe)|could you (tell me|explain))\b/i,
  /^\s*(tell me (about|more about)?|explain( to me)?|describe|define|what(’|')?s the (meaning|definition) of|meaning of|definition of)\b/i,
  /^\s*(who(’|')?s|who (is|are|was|were)|what(’|')?s|what (is|are|was|were)|where (is|are|was)|when (was|did|is)|how (does|do|did|tall|big|old|far|long))\b/i,
  /^\s*(what|who|why|where|when|which|how)\b/i,
];

// Common abbreviations the encyclopedia indexes under their full name. Expanding
// them sharpens the search ("ww1" → "world war i").
const ABBREV: [RegExp, string][] = [
  [/\bww\s?1\b/gi, 'world war i'],
  [/\bww\s?2\b/gi, 'world war ii'],
  [/\bwwii\b/gi, 'world war ii'],
  [/\bwwi\b/gi, 'world war i'],
  [/\busa\b/gi, 'united states'],
  [/\buk\b/gi, 'united kingdom'],
];

/** Reduce a natural question to a search topic ("who invented X" → "X invented"). */
export function cleanQuery(text: string): string {
  let q = text.trim().replace(/\s+/g, ' ');
  // Peel conversational/question wrappers — possibly more than one ("do you know
  // how ww1 started" → "ww1 started").
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const re of LEAD) {
      const next = q.replace(re, '').trim();
      if (next && next !== q) { q = next; changed = true; break; }
    }
    if (!changed) break;
  }
  for (const [re, full] of ABBREV) q = q.replace(re, full);
  // Drop a leading auxiliary left after the question word ("why DID rome fall"
  // → "rome fall"), then leading filler and trailing punctuation.
  q = q.replace(/^(did|does|do|is|are|was|were|has|have|had|will|would|can|could|should)\s+/i, '');
  q = q.replace(/^(the|a|an|of|about)\s+/i, '').replace(/[?!.\s]+$/g, '').trim();
  return q || text.trim().replace(/[?!.\s]+$/g, '');
}

// Signals that the answer is time-sensitive — a live figure, recent event, or
// "best of <year>" opinion — which the open web answers and an encyclopedia
// article does not. These route to Tier 2 (web) ahead of Wikipedia.
const LIVE_RE = /\b(price|stock|stocks|shares?|crypto|bitcoin|btc|ethereum|exchange rate|news|latest|today|tonight|right now|currently|recent|recently|this (year|week|month)|trending|score|scores|results?|release date|best|top|cheapest|2024|2025|2026|2027)\b/i;

// --- fetch with timeout ----------------------------------------------------

async function getJson(url: string, headers?: Record<string, string>, ms = 6000): Promise<any | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store', referrerPolicy: 'no-referrer', headers });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Wikipedia API etiquette: identify the client. `Api-User-Agent` is honoured by
// Wikimedia and, unlike `User-Agent`, is settable from browser fetch.
const WIKI_HEADERS = { 'Api-User-Agent': 'Xonvert/1.0 (https://xonvert.com; contact@xonvert.com)' };

/** Keep an answer tight: first few sentences, capped, never mid-word. Short by
 *  default — users want a quick answer, not an essay. */
export function trimExtract(text: string, maxChars = 380, maxSentences = 3): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean];
  let out = '';
  for (const s of sentences.slice(0, maxSentences)) {
    if (out.length + s.length > maxChars && out) break;
    out += s;
  }
  out = out.trim() || clean.slice(0, maxChars);
  if (out.length > maxChars) out = out.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  return out;
}

// --- sources ---------------------------------------------------------------

interface SourceHit {
  answer: string;
  source: SearchSource;
  related?: string[];
  /** Higher = more authoritative for ranking when sources disagree. */
  weight: number;
}

// Content words of a query (4+ chars, no stopwords) — for the relevance guard.
const QSTOP = new Set(['what', 'which', 'where', 'when', 'whom', 'whose', 'about', 'that', 'this', 'with', 'from', 'into', 'than', 'then', 'better', 'best', 'worse', 'worst', 'versus', 'compared', 'between', 'their', 'there', 'they', 'does', 'did', 'is', 'are', 'the', 'and', 'or', 'of', 'to', 'a', 'an', 'how', 'why', 'who']);
function contentTerms(s: string): string[] {
  return Array.from(new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !QSTOP.has(w))));
}
/**
 * Does `text` actually relate to the query? Requires the MAJORITY of the query's
 * content words to appear as WHOLE words — not a stray substring. This stops a
 * noisy Wikipedia search from answering "which is better shaq or jordan" with an
 * unrelated "Anita Anand", and "michel jordan" with "Mont-Saint-Michel" (which
 * only shared the substring "michel"). When the encyclopedia can't clear this
 * bar, the caller falls through to the open web, which autocorrects misspellings.
 */
function sharesTerm(query: string, text: string): boolean {
  const terms = contentTerms(query);
  if (!terms.length) return true; // nothing distinctive to check → don't block
  const hayWords = new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean));
  const matched = terms.filter((t) => hayWords.has(t)).length;
  return matched / terms.length >= 0.6;
}

/**
 * Wikipedia: one request does search + intro extract + canonical URL.
 * Detects disambiguation pages ("X may refer to…") and returns the other search
 * hits as `related` chips instead of a misleading answer.
 */
async function wikipedia(query: string): Promise<SourceHit | null> {
  const url =
    'https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query' +
    '&generator=search&gsrsearch=' + encodeURIComponent(query) + '&gsrlimit=5' +
    '&prop=extracts|info&exintro=1&explaintext=1&exsentences=4&inprop=url&redirects=1';
  const data = await getJson(url, WIKI_HEADERS);
  const pages = data?.query?.pages;
  if (!pages) return null;
  const list = Object.values(pages) as any[];
  // generator=search returns an `index` ordering; respect it.
  list.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  if (!list.length) return null;
  const titles = list.map((p) => String(p.title)).filter(Boolean);
  const top = list[0];
  const topExtract = String(top.extract ?? '').trim();

  // Disambiguation page at the top: don't answer, offer the alternatives.
  if (/\bmay refer to\b|\bcan refer to\b/i.test(topExtract)) {
    return { answer: '', source: { title: String(top.title), url: String(top.fullurl), site: 'Wikipedia' }, related: titles.slice(0, 6), weight: 0 };
  }
  // The top search hit can be a list/stub with an empty intro — scan for the
  // first page that actually carries prose AND is relevant. The relevance guard
  // (shares a query term) stops a noisy multi-entity / misspelled query from
  // returning a top hit with nothing to do with it ("…shaq or jordan" →
  // "Anita Anand") — reject that and let the caller fall through to the web.
  const withProse = list.find((p) => {
    const e = String(p.extract ?? '').trim();
    return e.length > 40 && !/\bmay refer to\b|\bcan refer to\b/i.test(e) && sharesTerm(query, `${p.title} ${e}`);
  });
  if (!withProse) {
    return titles.length > 1
      ? { answer: '', source: { title: String(top.title), url: String(top.fullurl), site: 'Wikipedia' }, related: titles.slice(0, 6), weight: 0 }
      : null;
  }
  return {
    answer: trimExtract(String(withProse.extract)),
    source: { title: String(withProse.title), url: String(withProse.fullurl), site: 'Wikipedia' },
    related: titles.filter((t) => t !== withProse.title).slice(0, 4),
    weight: 2,
  };
}

/**
 * Gather the best available source text for a SINGLE topic/entity — the unit the
 * Answer Brain reads before it synthesizes. Tries the private encyclopedia
 * first, then the open web. Returns the text + one citation, or null.
 */
export async function fetchTopic(topic: string): Promise<{ text: string; source: SearchSource } | null> {
  const q = cleanQuery(topic);
  if (!q) return null;
  const wiki = await wikipedia(q);
  if (wiki && wiki.answer) return { text: wiki.answer, source: wiki.source };
  try {
    const { answerFromWeb } = await import('./web-read');
    const web = await answerFromWeb(q);
    if (web && web.answer) return { text: web.answer, source: web.sources[0] ?? { title: q, url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, site: 'web' } };
  } catch { /* offline */ }
  return null;
}

/**
 * DuckDuckGo Instant Answer: best for direct facts, definitions and
 * disambiguation. `Answer` is a computed/direct hit (strongest); `AbstractText`
 * is a sourced summary.
 */
async function duckduckgo(query: string): Promise<SourceHit | null> {
  const url = 'https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&t=xonvert&q=' + encodeURIComponent(query);
  const d = await getJson(url);
  if (!d) return null;

  const directAnswer = String(d.Answer ?? '').trim();
  if (directAnswer) {
    return {
      answer: trimExtract(directAnswer),
      source: { title: d.AnswerType ? `DuckDuckGo (${d.AnswerType})` : 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query), site: 'DuckDuckGo' },
      weight: 3,
    };
  }
  const abstract = String(d.AbstractText ?? '').trim();
  const definition = String(d.Definition ?? '').trim();
  const body = abstract || definition;
  if (body) {
    const src = String(d.AbstractURL || d.DefinitionURL || '').trim();
    const site = String(d.AbstractSource || d.DefinitionSource || 'DuckDuckGo').trim();
    return {
      answer: trimExtract(body),
      source: { title: String(d.Heading || query), url: src || ('https://duckduckgo.com/?q=' + encodeURIComponent(query)), site },
      weight: 1.5,
    };
  }
  // Only related topics → useful as disambiguation chips.
  const related = Array.isArray(d.RelatedTopics)
    ? d.RelatedTopics.map((r: any) => String(r?.Text ?? '').split(' - ')[0].trim()).filter(Boolean).slice(0, 6)
    : [];
  if (related.length) {
    return { answer: '', source: { title: query, url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query), site: 'DuckDuckGo' }, related, weight: 0 };
  }
  return null;
}

// --- specialized sources (live weather, dictionary) ------------------------

// WMO weather codes → short description (Open-Meteo's `weather_code`).
const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'dense drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers',
  85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};

/** Live weather for "what's the weather in <place>". Never cached (volatile). */
async function weather(text: string): Promise<{ answer: SearchAnswer; volatile: true } | null> {
  if (!/\b(weather|temperature|forecast|how (hot|cold|warm))\b/i.test(text)) return null;
  const m = text.match(/\b(?:in|at|for|of)\s+([A-Za-z][A-Za-z\s,.'-]{1,40})/i);
  const place = (m?.[1] ?? '').replace(/[?.!]+$/, '').trim();
  if (!place) return null;
  const geo = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(place));
  const g = geo?.results?.[0];
  if (!g) return null;
  const fc = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`);
  const cur = fc?.current;
  if (!cur) return null;
  const where = [g.name, g.admin1, g.country].filter(Boolean).join(', ');
  const desc = WMO[Number(cur.weather_code)] ?? '';
  const parts = [`It's currently ${Math.round(cur.temperature_2m)}°C in ${where}${desc ? ` — ${desc}` : ''}.`];
  if (cur.relative_humidity_2m != null) parts.push(`Humidity ${cur.relative_humidity_2m}%`);
  if (cur.wind_speed_10m != null) parts.push(`wind ${Math.round(cur.wind_speed_10m)} km/h`);
  return {
    volatile: true,
    answer: { answer: parts.join(' · '), query: `weather in ${where}`, sources: [{ title: 'Open-Meteo', url: 'https://open-meteo.com/', site: 'Open-Meteo' }] },
  };
}

/** A crisp dictionary definition for "define X" / "what does X mean". */
async function dictionary(text: string): Promise<{ answer: SearchAnswer; volatile: false } | null> {
  const m = text.match(/(?:define|definition of|meaning of)\s+([a-z][a-z-]{1,30})\b/i)
    ?? text.match(/what does\s+(?:the word\s+)?([a-z][a-z-]{1,30})\s+mean\b/i);
  const word = m?.[1]?.toLowerCase();
  if (!word) return null;
  const d = await getJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
  const entry = Array.isArray(d) ? d[0] : null;
  const meaning = entry?.meanings?.[0];
  const def = meaning?.definitions?.[0]?.definition;
  if (!def) return null;
  const pos = meaning.partOfSpeech ? `(${meaning.partOfSpeech}) ` : '';
  const phon = entry.phonetic ? ` ${entry.phonetic}` : '';
  return {
    volatile: false,
    answer: {
      answer: `${word}${phon} ${pos}— ${def}`,
      query: word,
      sources: [{ title: 'Dictionary', url: `https://www.dictionary.com/browse/${encodeURIComponent(word)}`, site: 'Dictionary' }],
    },
  };
}

// --- the engine ------------------------------------------------------------

/**
 * Answer a factual question on-device. Fans out to the CORS-enabled sources in
 * parallel, prefers a real extractive answer over a disambiguation, and cites
 * what it used. Returns null when nothing solid is found (caller falls back to
 * the chat model) — a weak model that admits "I don't know" beats one that lies.
 */
export async function answerQuestion(text: string): Promise<SearchAnswer | null> {
  const query = cleanQuery(text);
  if (!query || query.length < 2) return null;

  // Magic layer: a meaning-based cache hit returns instantly, fully offline.
  const { getCached, putCached } = await import('./search-cache');
  const cached = await getCached(text);
  if (cached) return cached;

  // Specialized sources answer their domain far better than an encyclopedia.
  const special = (await weather(text)) ?? (await dictionary(text));
  if (special) {
    void putCached(text, special.answer, { volatile: special.volatile });
    return special.answer;
  }

  // Exact live market quote ("bitcoin price", "AAPL stock", "tesla shares") — a
  // real-time number from one general quote source (any symbol), read through
  // the CORS shim. Volatile → never cached. Falls through if we can't name a
  // symbol or the fetch fails.
  try {
    const { liveQuote } = await import('./quote');
    const q = await liveQuote(text);
    if (q && q.answer) return q;
  } catch { /* fall through */ }

  // Live / recent / opinion queries ("latest news", "best games 2026") are
  // answered by the open web, NOT a static encyclopedia article — so for these,
  // try Tier 2 first. (Volatile, so we don't cache the result.)
  if (LIVE_RE.test(text)) {
    try {
      const { answerFromWeb } = await import('./web-read');
      const web = await answerFromWeb(query);
      if (web && web.answer) return web;
    } catch { /* fall through to Tier 1 */ }
  }

  // Tier 1 — on-device, private, CORS-enabled encyclopedia sources.
  const [wiki, ddg] = await Promise.all([wikipedia(query), duckduckgo(query)]);
  const hits = [wiki, ddg].filter((h): h is SourceHit => !!h);

  // Prefer hits that actually carry an answer, strongest weight first.
  const answered = hits.filter((h) => h.answer).sort((a, b) => b.weight - a.weight);

  if (answered.length) {
    const primary = answered[0];
    const sources = dedupeSources(answered.map((h) => h.source));
    // Merge related from whichever hit carried them.
    const related = Array.from(new Set(hits.flatMap((h) => h.related ?? []))).filter((r) => r && r.toLowerCase() !== query.toLowerCase()).slice(0, 5);
    const result: SearchAnswer = { answer: primary.answer, query, sources, related: related.length ? related : undefined };
    void putCached(text, result);
    return result;
  }

  // Tier 2 — the open web (live data, recent events, anything Tier 1 missed),
  // read on-device through the open-source reader. Only reached when the private
  // sources came up empty, so most questions never leave Wikipedia/Wikidata.
  try {
    const { answerFromWeb } = await import('./web-read');
    const web = await answerFromWeb(query);
    if (web && web.answer) { void putCached(text, web); return web; }
    // Disambiguation-only from the web is still useful as chips.
    if (web && web.related?.length) return web;
  } catch { /* reader unavailable → fall through */ }

  // No prose answer, but Tier 1 left disambiguation candidates → offer them.
  const related = Array.from(new Set(hits.flatMap((h) => h.related ?? []))).slice(0, 6);
  if (related.length) {
    return { answer: '', query, sources: dedupeSources(hits.map((h) => h.source)), related };
  }
  return null;
}

function dedupeSources(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>();
  const out: SearchSource[] = [];
  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out.slice(0, 3);
}
