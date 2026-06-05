/**
 * Recipe card — uses TheMealDB (CORS-clean, free, no key required for
 * basic search) for "recipe for X", "how to make X", "X recipe".
 *
 *   https://www.themealdb.com/api/json/v1/1/search.php?s=X
 *
 * Returns name, instructions, ingredients with measurements, thumbnail
 * and an attribution link. The renderer shows it as a small recipe card.
 *
 * Exposes window.oioxoRecipecard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRecipecard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  const PATTERNS = [
    /^recipe\s+(?:for|of)\s+(.+?)\??$/i,
    /^(.+?)\s+recipe\??$/i,
    /^how\s+(?:do\s+i|to)\s+(?:make|cook|bake)\s+(.+?)\??$/i,
    /^(?:make|cook|bake)\s+(.+?)\??$/i,
    /^ingredients\s+for\s+(.+?)\??$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const subject = m[1].trim();
        if (subject.length > 60) continue;
        // Skip things that look like apps/operations, not recipes.
        if (/\b(pdf|file|image|video|audio|csv|json|xml)\b/i.test(subject)) continue;
        return { subject };
      }
    }
    return null;
  }

  async function search(subject){
    if (typeof fetch === 'undefined') return null;
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const url = 'https://www.themealdb.com/api/json/v1/1/search.php?s=' + encodeURIComponent(subject);
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.meals || !r.meals[0]) return null;
      const meal = r.meals[0];
      const ingredients = [];
      for (let i = 1; i <= 20; i++){
        const ing = meal['strIngredient' + i];
        const measure = meal['strMeasure' + i];
        if (ing && ing.trim()) ingredients.push({ name: ing.trim(), measure: (measure || '').trim() });
      }
      const result = {
        name: meal.strMeal,
        category: meal.strCategory,
        cuisine: meal.strArea,
        instructions: meal.strInstructions,
        thumb: meal.strMealThumb,
        youtube: meal.strYoutube,
        source: meal.strSource,
        tags: meal.strTags ? meal.strTags.split(',') : [],
        ingredients,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const recipe = await search(p.subject);
    if (!recipe) return null;
    return {
      kind: 'recipe',
      title: recipe.name,
      subtitle: recipe.cuisine ? recipe.cuisine + ' · ' + (recipe.category || '') : recipe.category,
      icon: '🍳',
      confidence: 0.87,
      formatted: (recipe.instructions || '').slice(0, 400) + (recipe.instructions && recipe.instructions.length > 400 ? '…' : ''),
      thumb: recipe.thumb,
      ingredients: recipe.ingredients,
      youtube: recipe.youtube,
      summary: recipe.ingredients.length + ' ingredients · ' + (recipe.cuisine || 'recipe'),
      citation: { source: 'themealdb', url: recipe.source || 'https://www.themealdb.com/meal.php?c=' + encodeURIComponent(recipe.name) },
      inputType: 'none',
    };
  }

  window.oioxoRecipecard = { tryCard, parsePattern, search };
})();
