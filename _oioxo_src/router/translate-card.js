/**
 * Translate card — detect "translate X to Y" / "X in French" / "how do
 * you say X in Spanish" and surface the translation as a SERP card.
 *
 * Uses the existing i18n / translate skill when available, OR falls back
 * to the browser's native Translator API (Chrome 131+) if loaded.
 *
 * Exposes window.oioxoTranslateCard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTranslateCard) return;

  const LANGS = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
    zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', pl: 'Polish',
    sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', th: 'Thai',
    vi: 'Vietnamese', cs: 'Czech', el: 'Greek', he: 'Hebrew',
  };
  // Reverse lookup by name (lowercased).
  const NAME_TO_CODE = (() => {
    const m = new Map();
    for (const [code, name] of Object.entries(LANGS)) m.set(name.toLowerCase(), code);
    m.set('mandarin', 'zh'); m.set('chinese mandarin', 'zh');
    return m;
  })();

  const PATTERNS = [
    /^translate\s+(?:'|")?(.+?)(?:'|")?\s+(?:to|into)\s+([a-z一-鿿]+)$/i,
    /^(.+?)\s+in\s+([a-z]+)$/i,
    /^how\s+(?:do\s+you|to)\s+say\s+(?:'|")?(.+?)(?:'|")?\s+in\s+([a-z]+)\??$/i,
    /^what\s+is\s+(?:'|")?(.+?)(?:'|")?\s+in\s+([a-z]+)\??$/i,
    /^say\s+(?:'|")?(.+?)(?:'|")?\s+in\s+([a-z]+)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (!m) continue;
      const text = m[1].trim();
      const langWord = m[2].toLowerCase();
      const code = LANGS[langWord] ? langWord : NAME_TO_CODE.get(langWord);
      if (!code) continue;
      // Filter false positives: "image in jpg" → not translate.
      if (text.length < 1) continue;
      if (/^\w{1,3}$/.test(text) && text.length < 3) continue;
      return { text, target: code, targetName: LANGS[code] };
    }
    return null;
  }

  async function callTranslate(text, target){
    // Prefer dedicated translate skill (consistent across browsers).
    if (window.oioxoSkills && window.oioxoSkills.translate && window.oioxoSkills.translate.translate){
      try { return await window.oioxoSkills.translate.translate(text, target); } catch {}
    }
    // Native Translator API path (Chrome 131+).
    if (typeof window.translation !== 'undefined' && window.translation && typeof window.translation.createTranslator === 'function'){
      try {
        const t = await window.translation.createTranslator({ sourceLanguage: 'en', targetLanguage: target });
        return await t.translate(text);
      } catch {}
    }
    return null;
  }

  async function tryCard(query){
    const parsed = parsePattern(query);
    if (!parsed) return null;
    const translated = await callTranslate(parsed.text, parsed.target);
    if (translated){
      return {
        kind: 'translate',
        title: parsed.text + ' → ' + parsed.targetName,
        icon: '🌐',
        confidence: 0.85,
        formatted: translated,
        sourceText: parsed.text,
        targetLang: parsed.target,
        targetName: parsed.targetName,
        summary: 'Translated to ' + parsed.targetName,
        inputType: 'none',
      };
    }
    // Skill not loaded — return a degraded card so the user sees what we
    // tried to do instead of a blank SERP. Pointed at the on-site tool.
    return {
      kind: 'translate',
      title: parsed.text + ' → ' + parsed.targetName,
      icon: '🌐',
      confidence: 0.45,
      formatted: '(translation requires the translate skill)',
      sourceText: parsed.text,
      targetLang: parsed.target,
      targetName: parsed.targetName,
      summary: 'Translation skill not active',
      unavailable: true,
      inputType: 'none',
    };
  }

  window.oioxoTranslateCard = { tryCard, parsePattern, LANGS };
})();
