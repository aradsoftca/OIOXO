/**
 * Single source of truth for the languages our on-device TRANSLATION supports
 * (Translate, Document Translator, Auto-Subtitle caption translation, Auto-Dub
 * source side). Any pair works via the English pivot in lib/ai/translate.ts.
 *
 * Curated for reasonable Opus-MT / Bergamot / browser-API coverage. Lower-
 * resource entries translate rougher (gist-level) — that's expected, and the
 * engine degrades gracefully (returns the original text if a pair is unsupported).
 *
 * NOTE: text-to-speech (Voice Studio / Auto-Dub voicing) uses its OWN list
 * (TTS_LANGUAGES) bound to the available MMS voices — don't conflate the two.
 */
export interface Lang { code: string; name: string }

export const TRANSLATE_LANGUAGES: Lang[] = [
  { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' }, { code: 'zh', name: 'Chinese' }, { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' }, { code: 'ar', name: 'Arabic' }, { code: 'fa', name: 'Persian' },
  { code: 'hi', name: 'Hindi' }, { code: 'tr', name: 'Turkish' }, { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' }, { code: 'uk', name: 'Ukrainian' }, { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' }, { code: 'th', name: 'Thai' }, { code: 'he', name: 'Hebrew' },
  { code: 'el', name: 'Greek' }, { code: 'sv', name: 'Swedish' }, { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' }, { code: 'hu', name: 'Hungarian' }, { code: 'fi', name: 'Finnish' },
  { code: 'da', name: 'Danish' }, { code: 'no', name: 'Norwegian' }, { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' }, { code: 'sr', name: 'Serbian' }, { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' }, { code: 'lt', name: 'Lithuanian' }, { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' }, { code: 'is', name: 'Icelandic' }, { code: 'ca', name: 'Catalan' },
  { code: 'gl', name: 'Galician' }, { code: 'sq', name: 'Albanian' }, { code: 'mk', name: 'Macedonian' },
  { code: 'af', name: 'Afrikaans' }, { code: 'sw', name: 'Swahili' }, { code: 'ms', name: 'Malay' },
  { code: 'tl', name: 'Filipino' }, { code: 'bn', name: 'Bengali' }, { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' }, { code: 'ur', name: 'Urdu' }, { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' }, { code: 'pa', name: 'Punjabi' }, { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' }, { code: 'hy', name: 'Armenian' }, { code: 'ka', name: 'Georgian' },
  { code: 'az', name: 'Azerbaijani' }, { code: 'kk', name: 'Kazakh' },
];

export const languageName = (code: string): string =>
  TRANSLATE_LANGUAGES.find((l) => l.code === code)?.name ?? code;

/**
 * Map our 2-letter translate codes → Tesseract OCR model codes (ISO-639-3),
 * so OCR reads a scanned document in its OWN language (far more accurate than
 * defaulting to English). Only codes Tesseract ships a model for are listed.
 */
const TESS: Record<string, string> = {
  en: 'eng', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', ru: 'rus',
  zh: 'chi_sim', ja: 'jpn', ko: 'kor', ar: 'ara', fa: 'fas', hi: 'hin', tr: 'tur',
  nl: 'nld', pl: 'pol', uk: 'ukr', vi: 'vie', th: 'tha', he: 'heb', el: 'ell',
  sv: 'swe', cs: 'ces', ro: 'ron', hu: 'hun', fi: 'fin', da: 'dan', no: 'nor',
  bg: 'bul', hr: 'hrv', sr: 'srp', sk: 'slk', sl: 'slv', lt: 'lit', lv: 'lav',
  et: 'est', is: 'isl', ca: 'cat', gl: 'glg', sq: 'sqi', mk: 'mkd', af: 'afr',
  sw: 'swa', ms: 'msa', tl: 'tgl', bn: 'ben', ta: 'tam', te: 'tel', ur: 'urd',
  mr: 'mar', gu: 'guj', pa: 'pan', ml: 'mal', kn: 'kan', hy: 'hye', ka: 'kat',
  az: 'aze', kk: 'kaz',
};

/** Tesseract model code for a translate language code; 'eng' fallback. */
export const ocrLangFor = (code?: string): string =>
  (code && code !== 'auto' && TESS[code]) || 'eng';
