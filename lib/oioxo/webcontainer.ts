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
