/**
 * Result actions — utility helpers the renderer wires onto each card:
 *   • Copy URL
 *   • Bookmark
 *   • Share (uses Web Share API when available, else clipboard URL)
 *   • Open in new tab
 *
 *   bind(cardEl, { url, title, slug })
 *   share({ url, title })
 *
 * Exposes window.oioxoResultActions = { bind, share, copy }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoResultActions) return;

  async function copy(url){
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
      try { await navigator.clipboard.writeText(url); return true; } catch {}
    }
    return false;
  }

  async function share(opts){
    opts = opts || {};
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function'){
      try { await navigator.share({ title: opts.title || '', url: opts.url || '' }); return 'native'; } catch {}
    }
    if (opts.url){
      const ok = await copy(opts.url);
      return ok ? 'clipboard' : 'failed';
    }
    return 'failed';
  }

  function bind(el, payload){
    if (!el || !payload) return;
    el.querySelectorAll && el.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (action === 'copy') await copy(payload.url);
        else if (action === 'share') await share(payload);
        else if (action === 'bookmark' && window.oioxoBookmarks){
          window.oioxoBookmarks.add(payload.title || payload.url, { slug: payload.slug });
        }
        else if (action === 'open') window.open(payload.url, '_blank', 'noopener,noreferrer');
        // Feedback to bandit
        if (window.oioxoBandit && payload.slug && (action === 'share' || action === 'bookmark')){
          try { window.oioxoBandit.recordClick(payload.slug); } catch {}
        }
      });
    });
  }

  window.oioxoResultActions = { bind, share, copy };
})();
