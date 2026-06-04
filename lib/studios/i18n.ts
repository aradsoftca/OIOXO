export type Script =
  | 'latin' | 'cyrillic' | 'greek' | 'armenian' | 'georgian'
  | 'arabic' | 'hebrew' | 'syriac' | 'thaana'
  | 'devanagari' | 'bengali' | 'gurmukhi' | 'gujarati' | 'oriya'
  | 'tamil' | 'telugu' | 'kannada' | 'malayalam' | 'sinhala'
  | 'thai' | 'lao' | 'khmer' | 'myanmar' | 'tibetan'
  | 'cjk' | 'hangul' | 'hiragana' | 'katakana'
  | 'mongolian' | 'ethiopic';

const SCRIPT_RANGES: Array<[Script, number, number]> = [
  ['latin',     0x0000, 0x024F],
  ['cyrillic',  0x0400, 0x04FF],
  ['greek',     0x0370, 0x03FF],
  ['armenian',  0x0530, 0x058F],
  ['hebrew',    0x0590, 0x05FF],
  ['arabic',    0x0600, 0x06FF],
  ['arabic',    0x0750, 0x077F],
  ['arabic',    0xFB50, 0xFDFF],
  ['arabic',    0xFE70, 0xFEFF],
  ['syriac',    0x0700, 0x074F],
  ['thaana',    0x0780, 0x07BF],
  ['devanagari',0x0900, 0x097F],
  ['bengali',   0x0980, 0x09FF],
  ['gurmukhi',  0x0A00, 0x0A7F],
  ['gujarati',  0x0A80, 0x0AFF],
  ['oriya',     0x0B00, 0x0B7F],
  ['tamil',     0x0B80, 0x0BFF],
  ['telugu',    0x0C00, 0x0C7F],
  ['kannada',   0x0C80, 0x0CFF],
  ['malayalam', 0x0D00, 0x0D7F],
  ['sinhala',   0x0D80, 0x0DFF],
  ['thai',      0x0E00, 0x0E7F],
  ['lao',       0x0E80, 0x0EFF],
  ['tibetan',   0x0F00, 0x0FFF],
  ['myanmar',   0x1000, 0x109F],
  ['georgian',  0x10A0, 0x10FF],
  ['ethiopic',  0x1200, 0x137F],
  ['khmer',     0x1780, 0x17FF],
  ['mongolian', 0x1800, 0x18AF],
  ['hangul',    0xAC00, 0xD7AF],
  ['hangul',    0x1100, 0x11FF],
  ['hiragana',  0x3040, 0x309F],
  ['katakana',  0x30A0, 0x30FF],
  ['cjk',       0x4E00, 0x9FFF],
  ['cjk',       0x3400, 0x4DBF],
  ['cjk',       0x20000, 0x2A6DF],
  ['cjk',       0xF900, 0xFAFF],
];

const RTL_SCRIPTS = new Set<Script>(['arabic', 'hebrew', 'syriac', 'thaana']);

const SCRIPT_FONTS: Record<Script, string> = {
  latin:     'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  cyrillic:  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  greek:     'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  armenian:  '"Noto Sans Armenian", system-ui, sans-serif',
  georgian:  '"Noto Sans Georgian", system-ui, sans-serif',
  arabic:    '"Segoe UI", "Tahoma", "Arial", "Noto Sans Arabic", sans-serif',
  hebrew:    '"Segoe UI", "Tahoma", "Arial Hebrew", "Noto Sans Hebrew", sans-serif',
  syriac:    '"Noto Sans Syriac", system-ui, sans-serif',
  thaana:    '"Noto Sans Thaana", system-ui, sans-serif',
  devanagari:'"Noto Sans Devanagari", "Mangal", system-ui, sans-serif',
  bengali:   '"Noto Sans Bengali", "Vrinda", system-ui, sans-serif',
  gurmukhi:  '"Noto Sans Gurmukhi", "Raavi", system-ui, sans-serif',
  gujarati:  '"Noto Sans Gujarati", "Shruti", system-ui, sans-serif',
  oriya:     '"Noto Sans Oriya", system-ui, sans-serif',
  tamil:     '"Noto Sans Tamil", "Latha", system-ui, sans-serif',
  telugu:    '"Noto Sans Telugu", "Gautami", system-ui, sans-serif',
  kannada:   '"Noto Sans Kannada", "Tunga", system-ui, sans-serif',
  malayalam: '"Noto Sans Malayalam", "Kartika", system-ui, sans-serif',
  sinhala:   '"Noto Sans Sinhala", system-ui, sans-serif',
  thai:      '"Noto Sans Thai", "Tahoma", system-ui, sans-serif',
  lao:       '"Noto Sans Lao", "DokChampa", system-ui, sans-serif',
  khmer:     '"Noto Sans Khmer", "DaunPenh", system-ui, sans-serif',
  myanmar:   '"Noto Sans Myanmar", "Padauk", system-ui, sans-serif',
  tibetan:   '"Noto Sans Tibetan", "Microsoft Himalaya", system-ui, sans-serif',
  cjk:       '"PingFang SC", "Microsoft YaHei", "SimSun", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif',
  hangul:    '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif',
  hiragana:  '"Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", sans-serif',
  katakana:  '"Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", sans-serif',
  mongolian: '"Noto Sans Mongolian", system-ui, sans-serif',
  ethiopic:  '"Noto Sans Ethiopic", "Nyala", system-ui, sans-serif',
};

