/**
 * oioxo Compute Mesh — the CODER POOL (stage 3, step B). Turns N paired helpers into a
 * single GenerateFn that drops straight into runCodeLoop. This is what makes "three
 * devices = faster" literally true:
 *
 *   • race  — dispatch the same job to several generate-capable helpers at once; the
 *             FIRST usable result wins, the rest are abandoned. Latency = your FASTEST
 *             device, not the average. Best when generation is the bottleneck.
 *   • best  — wait for the responders (up to a timeout) and keep the highest-scoring
 *             result. Trades a little latency for quality (the parallel form of the
 *             loop's best-of-N RANK role).
 *
 * Churn-tolerant by construction: a helper that throws, times out, or returns nothing
 * is recorded as a failure (so the fabric routes around it next time) and never blocks
 * the pool — if everyone fails, the call resolves to [] (a failed attempt the loop
 * simply retries, never a hang). Pure: the per-helper generator is INJECTED, so prod
 * wires a makePeerCoder per helper while tests use fakes.
 */
import type { HelperRegistry } from './mesh';
import type { GenContext, Edit, GenerateFn } from './codeloop';

export type PoolMode = 'race' | 'best';

export interface CoderPoolOpts {
  /** The live helper fabric. */
  registry: HelperRegistry;
  /** Resolve the GenerateFn that talks to a specific helper (prod: a bound makePeerCoder). */
  generatorFor: (helperId: string) => GenerateFn;
  /** race (default) or best. */
  mode?: PoolMode;
  /** Max helpers to engage per call. Default: all available generate-capable helpers. */
  fanout?: number;
  /** Per-helper deadline; a slower helper is treated as a failure for THIS call. Default 60s. */
  timeoutMs?: number;
  /** Quality score for a result in 'best' mode (higher = better). Default: 1 if non-empty. */
  score?: (edits: Edit[], ctx: GenContext) => number;
  /** Injected clock (tests). Default Date.now. */
  now?: () => number;
  /** Injected timer (tests). Defaults to setTimeout; must return a handle clearTimeout accepts. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void;
}

/** Build a pooled GenerateFn that fans each generation across the fabric. */
export function makeCoderPool(opts: CoderPoolOpts): GenerateFn {
  const mode: PoolMode = opts.mode ?? 'race';
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  const score = opts.score ?? ((edits: Edit[]) => (edits.length ? 1 : 0));

  return (ctx: GenContext): Promise<Edit[]> => {
    const picks = opts.registry.pickN('generate', opts.fanout ?? opts.registry.countFor('generate'));
    if (picks.length === 0) return Promise.resolve([]); // no helper → failed attempt, loop retries

    return new Promise<Edit[]>((resolve) => {
      let pending = picks.length;
      let settled = false;
      let best: { edits: Edit[]; score: number } | null = null;

      // Safety net: never hang even if a transport silently never settles.
      const overall = setTimer(() => finish(), timeoutMs + 50);

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimer(overall);
        resolve(best?.edits ?? []);
      };

      for (const h of picks) {
        opts.registry.recordStart(h.id);
        const t0 = now();
        let done = false;

        const timer = setTimer(() => {
          if (done) return;
          done = true;
          opts.registry.recordResult(h.id, { ok: false, ms: timeoutMs });
          onSettle([]);
        }, timeoutMs);

        Promise.resolve()
          .then(() => opts.generatorFor(h.id)(ctx))
          .then(
            (edits) => {
              if (done) return;
              done = true;
              clearTimer(timer);
              const out = Array.isArray(edits) ? edits : [];
              opts.registry.recordResult(h.id, { ok: out.length > 0, ms: now() - t0 });
              onSettle(out);
            },
            () => {
              if (done) return;
              done = true;
              clearTimer(timer);
              opts.registry.recordResult(h.id, { ok: false, ms: now() - t0 });
              onSettle([]);
            },
          );
      }

      function onSettle(edits: Edit[]) {
        pending -= 1;
        if (settled) return;

        if (mode === 'race' && edits.length > 0) {
          // First usable result wins; remaining responders are abandoned.
          settled = true;
          clearTimer(overall);
          resolve(edits);
          return;
        }

        // best mode (or race still waiting): keep the strongest so far.
        const s = score(edits, ctx);
        if (s > (best?.score ?? -1)) best = { edits, score: s };

        if (pending === 0) finish();
      }
    });
  };
}
