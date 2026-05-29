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
  if (/\b(je veux|acheter|où|meilleur|prix|comment|combien)\b/.test(l)) return 'fr';
  if (/\b(ich möchte|kaufen|wo|beste|preis|wie|wie viel)\b/.test(l)) return 'de';
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
    if (raw.length >= 2 && !STOP.has(raw)) out.push(raw);
  }
  return Array.from(new Set(out));
}

// ── nature cues (multilingual) ────────────────────────────────────────────────
const FUTURE_RE = /\b(will|going to|gonna|future|predict|forecast|by 20[2-9]\d|in 20[3-9]\d|next (year|decade)|in the future)\b|آینده|در آینده|خواهد|futuro|avenir|zukunft/i;
const SPEC_RE = /\b(how many .* (will|going to)|what will|how will|when will|do you think .* will|predict|chance(s)? (of|that)|odds)\b/i;
const LOCAL_RE = /\b(buy|purchase|shop|store|near me|nearby|where can i (buy|get|find)|rent|hire)\b|\b(vorrei comprare|comprare|negozio|quiero comprar|comprar|acheter|kaufen)\b|بخرم|خرید/i;
const PROC_RE = /^\s*(how to|how do i|how can i|steps to)\b|چگونه|چطور|come (posso|si fa)|cómo|comment (faire|je)/i;
const COMPARE_RE = /\b(vs\.?|versus|difference between|compared? to|which is better|better than)\b/i;
const EXPLAIN_RE = /^\s*(why|how does|how do|how is)\b|چرا|perché|por qué|pourquoi|warum/i;
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
  const location = extractLocation(q);
  const attribute = extractAttribute(q);
  const future = FUTURE_RE.test(q);
  const kw = keywords(q);
  const slots: Slots = { lang, location, future, entity: kw[0] ?? null, attribute, keywords: kw };

  // Order matters: speculative-future BEFORE factual (it looks like a fact ask but isn't),
  // local BEFORE factual (commerce intent), then the rest.
  let nature: Nature;
  if ((future && SPEC_RE.test(q)) || (future && /\b(how many|how much|when|score|win|reach)\b/i.test(q))) nature = 'speculative';
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
      queries.push(`how to ${core}`, `${core} steps`);
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