export function detectScript(text: string): Script {
  if (!text) return 'latin';
  const counts: Partial<Record<Script, number>> = {};
  let inspected = 0;
  const sampleSize = Math.min(text.length, 1024);
  for (let i = 0; i < sampleSize; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      code = 0x10000 + (code - 0xD800) * 0x400 + (low - 0xDC00);
      i++;
    }
    if (code < 0x80 && /\s/.test(text[i])) continue;
    for (const [script, start, end] of SCRIPT_RANGES) {
      if (code >= start && code <= end) {
        counts[script] = (counts[script] ?? 0) + 1;
        inspected++;
        break;
      }
    }
  }
  if (!inspected) return 'latin';
  let best: Script = 'latin'; let bestN = 0;
  for (const [s, n] of Object.entries(counts) as [Script, number][]) {
    if (n > bestN) { bestN = n; best = s; }
  }
  return best;
}

export function isRtlScript(s: Script): boolean { return RTL_SCRIPTS.has(s); }

export function directionForText(text: string): 'ltr' | 'rtl' {
  return isRtlScript(detectScript(text)) ? 'rtl' : 'ltr';
}

export function fontStackForScript(s: Script): string { return SCRIPT_FONTS[s] ?? SCRIPT_FONTS.latin; }

export function fontStackForText(text: string): string {
  return fontStackForScript(detectScript(text));
}

export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  script: Script;
}

