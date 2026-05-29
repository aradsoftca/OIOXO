/**
 * researcher — the ART OF SEARCH. The smartness layer between "decide the move"
 * (the brain) and "retrieve" (the search engine). It makes the AI research like a
 * person instead of grabbing the first snippet:
 *
 *   1. CLASSIFY THE NATURE of the ask (any language) — factual / multi-hop /
 *      speculative-future / local-commerce / how-to / compare / explain / list.
 *      The nature decides HOW to search and HOW to answer (the register).
 *   2. PLAN the searches — turn ONE prompt into several focused queries with the
 *      RIGHT keywords (not the user's sentence), in the user's language AND
 *      English, with cross-lingual reach for knowledge-gap topics. "Knows what
 *      to search" — independent of how the user phrased it.
 *   3. (step 2, gather.ts) multi-HOP gather + working memory.
 *   4. (step 3, synth) register-aware answer in the user's language.
 *
 * This module is the PLAN half: classify + plan. Pure, deterministic, model-free
 * → instant on the weakest device, and the floor the trained brain later sharpens
 * (the brain may PROPOSE queries; this guarantees a strong set regardless).
 *
 * Built step by step (see BRAIN_ARCHITECTURE_V4 + PLATFORM_BODY §3D, "art of search").
 */

export type Nature =
  | 'factual'       // a fact to look up and state (may be multi-hop)
  | 'speculative'   // future/opinion/unknowable → honest + light calc + playful, NEVER a fake fact
  | 'local'         // buy/find/visit something in a place → local results, user's language
  | 'procedural'    // how-to → steps
  | 'compare'       // A vs B
  | 'explain'       // how/why something works
  | 'list';         // best/top/recommend N

export interface Slots {
  /** ISO-639-1 of the prompt (best effort), so we answer in the user's language. */
  lang: string;
  /** Place mentioned ("Perugia", "Ontario"), drives local + grounds queries. */
  location: string | null;
  /** True when the ask is about the FUTURE / unknowable. */
  future: boolean;
  /** The thing the ask is about ("bicycle", "Ronaldo", "tuition"). */
  entity: string | null;
  /** The attribute wanted ("tuition", "price", "goals"), if any. */
  attribute: string | null;
  /** Content keywords (lowercased, de-stopworded) for query building. */
  keywords: string[];
}

export interface SearchPlan {
  nature: Nature;
  slots: Slots;
  /** Focused queries to run, in priority order (user-lang + English + cross-lingual). */
  queries: string[];
  /** Whether to deliberately reach into other-language corpora (knowledge gaps). */
  crossLingual: boolean;
  /** Whether the answer needs MULTIPLE hops (gather → refine → gather again). */
  multiHop: boolean;
}

