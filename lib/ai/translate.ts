/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Xonvert AI — on-device translation, to help the weak 0.5B model with other
 * languages. Same shape as the AI engine itself (WebGPU fast path + WASM
 * fallback): one interface, best-available engine underneath, loaded ONLY when
 * a non-English language is actually used — never by default.
 *
 *   user's language ──translate→EN──▶ router / tools / web-search (all English)
 *                                          │
 *   user's language ◀──translate←EN──────── English result
 *
 * So Qwen never has to be good at Arabic/Thai/etc. — it works in its strong
 * language while the user sees theirs.
 *
 * Engines, in order of preference:
 *   1. Browser built-in Translator/LanguageDetector API — FREE, zero download
 *      (Chrome/Edge desktop, some Android). Nothing leaves the device.
 *   2. Opus-MT via transformers.js — the universal fallback that runs the same
 *      everywhere incl. iOS Safari / Firefox. Open models streamed free from the
 *      HuggingFace CDN (no Xonvert server) and cached in IndexedDB after first
 *      use. `opus-mt-mul-en` understands ~any language; per-language `en-xx`
 *      models (with `en-mul` as catch-all) translate replies back.
 *
 * Everything degrades gracefully: no engine / unsupported language → returns
 * null and the caller keeps the English text.
 */

// BCP-47 (2-letter) → ISO-639-3 token used by the Opus `en-mul` multi-model.
// NOTE: these must be the tokens the opus-mt-en-mul model actually supports —
// for some languages that's NOT the plain ISO-639-3 code (Persian is `pes`, the
// Western-Farsi variant, not `fas`; Chinese is the script variant).
const ISO3: Record<string, string> = {
  ar: 'ara', th: 'tha', fr: 'fra', es: 'spa', de: 'deu', it: 'ita', pt: 'por',
  ru: 'rus', zh: 'cmn_Hans', ja: 'jpn', ko: 'kor', hi: 'hin', tr: 'tur', nl: 'nld',
  pl: 'pol', uk: 'ukr', fa: 'pes', he: 'heb', el: 'ell', vi: 'vie', id: 'ind',
  sv: 'swe', cs: 'ces', ro: 'ron', hu: 'hun', fi: 'fin', da: 'dan', no: 'nno',
  // extended set (en→target token for opus-mt-en-mul; pivots through English).
  bg: 'bul', hr: 'hrv', sr: 'srp', sk: 'slk', sl: 'slv', lt: 'lit', lv: 'lav',
  et: 'est', is: 'isl', ca: 'cat', gl: 'glg', sq: 'sqi', mk: 'mkd', af: 'afr',
  sw: 'swh', ms: 'msa', tl: 'tgl', bn: 'ben', ta: 'tam', te: 'tel', ur: 'urd',
  mr: 'mar', gu: 'guj', pa: 'pan', ml: 'mal', kn: 'kan', hy: 'hye', ka: 'kat',
  az: 'aze', kk: 'kaz',
};

// Unicode script ranges → a likely language, for detection without a model.
// Approximate (Cyrillic≈ru, Han≈zh) but reliable enough to pick the out-model;
// the browser detector is preferred when present.
const SCRIPT: [RegExp, string][] = [
  [/[پچژگکیۀ]/, 'fa'],         // Persian-specific letters (Arabic script) — check first
  [/[؀-ۿݐ-ݿ]/, 'ar'],
  [/[฀-๿]/, 'th'],
  [/[぀-ヿ]/, 'ja'],          // kana → Japanese (check before Han)
  [/[가-힯]/, 'ko'],
  [/[一-鿿]/, 'zh'],
  [/[Ѐ-ӿ]/, 'ru'],
  [/[֐-׿]/, 'he'],
  [/[Ͱ-Ͽ]/, 'el'],
  [/[ऀ-ॿ]/, 'hi'],
];

function hasBrowser(name: 'Translator' | 'LanguageDetector'): boolean {
  return typeof self !== 'undefined' && name in self;
}

