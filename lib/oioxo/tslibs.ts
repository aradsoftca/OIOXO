/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code P2 (browser) — the TypeScript default-lib map for the in-browser
 * type oracle. In Node the compiler reads libs from disk (ts.sys); a browser has
 * no filesystem, so we fetch the lib.*.d.ts snapshots from a CDN once (via
 * @typescript/vfs, localStorage-cached). Feed the result to makeTypeCheckRun /
 * typeCheckFiles so the type oracle works fully in-browser — no install, no
 * WebContainer, works in any browser.
 */
let _libs: Promise<Map<string, string>> | null = null;

/** Load (once, cached) the TS standard-lib files for in-browser type-checking. */
export function loadTsLibs(): Promise<Map<string, string>> {
  _libs ??= (async () => {
    const ts: any = (await import('typescript')).default ?? (await import('typescript'));
    const vfs: any = await import('@typescript/vfs');
    // `true` → cache the fetched libs in localStorage for instant reuse.
    return vfs.createDefaultMapFromCDN({ target: ts.ScriptTarget.ES2020 }, ts.version, true, ts);
  })();
  return _libs;
}
