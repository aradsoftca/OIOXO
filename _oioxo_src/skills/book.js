/**
 * oioxo runtime mirror of lib/skills/book.ts. Exposes
 * window.oioxoSkills.book = { searchBook }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.book) return;

  const CACHE_KEY = 'xonvert.skill.book.cache.v1';
  const TTL = 7 * 24 * 60 * 60 * 1000;

  function readCache(q){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[q.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(q, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[q.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 80) for (const k of keys.slice(0, keys.length-80)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  function shape(doc){
    return {
      title: doc.title || '',
      authors: (doc.author_name || []).slice(0, 3),
      firstPublishYear: doc.first_publish_year || null,
      editionCount: doc.edition_count || 0,
      languages: (doc.language || []).slice(0, 4).map(l => l.toUpperCase()),
      subjects: (doc.subject || []).slice(0, 8),
      coverUrl: doc.cover_i ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg' : null,
      openLibraryUrl: doc.key ? 'https://openlibrary.org' + doc.key : null,
      isbn: (doc.isbn && doc.isbn[0]) || undefined,
    };
  }
  async function searchBook(query, opts){
    const q = (query || '').trim();
    if (!q || q.length > 80) return null;
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(q); if (c) return c; }
    try {
      const r = await fetch('https://openlibrary.org/search.json?limit=1&q=' + encodeURIComponent(q));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.docs || !j.docs.length) return null;
      const data = shape(j.docs[0]);
      if (!data.title) return null;
      if (useCache) writeCache(q, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.book = { searchBook };
})();
