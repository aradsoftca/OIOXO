/**
 * Shared in-memory rate-limit + bookkeeping bucket. Single-process, resets on
 * deploy — Cloudflare in front is the real volume shield; this is the
 * app-level backstop that every API rate-limiter needs.
 *
 * Why this exists: the codebase had six independent copies of the same
 * "Map<string, { count; reset }>" pattern, in middleware, gate.ts, net-guard,
 * pow.ts, forgot-password, and register. Five of them shipped with the same
 * OOM bug — `if (size > N) for (...) if (expired) delete()` only frees
 * expired entries, so a rotating-IP attack where every entry is fresh keeps
 * the map growing forever. This module gets the sweep right ONCE and every
 * route reuses it.
 *
 * Two windowed counters are exposed:
 *
 *   - `take(map, key, { max, windowMs })` is a fixed-window per-key counter.
 *     Returns `true` while under the max, `false` once exceeded. Used by
 *     things like "5 registrations / hour / IP" or "240 requests / min /
 *     IP at the edge".
 *
 *   - `bumpAndPeek(map, key, { windowMs })` increments a fixed-window
 *     counter and returns the current count. Used where the caller wants
 *     adaptive behavior (e.g. PoW difficulty ramps with rate).
 *
 * Internally both share `boundedSet` which is the actual fix: when the map
 * would exceed `maxEntries`, it first sweeps expired buckets; if that frees
 * nothing (sustained attack with fresh entries) it drops the oldest half by
 * `reset` time. That keeps the map bounded at ~`maxEntries` no matter how
 * adversarial the traffic pattern is.
 */

export interface Bucket {
  count: number;
  /** Epoch ms when this bucket resets to zero. */
  reset: number;
}

const DEFAULT_MAX_ENTRIES = 50_000;

/**
 * Ensure the map stays bounded. Call BEFORE inserting a new key when the
 * map is already at or past the cap. Drops expired entries first; if all
 * entries are fresh, drops the oldest half by `reset`.
 */
function evictIfFull(map: Map<string, Bucket>, now: number, maxEntries: number): void {
  if (map.size <= maxEntries) return;
  for (const [k, v] of map) if (now > v.reset) map.delete(k);
  if (map.size <= maxEntries) return;
  // Sustained-attack path: every entry is still fresh. Drop the oldest half
  // to keep a hard ceiling. Sorting is O(n log n) but only runs when we've
  // already accepted being under attack, and the eviction amortizes across
  // many subsequent inserts.
  const sorted = [...map.entries()].sort((a, b) => a[1].reset - b[1].reset);
  const dropTo = Math.floor(sorted.length / 2);
  for (let i = 0; i < dropTo; i++) map.delete(sorted[i][0]);
}

export interface TakeOptions {
  /** Max events per window before take() returns false. */
  max: number;
  /** Window length in ms. */
  windowMs: number;
  /** Hard cap on map size to bound memory (default 50_000). */
  maxEntries?: number;
}

/**
 * Per-key fixed-window counter. Returns `true` if the event is under the
 * limit (and records it), `false` once the limit is exceeded.
 *
 * Usage:
 *   if (!take(hits, ip, { max: 5, windowMs: 3600_000 })) return 429;
 */
export function take(map: Map<string, Bucket>, key: string, opts: TakeOptions): boolean {
  const now = Date.now();
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const e = map.get(key);
  if (!e || now > e.reset) {
    evictIfFull(map, now, maxEntries);
    map.set(key, { count: 1, reset: now + opts.windowMs });
    return true;
  }
  if (e.count >= opts.max) return false;
  e.count++;
  return true;
}

export interface BumpOptions {
  windowMs: number;
  maxEntries?: number;
}

/**
 * Per-key fixed-window counter that returns the current count after
 * incrementing. Used by adaptive flows like PoW difficulty ramp-up.
 */
export function bumpAndPeek(map: Map<string, Bucket>, key: string, opts: BumpOptions): number {
  const now = Date.now();
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const e = map.get(key);
  if (!e || now > e.reset) {
    evictIfFull(map, now, maxEntries);
    map.set(key, { count: 1, reset: now + opts.windowMs });
    return 1;
  }
  e.count++;
  return e.count;
}
