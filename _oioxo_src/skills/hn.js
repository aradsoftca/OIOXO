/**
 * oioxo runtime mirror of lib/skills/hn.ts. Exposes window.oioxoSkills.hn = { getTopStories }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.hn) return;

  const CACHE_KEY = 'xonvert.skill.hn.cache.v1';
  const TTL = 10 * 60 * 1000;

  function readCache(){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); if (j && j.t && Date.now() - j.t < TTL) return j.s; } catch {} return null;
  }
  function writeCache(stories){ try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), s: stories })); } catch {} }

  async function getTopStories(opts){
    const limit = Math.max(1, Math.min(30, (opts && opts.limit) || 10));
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(); if (c) return c.slice(0, limit); }
    try {
      const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      if (!idsRes.ok) return null;
      const ids = await idsRes.json();
      if (!Array.isArray(ids) || !ids.length) return null;
      const top = ids.slice(0, limit);
      const fetched = await Promise.all(top.map(id =>
        fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json').then(r => r.ok ? r.json() : null).catch(() => null)
      ));
      const stories = fetched.filter(s => s && s.title);
      if (!stories.length) return null;
      if (useCache) writeCache(stories);
      return stories;
    } catch { return null; }
  }
  window.oioxoSkills.hn = { getTopStories };
})();
