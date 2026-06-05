/**
 * oioxo Code — REGRESSION SAFETY (Gem 6b). The loop's danger on a multi-step build
 * is fixing step N and silently breaking step N-1. So we make verified behavior
 * monotonic: every check that has EVER passed joins a growing suite, every all-green
 * state is snapshotted as a checkpoint, and any edit that breaks a once-passing
 * check is flagged as a REGRESSION — the loop repairs it (or rolls back to the last
 * good checkpoint) instead of accepting forward progress that quietly lost ground.
 *
 * Pure + Node-testable; wraps any check-based oracle (preview-oracle) via
 * makeRegressionRun. The check-name parsing matches preview-oracle's "not yet: X".
 */
import type { CodeFile, RunFn, RunResult } from './codeloop';

export interface RegressionUpdate {
  /** Once-passing checks that are now failing (empty = no regression). */
  regressions: string[];
  /** Currently-failing checks (new + regressed). */
  failing: string[];
  /** True when nothing that ever passed is broken now. */
  ok: boolean;
  /** A fresh all-green checkpoint was taken. */
  checkpointed: boolean;
}

/** Tracks the growing set of ever-passing checks + the last all-green file set. */
export class RegressionGuard {
  private everPassed = new Set<string>();
  private good: CodeFile[] | null = null;

  /** Feed the latest verification: all checks that ran + which are failing now. */
  update(files: CodeFile[], allChecks: string[], failing: string[]): RegressionUpdate {
    const failSet = new Set(failing);
    const passingNow = allChecks.filter((c) => !failSet.has(c));
    // A regression = a check that passed before is in this run's set but failing now.
    const regressions = [...this.everPassed].filter((c) => allChecks.includes(c) && failSet.has(c));
    // Record new passes (monotonic — the suite only grows).
    for (const c of passingNow) this.everPassed.add(c);
    const allGreen = regressions.length === 0 && failing.length === 0 && allChecks.length > 0;
    let checkpointed = false;
    if (allGreen) { this.good = files.map((f) => ({ ...f })); checkpointed = true; }
    return { regressions, failing, ok: regressions.length === 0, checkpointed };
  }

  /** The last all-green file set, to roll back to when an edit can't un-regress. */
  lastGood(): CodeFile[] | null {
    return this.good ? this.good.map((f) => ({ ...f })) : null;
  }

  knownChecks(): string[] { return [...this.everPassed]; }
}

/** Parse the check names that are FAILING from a preview-oracle report (it joins
 *  lines like "not yet: <name>"). Lines without that shape are runtime errors,
 *  surfaced separately. */
export function parseFailingChecks(errors: string): { failing: string[]; runtimeErrors: string[] } {
  const failing: string[] = [];
  const runtimeErrors: string[] = [];
  for (const raw of (errors || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^not yet:\s*(.+)$/i);
    if (m) failing.push(m[1].trim());
    else runtimeErrors.push(line);
  }
  return { failing, runtimeErrors };
}

/**
 * Wrap a check-based oracle so it ALSO fails on a regression. `getChecks` returns
 * the names of all checks currently being evaluated. If an edit breaks a check that
 * previously passed, the wrapped result is `ok:false` with a clear "regression:"
 * message — so the loop fixes the regression instead of accepting the edit. A
 * genuinely all-green run is checkpointed for rollback.
 */
export function makeRegressionRun(base: RunFn, guard: RegressionGuard, getCheckNames: () => string[]): RunFn {
  return async (files: CodeFile[], cmd: string): Promise<RunResult> => {
    const res = await base(files, cmd);
    const all = getCheckNames();
    const { failing, runtimeErrors } = parseFailingChecks(res.errors);
    const upd = guard.update(files, all, failing);
    if (upd.regressions.length) {
      const msg = `regression: these previously worked and are now broken — ${upd.regressions.join(', ')}` +
        (runtimeErrors.length ? `\n${runtimeErrors.join('\n')}` : '');
      return { ok: false, output: res.output, errors: msg };
    }
    return res; // no regression → pass through the base oracle's verdict
  };
}
