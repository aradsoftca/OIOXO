/**
 * Keyboard-shortcuts overlay + share/URL-state helpers.
 *
 *   bindGlobal({ slash, paletteOpen, … }) — installs key listeners; uses
 *                                            a11y.keyMap underneath
 *   getOverlay()  → small HTML snippet listing shortcuts (for `?` press)
 *   urlState     — { encode(envelope), decode(qs), apply() }
 *   share         — { generateUrl(envelope), copy(envelope) }
 *
 * Exposes window.oioxoShortcuts = { bindGlobal, overlayHtml, urlState, share }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoShortcuts) return;

  const SHORTCUTS = [
    { key: '/',          desc: 'Focus the search box' },
    { key: 'Ctrl/Cmd+K', desc: 'Open command palette' },
    { key: 'j  / ↓',     desc: 'Next result' },
    { key: 'k  / ↑',     desc: 'Previous result' },
    { key: 'Enter',      desc: 'Open focused result' },
    { key: 'Esc',        desc: 'Close overlay / palette' },
    { key: '?',          desc: 'Show this help' },
    { key: 'b',          desc: 'Bookmark this query' },
    { key: 's',          desc: 'Share this result' },
    { key: 'g h',        desc: 'Go to home' },
  ];

  function overlayHtml(esc){
    esc = esc || ((s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    return '<div class="oioxo-shortcuts-overlay" role="dialog" aria-label="Keyboard shortcuts">'
      + '<h2 style="margin:0 0 8px;font-size:14px;font-weight:600">Keyboard shortcuts</h2>'
      + '<table style="border-collapse:collapse;font-size:13px">'
      + SHORTCUTS.map((s) => `<tr><td style="padding:4px 16px 4px 0;font-family:monospace;color:var(--muted)">${esc(s.key)}</td><td style="padding:4px 0;color:var(--ink)">${esc(s.desc)}</td></tr>`).join('')
      + '</table></div>';
  }

  function bindGlobal(handlers){
    if (!window.oioxoA11y || typeof window.oioxoA11y.keyMap !== 'function') return () => {};
    const merged = Object.assign({}, handlers || {});
    if (!merged.help){
      // ? → show overlay via the caller's handler if provided
    }
    return window.oioxoA11y.keyMap(merged);
  }

  // --- URL state -----------------------------------------------------------

  const urlState = {
    encode(envelope){
      if (!envelope) return '';
      const parts = new URLSearchParams();
      if (envelope.original) parts.set('q', envelope.original);
      if (envelope.intent && envelope.intent.kind) parts.set('k', envelope.intent.kind);
      return '?' + parts.toString();
    },
    decode(qs){
      const s = qs || (typeof location !== 'undefined' ? location.search : '');
      if (!s) return {};
      try {
        const p = new URLSearchParams(s);
        return { q: p.get('q') || '', kind: p.get('k') || '' };
      } catch { return {}; }
    },
    apply(envelope){
      if (typeof history === 'undefined' || !history.replaceState) return;
      try { history.replaceState({}, '', urlState.encode(envelope)); } catch {}
    },
  };

  // --- Share -------------------------------------------------------------

  const share = {
    generateUrl(envelope, opts){
      opts = opts || {};
      const base = opts.base || (typeof location !== 'undefined' ? (location.origin + location.pathname) : 'https://oioxo.com/');
      return base + urlState.encode(envelope);
    },
    async copy(envelope, opts){
      const url = share.generateUrl(envelope, opts);
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
        try { await navigator.clipboard.writeText(url); return url; } catch {}
      }
      return url;
    },
  };

  window.oioxoShortcuts = { bindGlobal, overlayHtml, urlState, share, SHORTCUTS };
})();
