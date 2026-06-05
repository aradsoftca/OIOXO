/**
 * Food / nutrition card — Open Food Facts (CORS-clean, free, no key).
 * Triggers on "ingredients in X" / "X nutrition" / "what's in X" /
 * barcode lookups.
 *
 *   https://world.openfoodfacts.org/api/v2/search?search_terms=X
 *   https://world.openfoodfacts.org/api/v2/product/{barcode}
 *
 * Exposes window.oioxoFoodcard = { tryCard, parsePattern, search }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFoodcard) return;

  const BUDGET_MS = 1000;
  const cache = new Map();
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:nutrition|nutritional facts|calories|kcal)\s+(?:of|in|for)\s+(.+?)\??$/i,
    /^(?:ingredients?)\s+(?:in|of)\s+(.+?)\??$/i,
    /^what'?s\s+in\s+(.+?)\??$/i,
    /^(.+?)\s+(?:nutrition|calories|ingredients?)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    if (/^\d{8,14}$/.test(s)) return { barcode: s };
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        return { subject: m[1].trim() };
      }
    }
    return null;
  }

  async function search(subject, barcode){
    if (typeof fetch === 'undefined') return null;
    const key = barcode || subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      let url;
      if (barcode){
        url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(barcode) + '.json';
      } else {
        url = 'https://world.openfoodfacts.org/api/v2/search?search_terms=' + encodeURIComponent(subject) + '&page_size=1&fields=product_name,brands,ingredients_text,nutriments,image_url,nutriscore_grade,nova_group';
      }
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r) return null;
      const p = barcode ? r.product : (r.products && r.products[0]);
      if (!p) return null;
      const nutri = p.nutriments || {};
      const result = {
        name: p.product_name || subject,
        brand: p.brands,
        ingredients: p.ingredients_text || '',
        image: p.image_url,
        nutriscore: p.nutriscore_grade,
        novaGroup: p.nova_group,
        per100g: {
          energy_kcal: nutri['energy-kcal_100g'],
          fat: nutri.fat_100g,
          carbs: nutri.carbohydrates_100g,
          sugars: nutri.sugars_100g,
          protein: nutri.proteins_100g,
          salt: nutri.salt_100g,
        },
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await search(p.subject, p.barcode);
    if (!r) return null;
    const per = r.per100g;
    const kcals = per.energy_kcal != null ? Math.round(per.energy_kcal) + ' kcal/100g' : '';
    return {
      kind: 'food',
      title: r.name,
      subtitle: r.brand || '',
      icon: '🥗',
      confidence: 0.85,
      formatted: r.ingredients.slice(0, 240),
      nutriscore: r.nutriscore && r.nutriscore.toUpperCase(),
      novaGroup: r.novaGroup,
      per100g: per,
      image: r.image,
      summary: kcals,
      citation: { source: 'open food facts', url: 'https://world.openfoodfacts.org/' + (p.barcode ? 'product/' + p.barcode : 'search?search_terms=' + encodeURIComponent(p.subject || r.name)) },
      inputType: 'none',
    };
  }

  window.oioxoFoodcard = { tryCard, parsePattern, search };
})();
