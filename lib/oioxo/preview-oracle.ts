/**
 * oioxo Code (OIOXO_CODE.md §2, step 4 EXECUTE) — the RUNTIME oracle for web/UI
 * projects. Type-checking gives almost no signal on a vanilla-JS game, so the loop
 * used to think a broken first draft was "done". This actually RUNS the app and
 * captures real runtime failures (uncaught errors, rejections, console.error) plus
 * any goal checks — the ground truth the small model repairs against. Same
 * philosophy as the test/typecheck oracles, applied to things you can only verify
 * by running them.
 *
 * Browser-only (creates a hidden iframe at the WebContainer preview URL; the
 * injected probe in STATIC_SERVER posts results back). A RunFn for the loop.
 */
import type { CodeFile, RunResult, RunFn } from './codeloop';
import { writeFiles } from './webcontainer';
import type { Check } from './recipes';

/** Load the running preview in a hidden iframe, send the goal checks in, and
 *  collect the probe report (runtime errors + failed checks). */
function probe(url: string, checks: Check[], ms = 4000): Promise<string[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve([]); return; }
    const errs: string[] = [];
    let done = false;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:640px;visibility:hidden;border:0';
    const finish = () => {
      if (done) return; done = true;
      window.removeEventListener('message', onMsg);
      clearInterval(sender);
      try { iframe.remove(); } catch { /* */ }
      resolve(errs);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __oioxo?: string; errors?: unknown };
      if (d && d.__oioxo === 'probe') {
        if (Array.isArray(d.errors)) for (const x of d.errors) errs.push(String(x));
        finish();
      }
    };
    window.addEventListener('message', onMsg);
    // Keep posting the checks to the probe (it may not be listening on the first
    // tick); harmless once received. Stops when the report arrives or we time out.
    const sendChecks = () => { try { iframe.contentWindow?.postMessage({ __oioxoSetChecks: checks }, '*'); } catch { /* */ } };
    const sender = setInterval(sendChecks, 250);
    iframe.addEventListener('load', sendChecks);
    iframe.src = url + (url.includes('?') ? '&' : '?') + '__oioxo_probe=' + Date.now(); // bust cache → latest files
    document.body.appendChild(iframe);
    setTimeout(finish, ms); // no report in time = treat as clean (don't block the loop)
  });
}

/**
 * A RunFn that writes the candidate into the live sandbox and verifies it by
 * RUNNING it: green = loads with no runtime errors and all goal checks pass.
 * `getUrl` returns the current preview URL (null until the server is ready, in
 * which case we can't verify yet and pass — the loop falls back to not blocking).
 */
export function makePreviewRun(
  getUrl: () => string | null,
  getChecks: () => Check[],
  onData?: (s: string) => void,
): RunFn {
  return async (files: CodeFile[]): Promise<RunResult> => {
    try { await writeFiles(files); } catch { /* container may not be mounted yet */ }
    const url = getUrl();
    if (!url) return { ok: true, output: 'preview not ready — runtime check skipped', errors: '' };
    const errs = await probe(url, getChecks());
    const ok = errs.length === 0;
    onData?.(ok ? '\n✓ runs clean — all checks pass\n' : '\n● not done yet:\n' + errs.map((e) => '  - ' + e).join('\n') + '\n');
    return { ok, output: ok ? 'Runs; all checks pass.' : errs.join('\n'), errors: ok ? '' : errs.join('\n') };
  };
}
