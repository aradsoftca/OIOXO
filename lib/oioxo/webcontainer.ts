/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo — in-browser code execution via WebContainers. Boots a Node sandbox in
 * the tab, mounts the user's opened folder, and runs commands (npm install, dev
 * server) with live output + a preview URL. Requires cross-origin isolation
 * (our COOP/COEP headers are already set) and a Chromium browser.
 *
 * One container per page (WebContainer.boot is single-instance). Everything is
 * dynamically imported so the heavy runtime only loads when the user runs code.
 */
let _wc: any = null;
let _booting: Promise<any> | null = null;

export function runSupported(): boolean {
  return typeof window !== 'undefined' && (window as any).crossOriginIsolated === true;
}

export async function boot(): Promise<any> {
  if (_wc) return _wc;
  if (!runSupported()) throw new Error('In-browser run needs a cross-origin-isolated Chromium browser.');
  _booting ??= (async () => {
    const { WebContainer } = await import('@webcontainer/api');
    _wc = await WebContainer.boot();
    return _wc;
  })();
  return _booting;
}

/** Mount a FileSystemTree (from fs.snapshotTree) into the sandbox root. */
export async function mountTree(tree: any): Promise<void> {
  const wc = await boot();
  await wc.mount(tree);
}

/** Hot-write changed files into the running container (no remount), creating any
 *  missing parent dirs. Powers the agent updating a live preview in place. */
export async function writeFiles(files: { path: string; content: string }[]): Promise<void> {
  const wc = await boot();
  for (const f of files) {
    const p = f.path.replace(/\\/g, '/').replace(/^\.?\//, '');
    const dir = p.split('/').slice(0, -1).join('/');
    if (dir) await wc.fs.mkdir(dir, { recursive: true });
    await wc.fs.writeFile(p, f.content);
  }
}

/** A tiny zero-install static server, mounted alongside a web project so its
 *  preview comes up instantly (no `npm install serve`). Listens on PORT (3111)
 *  and serves the project root; SPA-friendly (falls back to index.html). */
export const STATIC_SERVER = `import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const root = process.cwd();
const TYPES = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.wasm':'application/wasm','.map':'application/json' };
http.createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await readFile(join(root, p));
    res.setHeader('content-type', TYPES[extname(p)] || 'application/octet-stream');
    res.end(buf);
  } catch {
    try { const buf = await readFile(join(root, 'index.html')); res.setHeader('content-type','text/html'); res.end(buf); }
    catch { res.statusCode = 404; res.end('not found'); }
  }
}).listen(3111, () => console.log('preview ready on 3111'));
`;

/** Subscribe to the dev-server URL (fires when a server starts inside). */
export async function onServerReady(cb: (url: string) => void): Promise<void> {
  const wc = await boot();
  wc.on('server-ready', (_port: number, url: string) => cb(url));
}

/** Run one command, streaming stdout/stderr to onData; resolves with exit code. */
export async function run(cmd: string, args: string[], onData: (chunk: string) => void): Promise<number> {
  const wc = await boot();
  const proc = await wc.spawn(cmd, args);
  proc.output.pipeTo(
    new WritableStream({
      write(data: string) {
        onData(data);
      },
    }),
  );
  return proc.exit as Promise<number>;
}

/** Parse a shell-ish command line into [cmd, ...args] (simple whitespace split). */
export function parseCommand(line: string): [string, string[]] {
  const parts = line.trim().split(/\s+/);
  return [parts[0], parts.slice(1)];
}