// ── language detection (script-based, cheap, no model) ────────────────────────
function detectLang(q: string): string {
  if (/[؀-ۿ]/.test(q)) return 'fa';            // Arabic script (fa/ar) — default fa for our base
  if (/[Ѐ-ӿ]/.test(q)) return 'ru';
  if (/[ऀ-ॿ]/.test(q)) return 'hi';
  if (/[぀-ヿ一-鿿]/.test(q)) return 'ja';
  if (/[가-힯]/.test(q)) return 'ko';
  // Latin-script European cues (so we answer Italian/Spanish/French in-language).
  const l = q.toLowerCase();
  if (/\b(vorrei|comprare|biciclett|negozio|dove|migliore|prezzo|come posso)\b/.test(l)) return 'it';
  if (/\b(quiero|comprar|dónde|mejor|precio|cómo|cuánto)\b/.test(l)) return 'es';
  if (/\b(je veux|acheter|où|meilleur|prix|comment|combien|quelle?|capitale|pourquoi|est-ce|qu'est)\b/.test(l)) return 'fr';
  if (/\b(ich möchte|kaufen|wo|beste|preis|wie|wie viel|warum|hauptstadt)\b/.test(l)) return 'de';
  return 'en';
}

const STOP = new Set([
  'the','a','an','and','or','of','to','in','on','for','with','is','are','was','were','be','do','does',
  'how','what','which','who','when','where','why','will','would','should','can','could','i','you','my',
  'much','many','some','any','about','that','this','these','those','at','by','from','it','its','near',
  // common non-EN fillers we strip for keyword extraction
  'vorrei','comprare','un','una','di','in','a','quiero','comprar','je','veux','un','une',
]);
function keywords(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    // Keep tokens ≥2 chars OR any token containing a digit ("2" in "world war 2",
    // "200k" — single digits disambiguate WW1/WW2 and must not be dropped).
    if ((raw.length >= 2 || /\d/.test(raw)) && !STOP.has(raw)) out.push(raw);
  }
  return Array.from(new Set(out));
}

// ── nature cues (multilingual) ────────────────────────────────────────────────
const FUTURE_RE = /\b(will|going to|gonna|future|predict|forecast|by 20[2-9]\d|in 20[3-9]\d|next (year|decade)|in the future)\b|آینده|در آینده|خواهد|futuro|avenir|zukunft/i;
const SPEC_RE = /\b(how many .* (will|going to)|what will|how will|when will|do you think .* will|predict|chance(s)? (of|that)|odds)\b/i;
const LOCAL_RE = /\b(buy|purchase|shop|store|near me|nearby|where can i (buy|get|find)|rent|hire)\b|\b(vorrei comprare|comprare|negozio|quiero comprar|comprar|acheter|kaufen)\b|بخرم|خرید/i;
const PROC_RE = /^\s*(how to|how do i|how can i|steps to)\b|چگونه|چطور|come (posso|si fa)|cómo|comment (faire|je)/i;
const COMPARE_RE = /\b(vs\.?|versus|difference between|compared? to|which is better|better than)\b/i;
const EXPLAIN_RE = /^\s*(why|how does|how do|how is|how come|explain|tell me about|what is the difference)\b|چرا|왜|为什么|なぜ|perché|por qué|pourquoi|warum/i;
// Definition asks — "define X", "what does X mean", "meaning of X". Handled as a
// short explanation, and NOT through location extraction ("meaning of serendipity"
// must not treat "serendipity" as a place).
const DEFINE_RE = /^\s*(define|what(?:'s| is| does)\b.*\b(mean|meaning|definition)|meaning of|definition of)\b/i;
const LIST_RE = /\b(best|top \d+|top|recommend|good .* for|favou?rite)\b|migliori|mejores|meilleurs/i;

// place after "in/at/near/of" (EN) or "a/à/en" (it/fr/es), grounding the search.
// Users type lowercase, so we DON'T require a capital — we take the 1–2 word noun
// after the preposition and reject obvious non-places ("the future", "a banana").
const NOT_PLACE = new Set(['the','future','a','an','order','general','fact','time','case','my','your','it','them','this','that','college','colleges','school','schools','university','universities','domestic','student','students','international','course','courses','program']);
function extractLocation(q: string): string | null {
  // Capitalized multi-word place is the most reliable: "New York", "Ontario".
  const cap = q.match(/\b(?:in|at|near|around|of|a|à|en)\s+([A-ZÀ-Þ][\p{L}.\-]+(?:\s+[A-ZÀ-Þ][\p{L}.\-]+)?)/u);
  if (cap) return cap[1].trim().replace(/[.?!,]+$/, '');
  // Lowercase fallback: scan ALL prepositional objects, keep the LAST non-filler one
  // (in "tuition of domestic student in college of ontario", the place is last).
  const re = /\b(?:in|at|near|around|of)\s+([\p{L}][\p{L}\-]{2,24})\b/gu;
  let m: RegExpExecArray | null, last: string | null = null;
  while ((m = re.exec(q.toLowerCase())) !== null) { if (!NOT_PLACE.has(m[1])) last = m[1]; }
  return last;
}

// attribute the user wants (tuition/price/cost/goals/population…), drives multi-hop target
const ATTR_RE = /\b(tuition|fees?|cost|price|salary|population|height|weight|goals?|points?|score|distance|area|gdp|revenue)\b/i;
function extractAttribute(q: string): string | null {
  const m = q.match(ATTR_RE);
  return m ? m[1].toLowerCase().replace(/s$/, '') : null;
}

/** Classify the nature of ANY prompt + extract the slots that drive search. */
export function classifyNature(question: string): { nature: Nature; slots: Slots } {
  const q = question.trim();
  const lang = detectLang(q);
  const isDefine = DEFINE_RE.test(q);
  // Definitions don't have a location ("meaning of serendipity" ≠ a place).
  const location = isDefine ? null : extractLocation(q);
  const attribute = extractAttribute(q);
  const future = FUTURE_RE.test(q);
  const kw = keywords(q);
  const slots: Slots = { lang, location, future, entity: kw[0] ?? null, attribute, keywords: kw };

  // Order matters: define + speculative BEFORE factual (they LOOK like fact asks but
  // aren't), local BEFORE factual (commerce intent), then the rest.
  let nature: Nature;
  if (isDefine) nature = 'explain';                          // a definition → short explanation
  // Any future-tense OUTCOME question is speculative — "will X", "is X going to",
  // "who/what/when will", quantity/event predictions. We must never fake the future.
  else if (future && (SPEC_RE.test(q) || /\b(will|going to|gonna)\b/i.test(q) || /\b(how many|how much|when|score|wins?|reach|hit|happen|cost)\b/i.test(q))) nature = 'speculative';
  else if (LOCAL_RE.test(q)) nature = 'local';
  else if (PROC_RE.test(q)) nature = 'procedural';
  else if (COMPARE_RE.test(q)) nature = 'compare';
  else if (LIST_RE.test(q)) nature = 'list';
  else if (EXPLAIN_RE.test(q)) nature = 'explain';
  else nature = 'factual';
  return { nature, slots };
}

// ── query planning (the "knows what to search" core) ──────────────────────────
const NON_EN = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'bn', 'zh', 'ja'];

/** Turn ONE prompt into the focused searches a good researcher would run. */
export function planQueries(question: string): SearchPlan {
  const { nature, slots } = classifyNature(question);
  const kw = slots.keywords;
  const core = kw.join(' ').trim() || question.trim();
  const queries: string[] = [];
  let crossLingual = false;
  let multiHop = false;

  switch (nature) {
    case 'local': {
      // Local commerce: search in the USER's language AND English, grounded on place.
      const place = slots.location || '';
      const thing = kw.filter((w) => w !== (place.toLowerCase())).slice(0, 3).join(' ');
      if (slots.lang === 'it') queries.push(`negozi ${thing} ${place}`.trim(), `dove comprare ${thing} ${place}`.trim());
      else if (slots.lang === 'es') queries.push(`tiendas ${thing} ${place}`.trim(), `dónde comprar ${thing} ${place}`.trim());
      else if (slots.lang === 'fr') queries.push(`magasins ${thing} ${place}`.trim());
      queries.push(`${thing} shop ${place}`.trim(), `buy ${thing} ${place}`.trim());
      break;
    }
    case 'speculative': {
      // We do NOT pretend to know the future. We fetch the CURRENT stat to ground a
      // light, honest, playful estimate. One factual query for the baseline.
      const subject = kw.slice(0, 3).join(' ');
      queries.push(`${subject} current total ${slots.attribute || ''}`.trim(), `${subject} career stats`.trim());
      break;
    }
    case 'compare': {
      // One query per side is handled by reason.ts comparePair; here keep the whole.
      queries.push(core);
      break;
    }
    case 'procedural':
      // Don't bolt English "how to" onto a non-English query (the prompt already
      // carries its own "how" — Persian چگونه, etc.).
      if (slots.lang === 'en') queries.push(`how to ${core}`, `${core} steps`);
      else queries.push(question.trim(), core);
      break;
    case 'list':
      queries.push(core, `best ${kw.filter((w) => w !== 'best' && w !== 'top').join(' ')}`.trim());
      break;
    case 'explain':
      queries.push(core, `${core} explained`);
      crossLingual = true;          // explanations benefit from cross-lingual depth
      break;
    case 'factual':
    default: {
      queries.push(core);
      // Multi-hop signal: a category + attribute ("Ontario college tuition") needs a
      // second hop (find the institutions, then their attribute pages). Don't repeat
      // the attribute if the core already contains it.
      if (slots.attribute && (slots.location || kw.length >= 3)) {
        multiHop = true;
        const hasAttr = core.includes(slots.attribute);
        if (slots.location) queries.push(`${slots.location} ${slots.attribute} ${kw.filter((w) => w !== slots.location!.toLowerCase() && w !== slots.attribute).slice(0, 2).join(' ')}`.trim());
        if (!hasAttr) queries.push(`${core} ${slots.attribute}`.trim());
        else queries.push(`${core} cost amount`.trim());
      }
      // Knowledge-gap topics (history/biography/war/culture) gain from other-language
      // corpora — incl. WWI/WWII and named wars, the "read Bengali sources" reach.
      if (/\b(war|wars|ww1|ww2|wwi|wwii|world war|history|empire|dynasty|battle|revolution|ancient|culture|tradition|conflict|genocide|colon)\b/i.test(question)) crossLingual = true;
      break;
    }
  }

  // De-dup, drop empties.
  const seen = new Set<string>();
  const uniq = queries.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s && !seen.has(s) && (seen.add(s), true)).slice(0, 4);

  return { nature, slots, queries: uniq, crossLingual, multiHop };
}

/** Build cross-lingual variants of a query for knowledge-gap fan-out (step 4 uses
 *  the translator; here we expose the target languages so gather can pivot). */
export function crossLingualTargets(plan: SearchPlan): string[] {
  if (!plan.crossLingual) return [];
  return NON_EN.filter((l) => l !== plan.slots.lang && l !== 'en');
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — multi-HOP gather + WORKING MEMORY. Search the planned queries, hold the
// raw evidence, REFLECT (did we get the target fact?), and if not, do a second hop
// — read the top pages deeply (the tuition/price number lives in the page, not the
// snippet) or refine from what hop 1 found. Bounded for speed (≤2 hops by default).
// ─────────────────────────────────────────────────────────────────────────────
import { webSearch, WIKI_UA } from './metasearch';
import { gatherPassages } from './web-read';

export interface EvidenceItem {
  query: string; hop: number; title: string; url: string; text: string; source: string;
}
export interface EvidenceBundle {
  plan: SearchPlan;
  items: EvidenceItem[];
  hops: number;
  /** Did the working memory end up containing the target fact (a number for an
   *  attribute ask, or any solid passage otherwise)? Drives synthesis confidence. */
  foundTarget: boolean;
}

const NUM_RE = /(?:[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:%|usd|cad|eur|dollars?|per year|\/year|\/yr|goals?|points?|km|kg|million|billion))/i;
/** Does the working memory contain the target fact? For an attribute ask we need
 *  the attribute, a number, AND (when the ask is place-grounded) the place — all in
 *  the SAME passage. This is what stops "University of Sydney tuition" from
 *  satisfying a question about ONTARIO tuition (a real false-positive we saw). */
function hasTarget(items: EvidenceItem[], plan: SearchPlan): boolean {
  if (!items.length) return false;
  if (plan.slots.attribute) {
    const loc = plan.slots.location?.toLowerCase();
    return items.some((i) => {
      const t = `${i.title} ${i.text}`.toLowerCase();
      return t.includes(plan.slots.attribute!) && NUM_RE.test(t) && (!loc || t.includes(loc));
    });
  }
  return items.some((i) => (i.text || '').length > 120);   // any substantial passage
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'web'; } };

/** Fetch the lead passage of a topic from a specific-language Wikipedia (CORS-open).
 *  This is the cross-lingual reach: raw data from the corpora Google under-indexes. */
async function wikiInLang(topic: string, lang: string): Promise<{ title: string; url: string; text: string } | null> {
  try {
    const s = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`, { cache: 'no-store', headers: WIKI_UA });
    if (!s.ok) return null;
    const sj = await s.json() as { query?: { search?: { title?: string }[] } };
    const title = sj.query?.search?.[0]?.title;
    if (!title) return null;
    const e = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`, { cache: 'no-store', headers: WIKI_UA });
    if (!e.ok) return null;
    const ej = await e.json() as { query?: { pages?: Record<string, { extract?: string }> } };
    const page = Object.values(ej.query?.pages ?? {})[0];
    const text = (page?.extract ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!text) return null;
    return { title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, text };
  } catch { return null; }
}

