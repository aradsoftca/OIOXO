'use client';

/**
 * Server-attested cross-tab session-cap hook. Use in any live-session studio
 * (Watch / Call / future streaming) to enforce a daily session budget that
 * a clone CAN'T bypass by:
 *   • opening 3 tabs           — server keeps ONE shared bucket
 *   • refreshing the page      — bucket persists across reloads
 *   • clearing cookies         — IP fingerprint still counts
 *   • switching VPN            — cookie fingerprint still counts
 *
 * The hook heartbeats every 20s. The server returns `expired: true` when the
 * cap is crossed; the hook fires `onExpired()` so the parent stops the live
 * session AND fires the paywall. A BroadcastChannel mirrors the expired state
 * across tabs in the same browser instantly (no need to wait for each tab's
 * next heartbeat).
 *
 * Pro users: the server returns `pro: true` and remainingSec=∞ — the timer
 * keeps ticking quietly (so analytics still work) but never fires onExpired.
 */

import * as React from 'react';

interface CapState {
  /** Server's view of remaining seconds. Falsy when the parent hasn't started yet. */
  remainingSec: number;
  /** True after the cap has been crossed. */
  expired: boolean;
  /** Is the user a Pro plan? (server-verified) */
  pro: boolean;
}

interface Options {
  /** Whether the session is live (start heartbeating). */
  active: boolean;
  /** Called once when the server says expired:true. The parent should stop. */
  onExpired: () => void;
  /** Heartbeat interval in ms. Default 20s. */
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 20_000;

export function useSessionCap(toolKey: string, { active, onExpired, intervalMs = DEFAULT_INTERVAL_MS }: Options): CapState {
  const [state, setState] = React.useState<CapState>({ remainingSec: 0, expired: false, pro: false });
  const firedRef = React.useRef(false);
  const onExpiredRef = React.useRef(onExpired);
  React.useEffect(() => { onExpiredRef.current = onExpired; }, [onExpired]);

  // Cross-tab sync: when one tab learns it's expired, every other tab learns
  // instantly through the BroadcastChannel. No race window where one tab keeps
  // running until its own next heartbeat.
  const channelKey = `session-cap:${toolKey}`;
  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(channelKey);
    ch.onmessage = (e) => {
      if (e.data?.expired) {
        setState((s) => ({ ...s, expired: true, remainingSec: 0 }));
        if (!firedRef.current) { firedRef.current = true; onExpiredRef.current(); }
      }
    };
    return () => ch.close();
  }, [channelKey]);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const broadcastExpiry = () => {
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel(channelKey);
          ch.postMessage({ expired: true });
          ch.close();
        }
      } catch { /* never break the session on broadcast failure */ }
    };

    const beat = async () => {
      try {
        const r = await fetch('/api/session-cap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolKey }),
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!r.ok) return; // transient — keep going, fail-open so we don't kill a real user
        const data = await r.json() as CapState;
        if (cancelled) return;
        setState(data);
        if (data.expired && !data.pro && !firedRef.current) {
          firedRef.current = true;
          broadcastExpiry();
          onExpiredRef.current();
        }
      } catch { /* network — fail-open */ }
    };

    // Heartbeat now, then every intervalMs.
    void beat();
    timer = setInterval(beat, intervalMs);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [active, toolKey, intervalMs, channelKey]);

  return state;
}