// Latin-script languages look like English to the script heuristic, and the browser
// LanguageDetector isn't always present (headless, Firefox/Safari, older Chrome). So
// detect the big European languages by their DISTINCTIVE function words + diacritics
// (model-free). Require ≥2 signals so plain English ("why is the sky blue") is never
// misread as foreign. This is what makes "warum ist der himmel blau" / "quelle est la
// capitale du japon" actually get translated instead of flowing through raw.
// Unicode-aware word boundary (JS \b breaks on accented letters like "où", so
// accented function words would never match) — letter/number lookarounds instead.
const B = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'giu');
// The word lists lean on HIGH-FREQUENCY, DISTINCTIVE markers that don't collide
// with English: articulated prepositions (Italian nella/nel/della/sulla, French
// du/des/au), common verbs, and demonstratives. Breadth here is what lets ANY
// phrasing be detected — not just the textbook example sentence. Each tuple may
// carry a WEIGHT (default 1); the score must reach ≥2 to override "English".
const LATIN_SIG: [string, RegExp, number?][] = [
  // Weight-1 declaratives — must NOT collide with common English words (so e.g.
  // German "die"/"was", Italian "fare", Spanish "capital" are deliberately absent;
  // they'd misread plain English). Diacritics are free, unambiguous signals.
  ['de', /[äöüß]/giu], ['de', B('der|das|und|ist|nicht|wie|wer|ich|möchte|eine?|mit|auf|für|wieviel|viele|hauptstadt|kaufen|wird|werden|sind|haben|gibt|kann|mehr|auch|sehr|dieser|diese|dieses|diesen')],
  ['fr', /[œ]/giu], ['fr', B("le|la|les|est|qui|pour|avec|dans|une|vous|c'est|qu'est|je|du|des|au|aux|acheter|sera|seront|cette|ces|aussi|très|sont")],
  ['es', /[ñ¿¡]/giu], ['es', B('el|los|las|una|por|quiero|está|están|para|del|comprar|este|esta|estos|será|serán|también|muy|sobre|su|sus|mis?|tus?|nuestr\\w*')],
  ['it', B('il|lo|gli|che|di|del|dei|dal|dalla|coi|col|vorrei|sono|della|dello|degli|delle|sulla|sullo|nella|nel|nello|nelle|negli|nei|alla|allo|alle|agli|per|una|comprare|più|anche|molto|questo|questa|questi|sarà|saranno|dove')],
  ['pt', /[ãõ]/giu], ['pt', B('você|não|são|está|estão|quero|uma|dos|das|para|comprar|este|esta|será|serão|também|muito|fazer|sobre')],
  // STRONG interrogatives — alone they're decisive (no English collision), so each
  // carries weight 2 to clear the ≥2 bar even in a short one-cue question
  // ("cuántos goles marcará Messi", "quanti gol segnerà Ronaldo"). These drive the
  // headline cross-lingual asks (how-many/why/where/which) regardless of phrasing.
  // Excluded for English collisions: fr "comment"/"quelle"(→quell), it "dove" (kept
  // at weight 1 above), de "wo".
  ['de', B('warum|wieso|weshalb'), 2],
  ['fr', B('pourquoi|combien|où|quels|quelles'), 2],
  ['es', B('qué|cómo|dónde|cuál|cuáles|cuántos?|cuántas?|cuánto|cuánta|por qué'), 2],
  ['it', B('perché|quanti|quanto|quanta|quante|quale|quali'), 2],
  ['pt', B('porque|por que|onde|quantos?|quantas?|quanto'), 2],
];
function latinHeuristic(text: string): string | null {
  const low = ' ' + text.toLowerCase() + ' ';
  const score: Record<string, number> = {};
  for (const [lang, re, w = 1] of LATIN_SIG) {
    const n = (low.match(re) || []).length;
    if (n) score[lang] = (score[lang] || 0) + n * w;
  }
  let best: string | null = null, bestN = 0;
  for (const [lang, n] of Object.entries(score)) if (n > bestN) { bestN = n; best = lang; }
  return bestN >= 2 ? best : null; // ≥2 weighted signals to override "English"
}

// --- detection -------------------------------------------------------------

/**
 * Detect the language of `text` as a BCP-47 code, or null when it looks like
 * English / can't be told. Prefers the browser's Language Detector; otherwise a
 * script heuristic (covers the non-Latin languages where this matters most).
 */
export async function detectLanguage(text: string): Promise<string | null> {
  const t = text.trim();
  if (t.length < 2) return null;

  // 1) Browser Language Detector (Chrome/Edge) — accurate, incl. Latin scripts.
  if (hasBrowser('LanguageDetector')) {
    try {
      const LD = (self as any).LanguageDetector;
      const avail = await LD.availability?.();
      if (avail && avail !== 'unavailable') {
        const det = await LD.create();
        const res = await det.detect(t);
        const top = res?.[0];
        if (top && top.detectedLanguage && top.confidence > 0.5) {
          const code = String(top.detectedLanguage).split('-')[0];
          return code === 'en' ? null : code;
        }
      }
    } catch { /* fall through */ }
  }

  // 2) Script heuristic — non-Latin scripts (high confidence).
  for (const [re, lang] of SCRIPT) if (re.test(t)) return lang;
  // 3) Latin-script function-word signature (de/fr/es/it/pt) — so European
  //    languages are translated even with no browser detector.
  return latinHeuristic(t);
}

// --- browser Translator API ------------------------------------------------