/** Run ONE hop: federated web search for each query, collect the top hits. */
async function searchHop(queries: string[], hop: number, perQuery = 6): Promise<EvidenceItem[]> {
  const out: EvidenceItem[] = [];
  const seen = new Set<string>();
  const batches = await Promise.all(queries.map((q) => webSearch(q, perQuery).catch(() => [])));
  batches.forEach((hits, qi) => {
    for (const h of hits) {
      if (!h.url || seen.has(h.url)) continue; seen.add(h.url);
      out.push({ query: queries[qi], hop, title: h.title || '', url: h.url, text: h.extract || '', source: h.engine || host(h.url) });
    }
  });
  return out;
}

/**
 * Gather evidence for a plan, multi-hop. Returns the working memory the synthesis
 * step reads. Pure orchestration over the live engine; best-effort (a dead source
 * contributes nothing, never throws).
 */
export async function gather(plan: SearchPlan, maxHops = 2): Promise<EvidenceBundle> {
  const items: EvidenceItem[] = [];
  let hops = 0;

  // HOP 1 — the planned queries.
  hops++;
  items.push(...await searchHop(plan.queries, hops));

  // CROSS-LINGUAL reach. For knowledge-gap topics (history/war/culture), English
  // alone is thin — pull the SAME topic from other-language Wikipedias so we cover
  // what Google's English index misses ("WW1 from Bengali/German sources"). The
  // passages enter working memory as raw evidence; the browser translate layer
  // renders them in the user's language at answer time.
  if (plan.crossLingual) {
    const core = plan.slots.keywords.join(' ').trim() || plan.queries[0] || '';
    const langs = crossLingualTargets(plan).slice(0, 3);
    const xl = await Promise.all(langs.map((lg) => wikiInLang(core, lg).catch(() => null)));
    xl.forEach((hit, i) => { if (hit) items.push({ query: `xlang:${langs[i]}:${core}`, hop: hops, title: hit.title, url: hit.url, text: hit.text, source: `wikipedia:${langs[i]}` }); });
  }

  // REFLECT → HOP 2. If we still don't have the target fact and the plan expects a
  // multi-hop answer (e.g. tuition: find the colleges in hop 1, READ their fee pages
  // in hop 2), read the most promising pages deeply — the number is in the page body.
  if (plan.multiHop && hops < maxHops && !hasTarget(items, plan)) {
    hops++;
    const top = items.slice(0, 3);
    const reads = await Promise.all(top.map((it) =>
      gatherPassages(`${it.title} ${plan.slots.attribute || ''}`.trim(), 2).catch(() => [])));
    reads.forEach((passages, i) => {
      for (const p of passages) {
        if (!p.text) continue;
        items.push({ query: `read:${top[i].url}`, hop: hops, title: top[i].title, url: top[i].url, text: p.text, source: p.source?.site || host(top[i].url) });
      }
    });
    // If deep-read still found nothing, refine the query from hop-1 titles + attribute.
    if (!hasTarget(items, plan) && top[0]) {
      const refined = `${top[0].title} ${plan.slots.attribute || plan.slots.keywords.slice(0, 2).join(' ')}`.trim();
      items.push(...await searchHop([refined], hops));
    }
  }

  return { plan, items, hops, foundTarget: hasTarget(items, plan) };
}

