/**
 * oioxo runtime mirror of lib/skills/github.ts. Exposes window.oioxoSkills.github = { searchTopRepo }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.github) return;

  const CACHE_KEY = 'xonvert.skill.github.cache.v1';
  const TTL = 6 * 60 * 60 * 1000;
  const MIN_STARS = 50;

  function readCache(q){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[q.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(q, repo){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[q.toLowerCase()] = { t: Date.now(), d: repo };
      const keys = Object.keys(j); if (keys.length > 80) for (const k of keys.slice(0, keys.length-80)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  async function searchTopRepo(query, opts){
    const q = (query || '').trim();
    if (!q || q.length > 80) return null;
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(q); if (c) return c; }
    try {
      const r = await fetch('https://api.github.com/search/repositories?sort=stars&order=desc&per_page=1&q=' + encodeURIComponent(q),
        { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.items || !j.items.length) return null;
      const it = j.items[0];
      const minStars = (opts && typeof opts.minStars === 'number') ? opts.minStars : MIN_STARS;
      if (it.stargazers_count < minStars) return null;
      const repo = {
        name: it.full_name, url: it.html_url, desc: it.description || '',
        stars: it.stargazers_count, forks: it.forks_count, lang: it.language || '',
        issues: it.open_issues_count, pushed: it.pushed_at, topics: (it.topics||[]).slice(0,5),
      };
      if (useCache) writeCache(q, repo);
      return repo;
    } catch { return null; }
  }
  window.oioxoSkills.github = { searchTopRepo };
})();
