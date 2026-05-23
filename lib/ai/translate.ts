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
const ISO3: Record<string, string> = {
  ar: 'ara', th: 'tha', fr: 'fra', es: 'spa', de: 'deu', it: 'ita', pt: 'por',
  ru: 'rus', zh: 'zho', ja: 'jpn', ko: 'kor', hi: 'hin', tr: 'tur', nl: 'nld',
  pl: 'pol', uk: 'ukr', fa: 'fas', he: 'heb', el: 'ell', vi: 'vie', id: 'ind',
  sv: 'swe', cs: 'ces', ro: 'ron', hu: 'hun', fi: 'fin', da: 'dan', no: 'nor',
};

// Unicode script ranges → a likely language, for detection without a model.
// Approximate (Cyrillic≈ru, Han≈zh) but reliable enough to pick the out-model;
// the browser detector is preferred when present.
const SCRIPT: [RegExp, string][] = [
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

  // 2) Script heuristic — only fires for non-Latin scripts (high confidence).
  for (const [re, lang] of SCRIPT) if (re.test(t)) return lang;
  return null; // Latin text with no detector → treat as English
}

// --- browser Translator API ------------------------------------------------

async function browserTranslate(text: string, from: string, to: string): Promise<string | null> {
  if (!hasBrowser('Translator')) return null;
  try {
    const T = (self as any).Translator;
    const opts = { sourceLanguage: from, targetLanguage: to };
    const avail = await T.availability?.(opts);
    if (!avail || avail === 'unavailable') return null;
    const tr = await T.create(opts); // 'downloadable' → browser fetches its own pack
    const out = await tr.translate(text);
    return typeof out === 'string' && out.trim() ? out : null;
  } catch { return null; }
}

// --- Opus-MT (transformers.js) fallback ------------------------------------

type Translator = (text: string, opts?: Record<string, unknown>) => Promise<Array<{ translation_text: string }>>;
const pipes = new Map<string, Promise<Translator | null>>();

async function opusPipe(modelId: string): Promise<Translator | null> {
  if (!pipes.has(modelId)) {
    pipes.set(modelId, (async () => {
      try {
        const lib = await import('@xenova/transformers');
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        const { configureOnnxRuntime } = await import('@/lib/compute/concurrency');
        configureOnnxRuntime(lib);
        const pipe = await lib.pipeline('translation', `Xenova/${modelId}`, { quantized: true });
        return pipe as unknown as Translator;
      } catch { return null; }
    })());
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

/** Translate `text` from→to (BCP-47). Browser API first, then Opus-MT. */
export async function translate(text: string, from: string, to: string): Promise<string | null> {
  const t = text.trim();
  if (!t || from === to) return null;
  const viaBrowser = await browserTranslate(t, from, to);
  if (viaBrowser) return viaBrowser;
  if (to === 'en') return opusToEnglish(t, from);
  if (from === 'en') return opusFromEnglish(t, to);
  // Arbitrary pair: pivot through English so we only need en↔x models.
  const en = await opusToEnglish(t, from);
  return en ? opusFromEnglish(en, to) : null;
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