/** One-call convenience: plan + gather. */
export async function research(question: string, maxHops = 2): Promise<EvidenceBundle> {
  return gather(planQueries(question), maxHops);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — REGISTER-AWARE SYNTHESIS. The nature decides the SHAPE of the answer,
// not just the search. Extractive + template (model-free → instant, on-device);
// the trained brain later rewrites the prose. The cardinal rule: NEVER fabricate —
// a speculative ask gets an honest+playful estimate, an unfound fact gets an honest
// "couldn't confirm" with the closest evidence, never an invented number.
// ─────────────────────────────────────────────────────────────────────────────
export interface Answer {
  nature: Nature;
  text: string;
  /** Citations the answer rests on. */
  sources: { title: string; url: string }[];
  /** False when we could not confirm the fact — the caller can offer alternatives. */
  confident: boolean;
  lang: string;
}

const sentences = (t: string) => (t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25);
/** Headline stat for a speculative ask — ONLY a number that sits in a sentence
 *  actually about the asked attribute (e.g. a number near "goal"), so we never
 *  inject a random scraped figure. Returns null if we can't tie a number to the
 *  stat — and the synthesis then gives the honest no-number playful answer. */
function bestStat(items: EvidenceItem[], attribute: string | null): string | null {
  if (!attribute) return null;
  const re = /\b(\d{1,3}(?:,\d{3})+|\d{2,4})\b/g;
  let best: { n: number; raw: string } | null = null;
  for (const i of items) {
    for (const s of sentences(`${i.title}. ${i.text}`)) {
      if (!s.toLowerCase().includes(attribute)) continue;   // number must be about the stat
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const n = parseInt(m[1].replace(/,/g, ''), 10);
        if (n >= 1900 && n <= 2100) continue;               // skip years
        if (!best || n > best.n) best = { n, raw: m[1] };
      }
    }
  }
  return best ? best.raw : null;
}
/** Rank sentences by overlap with the query keywords + must contain a number if the
 *  ask wants an attribute. Returns the best one or two, with their source. */
