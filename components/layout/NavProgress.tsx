'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Site-wide navigation loading bar. Starts when an internal link is clicked
 * (so there's instant feedback even before the new page's data resolves) and
 * completes when the route actually changes. Trickles toward 90% while loading
 * so slow pages still feel alive. Pure CSS bar — no dependency.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [progress, setProgress] = React.useState(0);
  const [active, setActive] = React.useState(false);
  const trickle = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const started = React.useRef(false);

  const stop = () => { if (trickle.current) { clearInterval(trickle.current); trickle.current = null; } };

  const start = React.useCallback(() => {
    started.current = true;
    setActive(true);
    setProgress(12);
    stop();
    trickle.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.max(0.4, (90 - p) * 0.07)));
    }, 180);
  }, []);

  const finish = React.useCallback(() => {
    stop();
    setProgress(100);
    window.setTimeout(() => { setActive(false); setProgress(0); }, 280);
  }, []);

  // Start on any same-origin link click.
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a) return;
      if (a.getAttribute('target') === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let url: URL;
      try { url = new URL(a.href, location.href); } catch { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [start]);

  // Complete when the route resolves. Skip the initial mount.
  React.useEffect(() => {
    if (!started.current) return;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  React.useEffect(() => stop, []);

  if (!active && progress === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-[3px]">
      <div
        className="h-full transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: active ? 1 : 0,
          background: 'var(--brand-gradient)',
          boxShadow: '0 0 10px 1px color-mix(in oklch, var(--brand-2) 70%, transparent)',
        }}
      />
    </div>
  );
}
