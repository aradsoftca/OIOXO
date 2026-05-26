/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code P2 (browser) — the TypeScript default-lib map for the in-browser
 * type oracle. In Node the compiler reads libs from disk (ts.sys); a browser has
 * no filesystem, so we load the lib.*.d.ts snapshots once (localStorage-cached via
 * @typescript/vfs). These libs are SELF-HOSTED at `/monaco/ts-libs/` (copied from
 * node_modules/typescript by scripts/copy-monaco.mjs) — vfs derives the needed file
 * list, we just redirect its fetch from the CDN to our own origin. No third party.
 */
let _libs: Promise<Map<string, string>> | null = null;

/** Load (once, cached) the TS standard-lib files for in-browser type-checking. */
export function loadTsLibs(): Promise<Map<string, string>> {
  _libs ??= (async () => {
    const ts: any = (await import('typescript')).default ?? (await import('typescript'));
    const vfs: any = await import('@typescript/vfs');
    // Redirect vfs's CDN fetch to our self-hosted copy: it builds canonical CDN URLs
    // and we serve the same file names from /monaco/ts-libs/ on our own origin
    // (honoring a deploy basePath).
    const base = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) || '';
    const fetcher = (url: string) => fetch(`${base}/monaco/ts-libs/${url.split('/').pop()}`);
    // `true` → cache the fetched libs in localStorage for instant reuse.
    return vfs.createDefaultMapFromCDN({ target: ts.ScriptTarget.ES2020 }, ts.version, true, ts, undefined, fetcher);
  })();
  return _libs;
}
