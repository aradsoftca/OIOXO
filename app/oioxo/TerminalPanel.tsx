'use client';
/**
 * oioxo Code — an integrated TERMINAL for any CodeFile[] workspace (GitHub, Build,
 * …). Mounts the project into a WebContainer in the tab and runs real commands
 * (npm install, build, start) with a live preview — host-nothing, in-browser. Needs
 * a cross-origin-isolated Chromium; degrades to a clear message otherwise. Mirrors
 * the folder-mode RunPanel but takes files instead of a disk tree.
 */
import * as React from 'react';
import { Terminal, Play, Loader2 } from 'lucide-react';
import type { CodeFile } from '@/lib/oioxo/codeloop';
import { runSupported, mountTree, onServerReady, run, parseCommand, writeFiles } from '@/lib/oioxo/webcontainer';
import { treeFromFiles } from '@/lib/oioxo/tempfs';

export default function TerminalPanel({ files, onClose }: { files: CodeFile[]; onClose: () => void }) {
  const supported = runSupported();
  const [out, setOut] = React.useState('');
  const [cmd, setCmd] = React.useState('npm install');
  const [running, setRunning] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const termRef = React.useRef<HTMLPreElement>(null);
  React.useEffect(() => { termRef.current?.scrollTo({ top: termRef.current.scrollHeight }); }, [out]);

  const append = (s: string) => setOut((o) => (o + s).slice(-20000));
  // keep a live ref to the latest files so re-runs sync edits into the container
  const filesRef = React.useRef(files);
  filesRef.current = files;

  async function execute() {
    if (running || !supported) return;
    setRunning(true);
    append(`\n$ ${cmd}\n`);
    try {
      if (!mounted) {
        append('Mounting project…\n');
        await mountTree(treeFromFiles(filesRef.current) as unknown as Record<string, unknown>);
        await onServerReady((url) => { setPreview(url); append(`\n▶ server ready: ${url}\n`); });
        setMounted(true);
      } else {
        await writeFiles(filesRef.current); // sync any edits since last run
      }
      const [c, args] = parseCommand(cmd);
      const code = await run(c, args, append);
      append(`\n[exit ${code}]\n`);
    } catch (e) {
      append(`\n✖ ${e instanceof Error ? e.message : 'run failed'}\n`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex max-h-[45%] min-h-[180px] shrink-0 flex-col border-t border-zinc-200 bg-zinc-50">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-200 px-2">
        <Terminal className="h-3.5 w-3.5 text-zinc-500" />
        <form onSubmit={(e) => { e.preventDefault(); void execute(); }} className="flex flex-1 items-center gap-1">
          <span className="text-zinc-400">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            className="flex-1 bg-transparent font-mono text-[12px] text-zinc-700 focus:outline-none"
            placeholder="npm install"
          />
          <button type="submit" disabled={running || !supported} className="flex items-center gap-1 rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-30">
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
          </button>
        </form>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200">✕</button>
      </div>
      <div className="flex min-h-0 flex-1">
        <pre ref={termRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-zinc-900 p-2 font-mono text-[11px] leading-relaxed text-zinc-100">
          {supported ? out || 'Type a command and press Run. First run mounts the project into an in-browser sandbox.'
            : 'In-browser run needs a Chromium browser with cross-origin isolation. The native app runs everywhere.'}
        </pre>
        {preview && (
          <iframe title="preview" src={preview} className="h-full w-1/2 border-l border-zinc-300 bg-white" sandbox="allow-scripts allow-same-origin allow-forms" />
        )}
      </div>
    </div>
  );
}
