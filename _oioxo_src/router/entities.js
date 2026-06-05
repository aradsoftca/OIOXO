/**
 * Entity extractor — pulls structured entities out of a query so downstream
 * stages can do something useful with them. A query like "weather in tokyo
 * tomorrow" goes from a flat string to:
 *   { intent_hint: 'weather', location: 'tokyo', time: 'tomorrow' }
 *
 * Entity types recognised:
 *   - quantity     — `100`, `5.5`, `1,000,000`
 *   - unit         — `miles`, `km`, `usd`, `°C`, `hours` (lookup in oioxoEngines.units / currency-symbols)
 *   - currency     — ISO codes + `$ € £ ¥` glyphs
 *   - file_extension — `mp4`, `pdf`, `jpg` (via catalog.formatGroups)
 *   - time_phrase  — `today`, `tomorrow`, `next week`, `in 5 days`, `2026-05-30`
 *   - location     — bare city names with no specific marker (best-effort)
 *   - math_expr    — `5 + 3`, `(2 + 4) * 8`, `sqrt(16)`
 *
 * The extractor is intentionally cheap (one pass of regex matches) and
 * doesn't attempt to disambiguate — downstream stages get a bag of entities
 * tagged by type and position.
 *
 * Exposes window.oioxoEntities = { extract }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoEntities) return;

  const CURRENCY_GLYPH = /[\$€£¥]/;
  const CURRENCY_ISO   = /\b(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|CNY|INR|KRW|RUB|BRL|MXN|HKD|SGD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|ZAR|BTC|ETH)\b/i;

  const TIME_WORDS = /\b(?:today|tomorrow|yesterday|tonight|now|later|earlier|soon)\b/i;
  const TIME_OFFSETS = /\b(?:in|next|last|this|past)\s+(?:\d+\s+)?(?:second|minute|hour|day|week|month|year)s?\b/i;
  const TIME_ISO = /\b\d{4}-\d{1,2}-\d{1,2}\b/;

  const MATH_HINTS = [
    /\b\d+(?:\.\d+)?\s*(?:\+|-|\*|x|×|\/|÷|%|\^)\s*\d+/,
    /\b(?:sqrt|sin|cos|tan|log|ln|exp|abs|min|max|floor|ceil|round)\s*\(/i,
    /\(\s*-?\d+(?:\.\d+)?\s*[\+\-\*\/x×÷^]\s*\d+/,
  ];

  // A short, conservative set of "city-shaped" tokens — we don't want to
  // tag every noun as a location. Catalog skills/weather + datatools/country
  // expand this; for the extractor, the heuristic is: if a token appears
  // after a location preposition ("in", "at", "for"), tag it.
  const LOCATION_PREP = /\b(?:in|at|for|near)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\b/;
  const LOCATION_TRAILING = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s*$/;

  /** Look up which formatGroup an extension belongs to. */
  function formatGroupOf(ext, catalog){
    if (!catalog || !catalog.formatGroups) return null;
    ext = String(ext || '').toLowerCase();
    for (const [g, list] of Object.entries(catalog.formatGroups)){
      if (list.includes(ext)) return g;
    }
    return null;
  }

  /** Return all extension-shaped tokens in the query that are catalog-known. */
  function extractFileExts(q, catalog){
    if (!catalog) return [];
    const out = [];
    const tokens = q.toLowerCase().match(/\b[a-z0-9]{2,5}\b/g) || [];
    for (const tok of tokens){
      const g = formatGroupOf(tok, catalog);
      if (g) out.push({ type: 'file_extension', value: tok, group: g });
    }
    return out;
  }

  function extractQuantities(q){
    const out = [];
    const rx = /\b(-?\d+(?:[.,]\d+)?)\s*([a-z°/²³µμ%]{1,8})?\b/g;
    let m;
    while ((m = rx.exec(q)) !== null){
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!Number.isFinite(num)) continue;
      out.push({ type: 'quantity', value: num, unitText: (m[2] || '').toLowerCase(), index: m.index });
    }
    return out;
  }

  function extractCurrency(q){
    const out = [];
    let m;
    const iso = q.match(CURRENCY_ISO);
    if (iso) out.push({ type: 'currency', value: iso[0].toUpperCase(), index: q.indexOf(iso[0]) });
    if (CURRENCY_GLYPH.test(q)) {
      const g = q.match(CURRENCY_GLYPH);
      out.push({ type: 'currency', value: ({ '$':'USD','€':'EUR','£':'GBP','¥':'JPY' })[g[0]] || g[0], index: q.indexOf(g[0]) });
    }
    return out;
  }

  function extractTime(q){
    const out = [];
    const w = q.match(TIME_WORDS);
    if (w) out.push({ type: 'time_phrase', value: w[0].toLowerCase(), index: w.index });
    const off = q.match(TIME_OFFSETS);
    if (off) out.push({ type: 'time_phrase', value: off[0].toLowerCase(), index: off.index });
    const iso = q.match(TIME_ISO);
    if (iso) out.push({ type: 'time_phrase', value: iso[0], iso: true, index: iso.index });
    return out;
  }

  function extractMath(q){
    for (const rx of MATH_HINTS){
      const m = q.match(rx);
      if (m) return [{ type: 'math_expr', value: q.trim(), index: m.index }];
    }
    return [];
  }

  function extractLocation(q){
    const out = [];
    const m = q.match(LOCATION_PREP);
    if (m && m[1]) out.push({ type: 'location', value: m[1].trim(), index: m.index, hint: 'preposition' });
    if (!out.length){
      // Fall back to a "tokyo time" / "weather tokyo" pattern — bare capital
      // city at the start or end of a short query.
      const tokens = q.trim().split(/\s+/);
      if (tokens.length >= 2 && tokens.length <= 4){
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        // Only when the query has a topic word (weather/time/sunrise/etc.)
        const topic = /\b(?:weather|time|sunrise|sunset|moon|temperature|humidity|forecast|aqi|air|holidays?)\b/i;
        if (topic.test(q)){
          if (/^[A-Z]/.test(last) && last.length > 2 && !topic.test(last)) {
            out.push({ type: 'location', value: last, hint: 'trailing' });
          } else if (/^[A-Z]/.test(first) && first.length > 2 && !topic.test(first)) {
            out.push({ type: 'location', value: first, hint: 'leading' });
          }
        }
      }
    }
    return out;
  }

  /** Top-level: assemble all entity types found in the query. Returns an
   *  object grouped by type (more ergonomic for callers than a flat list). */
  function extract(rawQ, catalog){
    const q = String(rawQ || '').trim();
    if (!q) return { all: [], quantities: [], currencies: [], times: [], extensions: [], math: [], locations: [] };
    const quantities = extractQuantities(q);
    const currencies = extractCurrency(q);
    const times = extractTime(q);
    const extensions = extractFileExts(q, catalog);
    const math = extractMath(q);
    const locations = extractLocation(q);
    return {
      all: [...quantities, ...currencies, ...times, ...extensions, ...math, ...locations],
      quantities, currencies, times, extensions, math, locations,
    };
  }

  window.oioxoEntities = { extract, formatGroupOf };
})();
