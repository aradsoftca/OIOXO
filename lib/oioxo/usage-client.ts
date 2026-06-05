/**
 * OIOXO — the SHARED usage/billing client (one logic for web AND desktop). Hourly
 * free AI time, activation = unlimited; the SERVER (oioxo.com/api/usage/code) is the
 * single source of truth, keyed by ACCOUNT so the allowance is shared across all a
 * user's devices. The only per-surface differences are injected:
 *   • web    → endpoint '/api/usage/code' (relative, cookie identity)
 *   • desktop→ endpoint 'https://oioxo.com/api/usage/code' + Authorization: Bearer
 *              <account token from the OS keychain>
 * So the limit/billing rules live in exactly ONE place. Host-independent (no React,
 * injected fetch), Node-testable. The web hook (use-code-meter) and the desktop
 * provider both wrap this same class.
 */
export interface CodeUsage {
  allowed: boolean;
  unlimited?: boolean;
  usedSeconds?: number;
  limitSeconds?: number;
  remainingSeconds?: number | null;
}

export interface UsageClientOpts {
  /** Where the meter lives. Web: '/api/usage/code'. Desktop: the absolute oioxo.com URL. */
  endpoint?: string;
  /** Injected fetch (browser/Electron global, or a fake in tests). */
  fetchImpl?: typeof fetch;
  /** Per-call auth headers — desktop returns { Authorization: 'Bearer <token>' } from
   *  the OS keychain; web returns nothing (the cookie rides along automatically). */
  authHeaders?: () => Record<string, string> | undefined;
  /** Max seconds accepted per report (matches the server clamp; guards a runaway). */
  maxReport?: number;
}

/**
 * One coding session's time meter. `start()` asks permission (no increment);
 * `stop()` reports the elapsed wall-time as active-AI seconds. On a network blip it
 * FAILS OPEN (never locks a user out on a hiccup) — the server stays the hard gate.
 */
export class CodeMeter {
  private startedAt = 0;
  private endpoint: string;
  private fetchImpl: typeof fetch;
  private authHeaders: () => Record<string, string> | undefined;
  private maxReport: number;

  constructor(opts: UsageClientOpts = {}) {
    this.endpoint = opts.endpoint ?? '/api/usage/code';
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.authHeaders = opts.authHeaders ?? (() => undefined);
    this.maxReport = opts.maxReport ?? 600;
  }

  private async post(action: 'start' | 'report', seconds?: number): Promise<CodeUsage> {
    try {
      const r = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.authHeaders() ?? {}) },
        body: JSON.stringify({ action, seconds }),
      });
      return (await r.json()) as CodeUsage;
    } catch {
      return { allowed: true, unlimited: true, remainingSeconds: null }; // fail open
    }
  }

  /** Ask permission to run. Returns the usage state; `allowed:false` → caller paywalls. */
  async start(): Promise<CodeUsage> {
    const u = await this.post('start');
    if (u.allowed) this.startedAt = Date.now();
    return u;
  }

  /** Report the elapsed active-AI time since start() (clamped). Null if never started
   *  or zero elapsed. Call in a `finally` so time is always accounted. */
  async stop(): Promise<CodeUsage | null> {
    if (!this.startedAt) return null;
    const secs = Math.min(this.maxReport, Math.round((Date.now() - this.startedAt) / 1000));
    this.startedAt = 0;
    return secs > 0 ? this.post('report', secs) : null;
  }

  /** For tests/telemetry: is a session currently being timed? */
  get running(): boolean { return this.startedAt > 0; }
}

/** "32 min of AI left today" / "Unlimited" — identical copy on web + desktop. */
export function formatRemaining(remaining: number | null | undefined): string {
  if (remaining === null || remaining === undefined) return 'Unlimited';
  const min = Math.floor(remaining / 60);
  return min >= 1 ? `${min} min of AI left today` : `${Math.max(0, remaining)}s of AI left today`;
}
