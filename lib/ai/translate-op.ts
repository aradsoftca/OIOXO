/**
 * Xonvert AI — text translation op.
 *
 * The app already has a translation engine (lib/ai/translate) used internally
 * for multilingual routing. This exposes it as a user capability — "translate
 * this to Spanish" — which previously mis-routed to a CSS-transform tool (it
 * matched the word "translate"). Pure parsing here; the engine call (browser
 * Translator API / Opus-MT) happens in AiApp.
 */

import { extractOperand } from './text-ops';

// Language name → BCP-47 code. Common languages; extend freely.
const LANGS: Record<string, string> = {
  english: 'en', spanish: 'es', 'español': 'es', french: 'fr', 'français': 'fr',
  german: 'de', deutsch: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl',
  russian: 'ru', chinese: 'zh', mandarin: 'zh', japanese: 'ja', korean: 'ko',
  arabic: 'ar', hindi: 'hi', turkish: 'tr', persian: 'fa', farsi: 'fa',
  polish: 'pl', swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi',
  greek: 'el', hebrew: 'he', thai: 'th', vietnamese: 'vi', indonesian: 'id',
  ukrainian: 'uk', czech: 'cs', romanian: 'ro', hungarian: 'hu',
};

const TRANSLATE_RE = /\btranslat(e|ion)\b/i;

export interface TranslateReq { to: string; toName: string; operand: string; }

/** Parse "translate <text> to <language>" into a target language + the text. */
export function detectTranslate(text: string): TranslateReq | null {
  if (!TRANSLATE_RE.test(text)) return null;
  // Find the target language named anywhere in the request.
  let to = '', toName = '';
  for (const [name, code] of Object.entries(LANGS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) { to = code; toName = name; break; }
  }
  if (!to) return null;
  // The text to translate: after a colon / in quotes / a pasted block, else the
  // words between "translate" and "to <lang>".
  let operand = extractOperand(text);
  if (!operand) {
    const m = text.match(/\btranslate\b\s+(.*?)\s+\b(?:in|to|into)\b/i);
    if (m && m[1] && !/^(this|that|it|the (text|following)|my (text|message))$/i.test(m[1].trim())) operand = m[1].trim();
  }
  return { to, toName: toName.charAt(0).toUpperCase() + toName.slice(1), operand: operand ?? '' };
}
