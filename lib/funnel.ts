'use client';
import type { FunnelEvent } from '@/lib/funnel-events';

/** Count an anonymous funnel event (once per event per page session). Fire-and-forget. */
export function funnel(event: FunnelEvent): void {
  try {
    const k = `xv-funnel-${event}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch { /* storage blocked: still count */ }
  try {
    const body = JSON.stringify({ event });
    if (!navigator.sendBeacon?.('/api/funnel', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/funnel', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
    }
  } catch { /* never break the page */ }
}