export const LOCALES: LocaleInfo[] = [
  { code: 'en-US', name: 'English (US)',       nativeName: 'English',    direction: 'ltr', script: 'latin' },
  { code: 'en-GB', name: 'English (UK)',       nativeName: 'English',    direction: 'ltr', script: 'latin' },
  { code: 'es-ES', name: 'Spanish',            nativeName: 'Español',    direction: 'ltr', script: 'latin' },
  { code: 'es-MX', name: 'Spanish (Mexico)',   nativeName: 'Español',    direction: 'ltr', script: 'latin' },
  { code: 'fr-FR', name: 'French',             nativeName: 'Français',   direction: 'ltr', script: 'latin' },
  { code: 'de-DE', name: 'German',             nativeName: 'Deutsch',    direction: 'ltr', script: 'latin' },
  { code: 'it-IT', name: 'Italian',            nativeName: 'Italiano',   direction: 'ltr', script: 'latin' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)',nativeName: 'Português',  direction: 'ltr', script: 'latin' },
  { code: 'pt-PT', name: 'Portuguese',         nativeName: 'Português',  direction: 'ltr', script: 'latin' },
  { code: 'nl-NL', name: 'Dutch',              nativeName: 'Nederlands', direction: 'ltr', script: 'latin' },
  { code: 'pl-PL', name: 'Polish',             nativeName: 'Polski',     direction: 'ltr', script: 'latin' },
  { code: 'tr-TR', name: 'Turkish',            nativeName: 'Türkçe',     direction: 'ltr', script: 'latin' },
  { code: 'sv-SE', name: 'Swedish',            nativeName: 'Svenska',    direction: 'ltr', script: 'latin' },
  { code: 'da-DK', name: 'Danish',             nativeName: 'Dansk',      direction: 'ltr', script: 'latin' },
  { code: 'no-NO', name: 'Norwegian',          nativeName: 'Norsk',      direction: 'ltr', script: 'latin' },
  { code: 'fi-FI', name: 'Finnish',            nativeName: 'Suomi',      direction: 'ltr', script: 'latin' },
  { code: 'cs-CZ', name: 'Czech',              nativeName: 'Čeština',    direction: 'ltr', script: 'latin' },
  { code: 'hu-HU', name: 'Hungarian',          nativeName: 'Magyar',     direction: 'ltr', script: 'latin' },
  { code: 'el-GR', name: 'Greek',              nativeName: 'Ελληνικά',   direction: 'ltr', script: 'greek' },
  { code: 'ru-RU', name: 'Russian',            nativeName: 'Русский',    direction: 'ltr', script: 'cyrillic' },
  { code: 'uk-UA', name: 'Ukrainian',          nativeName: 'Українська', direction: 'ltr', script: 'cyrillic' },
  { code: 'bg-BG', name: 'Bulgarian',          nativeName: 'Български',  direction: 'ltr', script: 'cyrillic' },
  { code: 'sr-RS', name: 'Serbian',            nativeName: 'Српски',     direction: 'ltr', script: 'cyrillic' },
  { code: 'ar-SA', name: 'Arabic (Saudi)',     nativeName: 'العربية',     direction: 'rtl', script: 'arabic' },
  { code: 'ar-EG', name: 'Arabic (Egypt)',     nativeName: 'العربية',     direction: 'rtl', script: 'arabic' },
  { code: 'fa-IR', name: 'Persian',            nativeName: 'فارسی',      direction: 'rtl', script: 'arabic' },
  { code: 'ur-PK', name: 'Urdu',               nativeName: 'اردو',        direction: 'rtl', script: 'arabic' },
  { code: 'he-IL', name: 'Hebrew',             nativeName: 'עברית',       direction: 'rtl', script: 'hebrew' },
  { code: 'hi-IN', name: 'Hindi',              nativeName: 'हिन्दी',     direction: 'ltr', script: 'devanagari' },
  { code: 'mr-IN', name: 'Marathi',            nativeName: 'मराठी',       direction: 'ltr', script: 'devanagari' },
  { code: 'ne-NP', name: 'Nepali',             nativeName: 'नेपाली',     direction: 'ltr', script: 'devanagari' },
  { code: 'bn-IN', name: 'Bengali',            nativeName: 'বাংলা',       direction: 'ltr', script: 'bengali' },
  { code: 'pa-IN', name: 'Punjabi',            nativeName: 'ਪੰਜਾਬੀ',     direction: 'ltr', script: 'gurmukhi' },
  { code: 'gu-IN', name: 'Gujarati',           nativeName: 'ગુજરાતી',    direction: 'ltr', script: 'gujarati' },
  { code: 'ta-IN', name: 'Tamil',              nativeName: 'தமிழ்',      direction: 'ltr', script: 'tamil' },
  { code: 'te-IN', name: 'Telugu',             nativeName: 'తెలుగు',     direction: 'ltr', script: 'telugu' },
  { code: 'kn-IN', name: 'Kannada',            nativeName: 'ಕನ್ನಡ',      direction: 'ltr', script: 'kannada' },
  { code: 'ml-IN', name: 'Malayalam',          nativeName: 'മലയാളം',    direction: 'ltr', script: 'malayalam' },
  { code: 'si-LK', name: 'Sinhala',            nativeName: 'සිංහල',       direction: 'ltr', script: 'sinhala' },
  { code: 'th-TH', name: 'Thai',               nativeName: 'ไทย',         direction: 'ltr', script: 'thai' },
  { code: 'lo-LA', name: 'Lao',                nativeName: 'ລາວ',         direction: 'ltr', script: 'lao' },
  { code: 'km-KH', name: 'Khmer',              nativeName: 'ខ្មែរ',         direction: 'ltr', script: 'khmer' },
  { code: 'my-MM', name: 'Burmese',            nativeName: 'မြန်မာ',     direction: 'ltr', script: 'myanmar' },
  { code: 'vi-VN', name: 'Vietnamese',         nativeName: 'Tiếng Việt',  direction: 'ltr', script: 'latin' },
  { code: 'id-ID', name: 'Indonesian',         nativeName: 'Indonesia',   direction: 'ltr', script: 'latin' },
  { code: 'ms-MY', name: 'Malay',              nativeName: 'Melayu',      direction: 'ltr', script: 'latin' },
  { code: 'zh-CN', name: 'Chinese (Simplified)',nativeName: '简体中文',   direction: 'ltr', script: 'cjk' },
  { code: 'zh-TW', name: 'Chinese (Traditional)',nativeName: '繁體中文',  direction: 'ltr', script: 'cjk' },
  { code: 'ja-JP', name: 'Japanese',           nativeName: '日本語',      direction: 'ltr', script: 'hiragana' },
  { code: 'ko-KR', name: 'Korean',             nativeName: '한국어',      direction: 'ltr', script: 'hangul' },
  { code: 'am-ET', name: 'Amharic',            nativeName: 'አማርኛ',       direction: 'ltr', script: 'ethiopic' },
  { code: 'mn-MN', name: 'Mongolian',          nativeName: 'Монгол',     direction: 'ltr', script: 'cyrillic' },
];

