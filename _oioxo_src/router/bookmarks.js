/**
 * Bookmarked / pinned searches — explicit user-saved queries. Survives
 * refresh (localStorage). UI-agnostic: the SERP layer exposes the list,
 * the renderer decides where to surface them (header chips, empty-state
 * top row, /pins page, etc).
 *
 * Distinct from history: bookmarks are deliberate, durable, ordered;
 * history is automatic, decaying, recency-ranked.
 *
 * Exposes window.oioxoBookmarks = { add, remove, list, has, clear }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoBookmarks) return;

  const KEY = 'oioxo.router.bookmarks.v1';
  const MAX = 50;

  function restore(){
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.slice(0, MAX) : [];
    } catch { return []; }
  }

  let pins = restore();
  let persistTimer = null;
  function persist(){
    if (typeof localStorage === 'undefined') return;
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(pins)); } catch {}
    }, 200);
  }

  function normalize(q){ return String(q || '').trim().toLowerCase(); }

  function add(query, meta){
    const q = normalize(query);
    if (!q) return false;
    if (pins.some((p) => p.q === q)) return false;
    pins.unshift({ q, label: String(query).trim(), createdAt: Date.now(), meta: meta || null });
    if (pins.length > MAX) pins = pins.slice(0, MAX);
    persist();
    return true;
  }

  function remove(query){
    const q = normalize(query);
    const before = pins.length;
    pins = pins.filter((p) => p.q !== q);
    if (pins.length !== before){ persist(); return true; }
    return false;
  }

  function has(query){ return pins.some((p) => p.q === normalize(query)); }
  function list(){ return pins.slice(); }
  function clear(){ pins = []; persist(); }

  window.oioxoBookmarks = { add, remove, list, has, clear };
})();