function bestSentences(bundle: EvidenceBundle, n = 2): { text: string; src: EvidenceItem }[] {
  const kw = bundle.plan.slots.keywords;
  const wantNum = !!bundle.plan.slots.attribute;
  const scored: { text: string; src: EvidenceItem; score: number }[] = [];
  for (const it of bundle.items) {
    for (const s of sentences(it.text)) {
      const l = s.toLowerCase();
      let score = kw.reduce((a, w) => a + (l.includes(w) ? 1 : 0), 0);
      if (wantNum && NUM_RE.test(s)) score += 2;
      if (bundle.plan.slots.location && l.includes(bundle.plan.slots.location.toLowerCase())) score += 1.5;
      if (score > 0) scored.push({ text: s, src: it, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out: { text: string; src: EvidenceItem }[] = []; const seen = new Set<string>();
  for (const s of scored) { if (seen.has(s.text)) continue; seen.add(s.text); out.push({ text: s.text, src: s.src }); if (out.length >= n) break; }
  return out;
}

// Local-result framing per language (model-free; the brain localizes finer later).
const LOCAL_FRAME: Record<string, (place: string, thing: string) => string> = {
  it: (p, t) => `Ecco alcune opzioni per ${t}${p ? ` a ${p}` : ''}:`,
  es: (p, t) => `Aquí tienes algunas opciones para ${t}${p ? ` en ${p}` : ''}:`,
  fr: (p, t) => `Voici quelques options pour ${t}${p ? ` à ${p}` : ''} :`,
  de: (p, t) => `Hier einige Optionen für ${t}${p ? ` in ${p}` : ''}:`,
  en: (p, t) => `Here are some options for ${t}${p ? ` in ${p}` : ''}:`,
};

/** Synthesize the answer for a gathered bundle, shaped by its nature. */
export function synthesize(bundle: EvidenceBundle): Answer {
  const { plan, items } = bundle;
  const lang = plan.slots.lang;
  const cite = (xs: EvidenceItem[]) => xs.slice(0, 3).map((i) => ({ title: i.title || host(i.url), url: i.url }));

  switch (plan.nature) {
    case 'speculative': {
      // NEVER a fake fact. Ground a light, honest, playful estimate on any current
      // stat we found; otherwise be honest that it's unknowable, with a wink.
      const base = bestStat(items, plan.slots.attribute);
      const subj = plan.slots.keywords.find((w) => !['goal','goals','score','future','many','will'].includes(w)) || 'that';
      const txt = base
        ? `Nobody can actually predict the future 🔮 — but going off the numbers (currently around ${base}), at this pace you might see a good deal more before it's all said and done… and knowing ${subj}, probably one cheeky extra just to make us all argue about it. 😄`
        : `Ha — nobody can really predict that 🔮. It's anyone's guess; the honest answer is "more, until they stop," plus one for the highlight reel. If you want, I can pull the current stats and we can do the fun math together.`;
      return { nature: 'speculative', text: txt, sources: cite(items), confident: false, lang };
    }
    case 'local': {
      const frame = (LOCAL_FRAME[lang] || LOCAL_FRAME.en);
      const thing = plan.slots.keywords.filter((w) => w !== (plan.slots.location || '').toLowerCase()).slice(0, 2).join(' ') || 'this';
      const picks = items.filter((i) => i.title).slice(0, 5);
      const list = picks.map((p) => `• ${p.title}${p.url ? ` — ${host(p.url)}` : ''}`).join('\n');
      const txt = picks.length ? `${frame(plan.slots.location || '', thing)}\n${list}` : `${frame(plan.slots.location || '', thing)}\n(— couldn't reach local listings just now; try a maps search for the freshest results.)`;
      return { nature: 'local', text: txt, sources: cite(picks), confident: picks.length > 0, lang };
    }
    default: {
      // Factual / explain / compare / list / procedural — extractive, SHORT, cited.
      const best = bestSentences(bundle, plan.nature === 'explain' || plan.nature === 'compare' ? 3 : 2);
      if (!bundle.foundTarget && plan.slots.attribute && !best.length) {
        return { nature: plan.nature, text: `I couldn't confirm a precise ${plan.slots.attribute}${plan.slots.location ? ` for ${plan.slots.location}` : ''} from the sources just now — I'd rather not guess a number. I can dig into a specific official page if you name one.`, sources: cite(items), confident: false, lang };
      }
      const txt = best.map((b) => b.text).join(' ') || (items[0]?.text ? trimToWords(items[0].text, 40) : 'No clear answer found in the sources.');
      return { nature: plan.nature, text: txt, sources: cite(best.map((b) => b.src)), confident: bundle.foundTarget, lang };
    }
  }
}

function trimToWords(s: string, n: number): string { const w = (s || '').replace(/\s+/g, ' ').trim().split(' '); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' ') + '…'; }

/** Full art-of-search: plan → gather (multi-hop) → synthesize (register-aware). */
export async function answer(question: string): Promise<Answer> {
  return synthesize(await research(question));
}