export function localeInfo(code: string): LocaleInfo {
  return LOCALES.find(l => l.code === code) ?? LOCALES[0];
}

export function formatNumber(n: number, locale: string, opts?: Intl.NumberFormatOptions): string {
  try { return new Intl.NumberFormat(locale, opts).format(n); }
  catch { return String(n); }
}

export function formatCurrency(n: number, locale: string, currency = 'USD'): string {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

export function formatPercent(n: number, locale: string, decimals = 2): string {
  try { return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n); }
  catch { return `${(n * 100).toFixed(decimals)}%`; }
}

export function formatDate(d: Date | number, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  try { return new Intl.DateTimeFormat(locale, opts).format(d); }
  catch { return new Date(d).toString(); }
}

export function formatRelative(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string): string {
  try { return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit); }
  catch { return `${value} ${unit}`; }
}

const CURRENCY_BY_LOCALE: Record<string, string> = {
  'en-US': 'USD', 'en-GB': 'GBP', 'es-ES': 'EUR', 'es-MX': 'MXN',
  'fr-FR': 'EUR', 'de-DE': 'EUR', 'it-IT': 'EUR', 'pt-BR': 'BRL', 'pt-PT': 'EUR',
  'nl-NL': 'EUR', 'pl-PL': 'PLN', 'tr-TR': 'TRY', 'sv-SE': 'SEK', 'da-DK': 'DKK',
  'no-NO': 'NOK', 'fi-FI': 'EUR', 'cs-CZ': 'CZK', 'hu-HU': 'HUF', 'el-GR': 'EUR',
  'ru-RU': 'RUB', 'uk-UA': 'UAH', 'bg-BG': 'BGN', 'sr-RS': 'RSD',
  'ar-SA': 'SAR', 'ar-EG': 'EGP', 'fa-IR': 'IRR', 'ur-PK': 'PKR', 'he-IL': 'ILS',
  'hi-IN': 'INR', 'mr-IN': 'INR', 'bn-IN': 'INR', 'pa-IN': 'INR', 'gu-IN': 'INR',
  'ta-IN': 'INR', 'te-IN': 'INR', 'kn-IN': 'INR', 'ml-IN': 'INR', 'ne-NP': 'NPR',
  'si-LK': 'LKR', 'th-TH': 'THB', 'lo-LA': 'LAK', 'km-KH': 'KHR', 'my-MM': 'MMK',
  'vi-VN': 'VND', 'id-ID': 'IDR', 'ms-MY': 'MYR',
  'zh-CN': 'CNY', 'zh-TW': 'TWD', 'ja-JP': 'JPY', 'ko-KR': 'KRW',
  'am-ET': 'ETB', 'mn-MN': 'MNT',
};

export function defaultCurrencyFor(locale: string): string {
  return CURRENCY_BY_LOCALE[locale] ?? 'USD';
}

export function langAttrFromLocale(locale: string): string {
  return locale.split('-')[0];
}

export const NEUTRAL_BIDI = '⁨';
export const POP_BIDI = '⁩';
export const RLM = '‏';
export const LRM = '‎';

export function wrapBidi(text: string, direction: 'auto' | 'ltr' | 'rtl' = 'auto'): string {
  if (direction === 'rtl') return RLM + text + RLM;
  if (direction === 'ltr') return LRM + text + LRM;
  const dir = directionForText(text);
  return dir === 'rtl' ? RLM + text + RLM : LRM + text + LRM;
}
