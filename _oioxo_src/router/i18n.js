/**
 * Multilingual query normaliser. When the rewriter flags a non-English
 * language, this module attempts to swap the query through the on-device
 * translate skill so the rest of the pipeline (which is English-shaped)
 * can still match patterns.
 *
 * Strategy:
 *   1. If language === 'en' → no-op, return original.
 *   2. If the translate skill is loaded → translate to English, mark the
 *      envelope with `translated: { from, originalLang, original }`.
 *   3. If the translate skill isn't loaded → return original; downstream
 *      relies on the fact that file extensions, ISO codes, app slugs, and
 *      tool names are language-neutral (so even Spanish "convertir mp4 a
 *      avi" still pattern-matches the conversion stage).
 *
 * Exposes window.oioxoI18n = { normalize, localizeIntent }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoI18n) return;

  // Languages we know the translate skill supports for `to-English`.
  const SUPPORTED = new Set([
    'es','fr','de','it','pt','nl','sv','da','no','fi','pl','ru','uk','cs',
    'el','ro','hu','tr','ar','he','fa','hi','bn','ta','ja','ko','zh','th','vi',
  ]);

  function isAvailable(){
    return !!(window.oioxoSkills && window.oioxoSkills.translate && typeof window.oioxoSkills.translate.translate === 'function');
  }

  /** Translate to English. Memoised by the skill itself for 24h. */
  async function normalize(query, language){
    if (!query) return { english: query, translated: false };
    if (language === 'en' || !SUPPORTED.has(language)) return { english: query, translated: false };
    if (!isAvailable()) return { english: query, translated: false };
    try {
      const res = await window.oioxoSkills.translate.translate(query, 'en', { from: language });
      if (!res || !res.translation) return { english: query, translated: false };
      return {
        english: res.translation,
        translated: true,
        originalLang: language,
        original: query,
        match: res.match,
      };
    } catch {
      return { english: query, translated: false };
    }
  }

  /** When an intent has been resolved against the English-normalised query
   *  but the user typed in another language, optionally re-localize the
   *  intent's user-facing strings. Best-effort — falls back to English. */
  async function localizeIntent(intent, targetLang){
    if (!intent || !targetLang || targetLang === 'en') return intent;
    if (!isAvailable()) return intent;
    // Only translate the title and summary, not slugs/URLs.
    const out = Object.assign({}, intent);
    try {
      if (intent.title){
        const r = await window.oioxoSkills.translate.translate(intent.title, targetLang, { from: 'en' });
        if (r && r.translation) out.title = r.translation;
      }
      if (intent.summary){
        const r = await window.oioxoSkills.translate.translate(intent.summary, targetLang, { from: 'en' });
        if (r && r.translation) out.summary = r.translation;
      }
    } catch {}
    return out;
  }

  window.oioxoI18n = { normalize, localizeIntent, isAvailable, SUPPORTED };
})();
