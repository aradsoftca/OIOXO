'use client';
import * as React from 'react';

/**
 * Site-wide: when a tool's result appears (a Download / Save button that wasn't
 * there before) shortly after the user did something, and it is off-screen,
 * scroll it smoothly into view — so choosing a format or pressing Run never
 * leaves the user wondering what happened. Never scrolls on page load, and
 * never while the user is scrolling or typing.
 */
const RESULT_RE = /^\s*(download|save|export)\b/i;

export function RevealResult() {
  React.useEffect(() => {
    let lastAction = 0;
    let lastScroll = 0;
    const onAction = () => { lastAction = Date.now(); };
    const onScroll = () => { lastScroll = Date.now(); };
    window.addEventListener('pointerdown', onAction, true);
    window.addEventListener('keydown', onAction, true);
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });

    const seen = new WeakSet<Element>();
    const consider = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (!(el instanceof HTMLElement) || !RESULT_RE.test(el.innerText || '')) return;
      const now = Date.now();
      // Only right after a user action (results can take a while: allow 5 min),
      // and not if the user has scrolled since (they are reading something else).
      if (now - lastAction > 5 * 60_000 || lastScroll > lastAction) return;
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const visible = r.top >= 0 && r.bottom <= window.innerHeight;
        if (!visible) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };

    const main = document.querySelector('main') ?? document.body;
    // Mark what's already there so only NEW result buttons count.
    main.querySelectorAll('button, a[download]').forEach((el) => seen.add(el));
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches('button, a[download]')) consider(n);
          n.querySelectorAll?.('button, a[download]').forEach(consider);
        });
      }
    });
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      window.removeEventListener('pointerdown', onAction, true);
      window.removeEventListener('keydown', onAction, true);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
    };
  }, []);
  return null;
}
