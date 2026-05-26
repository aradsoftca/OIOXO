/**
 * oioxo Compute Mesh — the HELPER FABRIC (OIOXO_COMPUTE_MESH.md, stage 3). The core of
 * "any device can be a helper": every connected device advertises a capability profile
 * (what roles it can play) + a hardware tier, and the registry tracks its live health
 * (in-flight load, smoothed latency, success rate, availability). The scheduler then
 * picks the best helper(s) for a unit of work — capability-filtered, load-spread,
 * fast-first — and tolerates churn (devices joining/sleeping/dropping).
 *
 * Pure + Node-testable: no transport, no React. The dispatchers (coder-pool, future
 * verify/embed pools) sit on top and inject the actual send/receive. Selection policy
 * lives here so it can be reasoned about and tested in isolation.
 */
import type { Tier } from './hardware';

/** The roles a device can offer to the fabric. A weak device still helps via the
 *  cheap roles (verify/corpus) even when it's a poor generator. */
export type Capability = 'generate' | 'verify' | 'embed' | 'corpus' | 'weights' | 'preview';

export interface HelperProfile {
  /** Stable device id (the account-bound device key id doubles as this). */
  id: string;
  /** What this device can do for the system. */
  caps: Capability[];
  /** Hardware class (from hardware.ts) — a tiebreaker + role-assignment input. */
  tier: Tier;
  /** Human label for UI ("MacBook", "iPhone"). */
  label?: string;
}

export interface HelperHealth {
  /** Jobs currently dispatched to this helper (load-balancing signal). */
  inflight: number;
  /** Completed jobs that produced a usable result. */
  done: number;
  /** Jobs that failed/timed-out/returned empty. */
  failed: number;
  /** Exponentially-smoothed latency (ms), or null until the first result. */
  emaLatencyMs: number | null;
  /** False when the device is asleep/dropped — excluded from selection. */
  available: boolean;
}

export interface Helper extends HelperProfile {
  health: HelperHealth;
}

/** Smoothing factor for latency EMA (recent samples weighted ~30%). */
const EMA_ALPHA = 0.3;

/**
 * Live registry of connected helpers. The fabric's source of truth: add/remove on
 * connect/disconnect, flip availability on sleep/wake, record each job's outcome, and
 * select helpers for work. Construct one per session; persistence is not needed (it
 * rebuilds from live connections).
 */
export class HelperRegistry {
  private readonly helpers = new Map<string, Helper>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
  }

  /** Add (or replace) a helper. Resets nothing if it already exists with same id —
   *  re-adding refreshes the profile but KEEPS accrued health (a reconnecting device
   *  shouldn't lose its track record). */
  add(profile: HelperProfile): Helper {
    const existing = this.helpers.get(profile.id);
    const health: HelperHealth = existing?.health ?? { inflight: 0, done: 0, failed: 0, emaLatencyMs: null, available: true };
    health.available = true;
    const h: Helper = { ...profile, health };
    this.helpers.set(profile.id, h);
    return h;
  }

  remove(id: string): void {
    this.helpers.delete(id);
  }

  /** Mark a device asleep/awake without forgetting its health. */
  setAvailable(id: string, available: boolean): void {
    const h = this.helpers.get(id);
    if (h) h.health.available = available;
  }

  get(id: string): Helper | undefined {
    return this.helpers.get(id);
  }

  all(): Helper[] {
    return [...this.helpers.values()];
  }

  /** Count of helpers that can do `cap` and are currently available. */
  countFor(cap: Capability): number {
    return this.candidates(cap).length;
  }

  /** Record that a job was dispatched (raises in-flight load). */
  recordStart(id: string): void {
    const h = this.helpers.get(id);
    if (h) h.health.inflight += 1;
  }

  /** Record a job outcome: success/failure + measured latency. Lowers in-flight load
   *  and updates the smoothed latency + success counters. */
  recordResult(id: string, r: { ok: boolean; ms: number }): void {
    const h = this.helpers.get(id);
    if (!h) return;
    h.health.inflight = Math.max(0, h.health.inflight - 1);
    if (r.ok) h.health.done += 1; else h.health.failed += 1;
    if (r.ok) {
      h.health.emaLatencyMs = h.health.emaLatencyMs === null
        ? r.ms
        : Math.round(h.health.emaLatencyMs * (1 - EMA_ALPHA) + r.ms * EMA_ALPHA);
    }
  }

  /** Success rate in [0,1]; optimistic (1) for an untried helper so it gets a chance. */
  successRate(id: string): number {
    const h = this.helpers.get(id);
    if (!h) return 0;
    const total = h.health.done + h.health.failed;
    return total === 0 ? 1 : h.health.done / total;
  }

  /**
   * Available helpers that can do `cap`, ranked best-first:
   *   1. fewest in-flight jobs (spread load; a fresh device with 0 gets picked early),
   *   2. then higher success rate (back off flaky devices),
   *   3. then lower latency (proven-fast first; untried = treated as fast to explore),
   *   4. then stronger hardware tier.
   * Pure: a snapshot ranking, no side effects.
   */
  candidates(cap: Capability): Helper[] {
    const rank: Record<Tier, number> = { none: 0, low: 1, mid: 2, high: 3 };
    return this.all()
      .filter((h) => h.health.available && h.caps.includes(cap))
      .sort((a, b) => {
        if (a.health.inflight !== b.health.inflight) return a.health.inflight - b.health.inflight;
        const sr = this.successRate(b.id) - this.successRate(a.id);
        if (Math.abs(sr) > 1e-9) return sr;
        const la = a.health.emaLatencyMs ?? 0; // untried → optimistic, gets explored
        const lb = b.health.emaLatencyMs ?? 0;
        if (la !== lb) return la - lb;
        return rank[b.tier] - rank[a.tier];
      });
  }

  /** The single best helper for `cap`, or null if none available. */
  pick(cap: Capability): Helper | null {
    return this.candidates(cap)[0] ?? null;
  }

  /** Up to `n` distinct best helpers for `cap` (for fan-out / racing). */
  pickN(cap: Capability, n: number): Helper[] {
    return this.candidates(cap).slice(0, Math.max(0, n));
  }
}