async function browserTranslate(text: string, from: string, to: string): Promise<string | null> {
  const opts = { sourceLanguage: from, targetLanguage: to };
  // The on-device translation API has shipped under several shapes across Chrome
  // versions — try each so it engages wherever it exists, not only the newest.
  try {
    // 1) Current global: Translator.availability() / Translator.create().
    const T = typeof self !== 'undefined' ? (self as any).Translator : undefined;
    if (T?.create) {
      const avail = await T.availability?.(opts).catch(() => 'available');
      if (avail !== 'unavailable') {
        const tr = await T.create(opts);
        const out = await tr.translate(text);
        if (typeof out === 'string' && out.trim()) return out;
      }
    }
  } catch { /* try next shape */ }
  try {
    // 2) Legacy origin-trial: self.translation.canTranslate / createTranslator,
    //    also exposed as self.ai.translator on some builds.
    const legacy = typeof self !== 'undefined' ? ((self as any).translation ?? (self as any).ai?.translator) : undefined;
    if (legacy?.createTranslator) {
      const can = await legacy.canTranslate?.(opts).catch(() => 'readily');
      if (can && can !== 'no') {
        const tr = await legacy.createTranslator(opts);
        const out = await tr.translate(text);
        if (typeof out === 'string' && out.trim()) return out;
      }
    }
  } catch { /* fall through to Opus */ }
  return null;
}

// --- Opus-MT (transformers.js) fallback ------------------------------------

type Translator = (text: string, opts?: Record<string, unknown>) => Promise<Array<{ translation_text: string }>>;
const pipes = new Map<string, Promise<Translator | null>>();

async function opusPipe(modelId: string): Promise<Translator | null> {
  if (!pipes.has(modelId)) {
    const p = (async () => {
      try {
        const lib = await import('@xenova/transformers');
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        const { configureOnnxRuntime } = await import('@/lib/compute/concurrency');
        configureOnnxRuntime(lib);
        const pipe = await lib.pipeline('translation', `Xenova/${modelId}`, { quantized: true });
        return pipe as unknown as Translator;
      } catch { return null; }
    })();
    pipes.set(modelId, p);
    // If the model couldn't load (network blip, missing per-language model,
    // out of memory on a small device), drop the cache entry so we don't
    // permanently disable translation for this pair — next call retries.
    // Previously the user got "Translation unavailable" for the rest of the
    // session even after the network recovered.
    p.then((v) => { if (v == null) pipes.delete(modelId); })
     .catch(() => { pipes.delete(modelId); });
  }
  return pipes.get(modelId)!;
}

async function opusRun(modelId: string, text: string): Promise<string | null> {
  const pipe = await opusPipe(modelId);
  if (!pipe) return null;
  try {
    const out = await pipe(text, { max_length: 512 });
    const res = out?.[0]?.translation_text;
    return res && res.trim() ? res : null;
  } catch { return null; }
}

/** Opus inbound (any language → English): per-language model, else multi. */
async function opusToEnglish(text: string, from: string): Promise<string | null> {
  return (await opusRun(`opus-mt-${from}-en`, text)) ?? (await opusRun('opus-mt-mul-en', text));
}

/** Opus outbound (English → target): per-language model, else multi w/ token. */
async function opusFromEnglish(text: string, to: string): Promise<string | null> {
  const direct = await opusRun(`opus-mt-en-${to}`, text);
  if (direct) return direct;
  const iso3 = ISO3[to];
  return iso3 ? opusRun('opus-mt-en-mul', `>>${iso3}<< ${text}`) : null;
}

// --- public API ------------------------------------------------------------

/** Translate `text` from→to (BCP-47). Order: built-in API (private, 0 download)
 *  → Bergamot (on-device, ~5MB wasm + light per-pair models) → Opus-MT (heavier,
 *  broadest coverage, offline once cached). All on-device — no third party. */
export async function translate(text: string, from: string, to: string): Promise<string | null> {
  const t = text.trim();
  if (!t || from === to) return null;
  const viaBrowser = await browserTranslate(t, from, to);
  if (viaBrowser) return viaBrowser;
  // On-device Bergamot before the heavier Opus models: ~4× lighter for the
  // languages it covers; Opus remains the fallback for the rest.
  const { bergamotTranslate } = await import('./bergamot');
  const viaBergamot = await bergamotTranslate(t, from, to).catch(() => null);
  if (viaBergamot) return viaBergamot;
  if (to === 'en') return opusToEnglish(t, from);
  if (from === 'en') return opusFromEnglish(t, to);
  // Arbitrary pair (e.g. ar→fa): pivot through English, but use the BEST engine
  // available at EACH hop — not Opus-only. On Chrome this routes ar→en and en→fa
  // through the browser's on-device model (good) instead of collapsing the whole
  // pivot onto Opus-MT (whose Persian/Arabic output is archaic + error-compounded).
  // Recursing through translate() re-runs the full cascade for each hop; the
  // recursive calls hit the to==='en' / from==='en' branches, so no infinite loop.
  const en = await translate(t, from, 'en');
  if (!en) return null;
  return translate(en, 'en', to);
}

/** Detect + translate to English. Returns the English text and source language. */
export async function toEnglish(text: string): Promise<{ text: string; lang: string } | null> {
  const lang = await detectLanguage(text);
  if (!lang) return null; // already English / unknown
  const en = await translate(text, lang, 'en');
  return en ? { text: en, lang } : { text, lang }; // keep original if MT failed
}

/** Translate English text back into `lang` (no-op for English). */
export async function fromEnglish(text: string, lang: string): Promise<string | null> {
  if (!lang || lang === 'en') return null;
  return translate(text, 'en', lang);
}
