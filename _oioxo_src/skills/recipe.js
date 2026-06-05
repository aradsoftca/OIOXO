/**
 * oioxo runtime mirror of lib/skills/recipe.ts. Exposes
 * window.oioxoSkills.recipe = { searchRecipe }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.recipe) return;

  const CACHE_KEY = 'xonvert.skill.recipe.cache.v1';
  const TTL = 7 * 24 * 60 * 60 * 1000;

  function readCache(q){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[q.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(q, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[q.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 50) for (const k of keys.slice(0, keys.length-50)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  function shape(meal){
    const ingredients = [];
    for (let i = 1; i <= 20; i++){
      const ing = (meal['strIngredient' + i] || '').trim();
      const meas = (meal['strMeasure' + i] || '').trim();
      if (ing) ingredients.push({ ingredient: ing, measure: meas });
    }
    const instructions = (meal.strInstructions || '').trim();
    let steps = instructions.split(/(?:\r?\n)+|(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 10);
    if (steps.length < 2) steps = [instructions];
    if (steps.length > 20) steps = steps.slice(0, 20);
    return {
      id: meal.idMeal, name: meal.strMeal, thumb: meal.strMealThumb || '',
      area: meal.strArea || '', category: meal.strCategory || '',
      ingredients, steps,
      source: meal.strSource || undefined, youtube: meal.strYoutube || undefined,
    };
  }
  async function searchRecipe(query, opts){
    const q = (query || '').trim();
    if (!q || q.length > 50) return null;
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(q); if (c) return c; }
    try {
      const r = await fetch('https://www.themealdb.com/api/json/v1/1/search.php?s=' + encodeURIComponent(q));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.meals || !j.meals.length) return null;
      const data = shape(j.meals[0]);
      if (data.ingredients.length < 2) return null;
      if (useCache) writeCache(q, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.recipe = { searchRecipe };
})();
