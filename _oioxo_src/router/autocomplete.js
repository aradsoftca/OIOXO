/**
 * Live autocomplete — debounced keystroke handler that drives
 * oioxoSuggest as the user types. Two surfaces:
 *
 *   attach(inputEl, opts)   — DOM-aware: wires an <input> + emits
 *                              suggestions to handlers
 *   query(q, opts)           — programmatic: returns suggestions sync,
 *                              for use by component frameworks
 *
 * Debouncing defaults to 80ms (≈ 12 keystrokes / sec at fast typing).
 * The handler cancels in-flight callbacks when a new keystroke lands so
 * stale suggestions never overwrite fresh ones.
 *
 * Surfaces both regular suggestions AND a `recents` block when the input
 * is empty and focused — gives the user one-tap access to their last
 * queries, bookmarks, and a few popular apps.
 *
 * Exposes window.oioxoAutocomplete = { attach, query, recents }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoAutocomplete) return;

  const DEFAULT_DEBOUNCE_MS = 80;
  const DEFAULT_LIMIT = 6;

  /** Pure programmatic API — returns suggestions for q.
   *  Designed to be called from React/Vue/etc keystroke handlers. */
  function query(q, opts){
    opts = opts || {};
    const limit = opts.limit || DEFAULT_LIMIT;
    if (!q || !q.trim()){
      return { suggestions: [], recents: recents(opts), empty: true };
    }
    let suggestions = [];
    if (window.oioxoSuggest && window.oioxoSuggest.suggest){
      try {
        suggestions = window.oioxoSuggest.suggest(q, opts.catalog || null, { limit }) || [];
      } catch { suggestions = []; }
    }
    // Append a "search instead for X" entry when rewriter would auto-correct.
    let correction = null;
    if (window.oioxoRewriter && window.oioxoRewriter.rewrite){
      try {
        const r = window.oioxoRewriter.rewrite(q, opts.catalog || null);
        if (r && r.corrections && r.corrections.length){
          correction = { type: 'corrected', from: q, to: r.rewritten, corrections: r.corrections };
        }
      } catch {}
    }
    return { suggestions, correction, recents: [], empty: false };
  }

  /** Empty-state suggestions: recent searches + bookmarks + a few popular apps. */
  function recents(opts){
    opts = opts || {};
    const out = [];
    if (window.oioxoMemory && window.oioxoMemory.recent){
      try {
        for (const m of window.oioxoMemory.recent(5)){
          if (m && m.query) out.push({ kind: 'recent', text: m.query });
        }
      } catch {}
    }
    if (window.oioxoBookmarks && window.oioxoBookmarks.list){
      try {
        for (const b of window.oioxoBookmarks.list().slice(0, 3)){
          out.push({ kind: 'bookmark', text: b.label || b.q });
        }
      } catch {}
    }
    if (opts.catalog && opts.catalog.tools){
      const apps = opts.catalog.tools.filter((t) => t.appType).slice(0, 3);
      for (const a of apps) out.push({ kind: 'app', text: a.name, slug: a.slug });
    }
    return out;
  }

  /** Attach to a DOM <input>. Returns { detach } so callers can clean up. */
  function attach(inputEl, opts){
    opts = opts || {};
    if (!inputEl || typeof inputEl.addEventListener !== 'function') return { detach(){} };
    const debounce = opts.debounceMs || DEFAULT_DEBOUNCE_MS;
    const handler = opts.onSuggestions || (() => {});
    const onEmpty = opts.onEmpty || (() => {});
    let timer = null;
    let lastQueryId = 0;

    function fire(value){
      const id = ++lastQueryId;
      const result = query(value, { catalog: opts.catalog, limit: opts.limit });
      // Drop stale results — only fire the callback for the latest query id.
      if (id !== lastQueryId) return;
      if (result.empty) onEmpty(result);
      else handler(result);
    }

    function onInput(e){
      if (timer) clearTimeout(timer);
      const value = e && e.target ? e.target.value : inputEl.value || '';
      timer = setTimeout(() => { timer = null; fire(value); }, debounce);
    }
    function onFocus(){
      if (!inputEl.value) fire('');
    }
    function onKey(e){
      if (e.key === 'Escape'){ if (opts.onDismiss) opts.onDismiss(); }
    }
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('focus', onFocus);
    inputEl.addEventListener('keydown', onKey);
    return {
      detach(){
        if (timer) clearTimeout(timer);
        inputEl.removeEventListener('input', onInput);
        inputEl.removeEventListener('focus', onFocus);
        inputEl.removeEventListener('keydown', onKey);
      },
      trigger(){ fire(inputEl.value || ''); },
    };
  }

  window.oioxoAutocomplete = { attach, query, recents };
})();
