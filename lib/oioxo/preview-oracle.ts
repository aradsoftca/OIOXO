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
import { faultWindow, formatFault, type TraceEvent } from './debug-trace';
import { buildStaticPreview } from './preview';
import { PROBE_SCRIPT } from './probe';

/** Run a hidden iframe (loaded via `load`), feed it the goal checks, and collect
 *  the probe report (runtime errors + failed checks + trace). `load` sets src OR
 *  srcdoc, so the SAME probe drives the WebContainer preview AND the server-free
 *  srcdoc preview. */
function probeIframe(load: (f: HTMLIFrameElement) => void, checks: Check[], ms = 4000): Promise<{ errs: string[]; trace: TraceEvent[] }> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve({ errs: [], trace: [] }); return; }
    const errs: string[] = [];
    let trace: TraceEvent[] = [];
    let done = false;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:640px;visibility:hidden;border:0';
    const finish = () => {
      if (done) return; done = true;
      window.removeEventListener('message', onMsg);
      clearInterval(sender);
      try { iframe.remove(); } catch { /* */ }
      resolve({ errs, trace });
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __oioxo?: string; errors?: unknown; trace?: unknown };
      if (d && d.__oioxo === 'probe') {
        if (Array.isArray(d.errors)) for (const x of d.errors) errs.push(String(x));
        if (Array.isArray(d.trace)) trace = d.trace as TraceEvent[];
        finish();
      }
    };
    window.addEventListener('message', onMsg);
    const sendChecks = () => { try { iframe.contentWindow?.postMessage({ __oioxoSetChecks: checks }, '*'); } catch { /* */ } };
    const sender = setInterval(sendChecks, 250);
    iframe.addEventListener('load', sendChecks);
    load(iframe);
    document.body.appendChild(iframe);
    setTimeout(finish, ms);
  });
}

const probe = (url: string, checks: Check[], ms = 4000) =>
  probeIframe((f) => { f.src = url + (url.includes('?') ? '&' : '?') + '__oioxo_probe=' + Date.now(); }, checks, ms);

/** Shape a probe report into a loop RunResult (green, or errors + the fault window). */
function toResult(errs: string[], trace: TraceEvent[], onData?: (s: string) => void): RunResult {
  const ok = errs.length === 0;
  onData?.(ok ? '\n✓ runs clean — all checks pass\n' : '\n● not done yet:\n' + errs.map((e) => '  - ' + e).join('\n') + '\n');
  if (ok) return { ok: true, output: 'Runs; all checks pass.', errors: '' };
  const fault = trace.length ? formatFault(faultWindow(trace)) : '';
  return { ok: false, output: errs.join('\n'), errors: errs.join('\n') + (fault ? `\n\n${fault}` : '') };
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
    const { errs, trace } = await probe(url, getChecks());
    return toResult(errs, trace, onData);
  };
}

/**
 * The SERVER-FREE oracle (weak-device gem): verify a STATIC project by rendering it
 * directly in a hidden iframe via `srcdoc` — NO WebContainer, ~0 memory, instant —
 * with the same probe + goal checks + fault window. This lets a static project's
 * whole generate→run→repair loop run on ANY device without booting Node. Use it as
 * the loop's `run` when `previewKind(files) === 'static'`.
 */
export function makeStaticPreviewRun(getChecks: () => Check[], onData?: (s: string) => void): RunFn {
  return async (files: CodeFile[]): Promise<RunResult> => {
    const doc = buildStaticPreview(files, { headInject: PROBE_SCRIPT });
    const { errs, trace } = await probeIframe((f) => { f.srcdoc = doc; }, getChecks());
    return toResult(errs, trace, onData);
  };
}
