/**
 * oioxo Compute Mesh — the VERIFY POOL (stage 4). The oracle (running tests/build) is
 * often the REAL bottleneck, and it's also the trust anchor — so parallelizing it pays
 * twice. This turns N verify-capable helpers into a single `RunFn` for the loop:
 *
 *   • fastest — first helper to confirm GREEN wins (a pass is ground truth); if none
 *               pass, return the richest RED so the model gets a good repair signal.
 *               Latency = your fastest verifier; resilient to a slow/dropped one.
 *   • agree   — require a QUORUM of helpers to agree on the verdict before trusting it.
 *               Catches a flaky or dishonest verifier (the trust story when a helper is
 *               not fully trusted). A tie / too-much churn resolves to NOT-green (safe).
 *
 * Churn-tolerant: a verifier that throws or times out simply doesn't vote; if every
 * verifier is gone the call returns a clear "no verifier" red (the loop retries / gives
 * up cleanly, never hangs). The per-helper runner is INJECTED (prod: a remote-oracle
 * bound to that helper; tests: fakes), keeping this pure + Node-testable.
 */
import type { HelperRegistry } from './mesh';
import type { RunResult, RunFn, CodeFile } from './codeloop';

export type VerifyMode = 'fastest' | 'agree';

export interface VerifyPoolOpts {
  registry: HelperRegistry;
  /** Resolve the RunFn that talks to a specific verify helper (prod: a remote-oracle). */
  runnerFor: (helperId: string) => RunFn;
  /** fastest (default) or agree. */
  mode?: VerifyMode;
  /** Max verifiers to engage. Default: all available verify-capable helpers. */
  fanout?: number;
  /** Votes needed in 'agree' mode. Default: majority of engaged verifiers. */
  quorum?: number;
  /** Per-helper deadline; a slower verifier doesn't vote on this call. Default 120s. */
  timeoutMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void;
}

const NO_VERIFIER: RunResult = { ok: false, output: '', errors: 'no verifier available' };

/** Build a pooled RunFn that fans verification across the fabric. */
export function makeVerifyPool(opts: VerifyPoolOpts): RunFn {
  const mode: VerifyMode = opts.mode ?? 'fastest';
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));

  return (files: CodeFile[], cmd: string): Promise<RunResult> => {
    const picks = opts.registry.pickN('verify', opts.fanout ?? opts.registry.countFor('verify'));
    if (picks.length === 0) return Promise.resolve(NO_VERIFIER);

    const quorum = Math.max(1, opts.quorum ?? Math.floor(picks.length / 2) + 1);

    return new Promise<RunResult>((resolve) => {
      let pending = picks.length;
      let settled = false;
      let greenVotes = 0, redVotes = 0;
      let firstGreen: RunResult | null = null;
      const reds: RunResult[] = [];

      const overall = setTimer(() => finish(), timeoutMs + 50);
      const done = (r: RunResult) => { if (settled) return; settled = true; clearTimer(overall); resolve(r); };

      /** No decisive verdict reached in time — resolve conservatively. */
      const finish = () => {
        if (mode === 'agree') {
          // Trust only a clear majority of the verifiers that actually voted.
          done(greenVotes > redVotes && firstGreen ? firstGreen : (reds[0] ?? NO_VERIFIER));
        } else {
          // fastest: no green seen → hand back the most informative red.
          done(firstGreen ?? reds.find((r) => r.errors) ?? reds[0] ?? NO_VERIFIER);
        }
      };

      for (const h of picks) {
        opts.registry.recordStart(h.id);
        const t0 = now();
        let local = false;

        const timer = setTimer(() => {
          if (local) return;
          local = true;
          opts.registry.recordResult(h.id, { ok: false, ms: timeoutMs }); // helper didn't deliver
          onVote(null);
        }, timeoutMs);

        Promise.resolve()
          .then(() => opts.runnerFor(h.id)(files, cmd))
          .then(
            (res) => {
              if (local) return;
              local = true;
              clearTimer(timer);
              // 'ok' here = the helper PRODUCED a verdict (did its job), not whether the build passed.
              opts.registry.recordResult(h.id, { ok: true, ms: now() - t0 });
              onVote(res ?? { ok: false, output: '', errors: 'empty verdict' });
            },
            () => {
              if (local) return;
              local = true;
              clearTimer(timer);
              opts.registry.recordResult(h.id, { ok: false, ms: now() - t0 });
              onVote(null);
            },
          );
      }

      function onVote(res: RunResult | null) {
        pending -= 1;
        if (settled) return;

        if (res) {
          if (res.ok) { greenVotes += 1; firstGreen ??= res; }
          else { redVotes += 1; reds.push(res); }

          if (mode === 'fastest') {
            // A pass is ground truth — take the first green immediately.
            if (res.ok) { done(res); return; }
          } else {
            // agree: resolve as soon as either verdict reaches quorum.
            if (greenVotes >= quorum && firstGreen) { done(firstGreen); return; }
            if (redVotes >= quorum) { done(reds[0]); return; }
          }
        }

        if (pending === 0) finish();
      }
    });
  };
}
