'use client';

import * as React from 'react';
import { SessionProvider } from 'next-auth/react';

/** Register the WASM-asset service worker once, after the page is interactive. */
function useServiceWorker() {
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ });
    // Don't compete with first paint / hydration.
    if (document.readyState === 'complete') register();
    else { window.addEventListener('load', register, { once: true }); }
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return <SessionProvider>{children}</SessionProvider>;
}
