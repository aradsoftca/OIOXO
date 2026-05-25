'use client';

/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §4) — "build me X" → a RUNNING project with a
 * live preview, not a code block in a chat. This is the from-nothing surface:
 *   goal → scaffold a runnable starter → mount in a sandbox → preview instantly
 *        → the on-device agent builds it out (writes files, verifies) → preview refreshes.
 *
 * The project lives in a MemoryWorkspace (Temp backend: no disk, nothing hosted).
 * Running + preview compose the WebContainer; the agent reuses the verified loop.
 */
import * as React from 'react';
import {
  Sparkles, Loader2, Play, RefreshCw, File as FileIcon, Folder, Wrench,
  Check, AlertTriangle, Download, ArrowUp, Rocket,
} from 'lucide-react';
import type { CodeFile } from '@/lib/oioxo/codeloop';
import { scaffold, type Scaffold } from '@/lib/oioxo/scaffold';
import { MemoryWorkspace } from '@/lib/oioxo/workspace';
import { treeFromFiles } from '@/lib/oioxo/tempfs';
import {
  runSupported, mountTree, onServerReady, run, parseCommand, writeFiles, STATIC_SERVER,
} from '@/lib/oioxo/webcontainer';
import { buildOrFix } from '@/lib/oioxo/codebuild';
import { loadTsLibs } from '@/lib/oioxo/tslibs';
import { downloadFilesZip } from '@/lib/oioxo/zip';
import CodeEditor from './CodeEditor';

type Phase = 'idle' | 'starting' | 'ready';

const SERVE_FILE = '.oioxo-serve.mjs'; // mounted only into the sandbox, not the project

export default function NewProject({ match }: { match: string[] }) {
  const ws = React.useRef(new MemoryWorkspace());
  const [goal, setGoal] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [info, setInfo] = React.useState<Scaffold | null>(null);
  const [files, setFiles] = React.useState<CodeFile[]>([]);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [previewKey, setPreviewKey] = React.useState(0); // bump to reload the iframe
  const [log, setLog] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const supported = runSupported();
  const logRef = React.useRef<HTMLPreElement>(null);
  React.useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [log]);

  const append = (s: string) => setLog((o) => (o + s).slice(-16000));
  const syncFiles = React.useCallback(async () => setFiles(await ws.current.files()), []);

  /** Scaffold the goal, mount it, and bring the preview/oracle up. */
  async function start() {
    const g = goal.trim();
    if (!g || phase === 'starting') return;
    setPhase('starting'); setError(null); setLog(''); setPreview(null);
    try {
      const s = scaffold(g);
      setInfo(s);
      ws.current = new MemoryWorkspace(s.files);
      await syncFiles();
      setActivePath(s.files[0]?.path ?? null);

      if (!supported) { setPhase('ready'); return; } // no sandbox: still edit + build the files

      append('Setting up your project…\n');
      const tree = treeFromFiles(s.files) as Record<string, unknown>;
      if (s.preview) (tree as any)[SERVE_FILE] = { file: { contents: STATIC_SERVER } };
      await mountTree(tree);
      await onServerReady((url) => { setPreview(url); append(`\n▶ preview ready\n`); });

      setPhase('ready');
      if (s.preview) {
        append('$ node ' + SERVE_FILE + '\n');
        void run('node', [SERVE_FILE], append); // long-lived; fires server-ready
      } else {
        append('$ ' + s.runCmd + '\n');
        const [c, args] = parseCommand(s.runCmd);
        const code = await run(c, args, append);
        append(`\n[exit ${code}]\n`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not start the project');
      setPhase('ready');
    }
  }

  /** Push the workspace's current files into the live sandbox + refresh preview. */
  async function refreshSandbox(changed: CodeFile[]) {
    if (!supported) return;
    try {
      await writeFiles(changed);
      if (info?.preview) setPreviewKey((k) => k + 1); // reload iframe
      else if (info) { // re-run the oracle (tests) so the terminal reflects the change
        append('\n$ ' + info.runCmd + '\n');
        const [c, args] = parseCommand(info.runCmd);
        const code = await run(c, args, append);
        append(`\n[exit ${code}]\n`);
      }
    } catch (e) {
      append(`\n✖ ${e instanceof Error ? e.message : 'sandbox update failed'}\n`);
    }
  }

  function reset() {
    setPhase('idle'); setInfo(null); setFiles([]); setActivePath(null);
    setPreview(null); setLog(''); setError(null); setGoal('');
    ws.current = new MemoryWorkspace();
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E2B24A]/15">
            <Rocket className="h-6 w-6 text-[#7a5c12]" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900">Build a project</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            Describe what you want. oioxo scaffolds a real, runnable project, previews it live, and
            builds it out on your device — nothing is uploaded.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); void start(); }}
            className="mt-5 flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 text-left focus-within:border-[#E2B24A]"
          >
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void start(); } }}
              rows={2}
              autoFocus
              placeholder="e.g. a pomodoro timer with a circular progress ring, or a CLI that renames files by date"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-zinc-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!goal.trim()}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#E2B24A] px-3 text-sm font-semibold text-[#232327] transition hover:brightness-105 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" /> Start
            </button>
          </form>
          {!supported && (
            <p className="mt-3 text-[11px] text-amber-600">
              Live preview needs a Chromium browser (Chrome/Edge/Brave). You can still scaffold + build files here;
              the native app previews everywhere.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* file tree */}
      <aside className="flex max-h-40 shrink-0 flex-col border-b border-zinc-200 md:max-h-none md:w-52 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="flex items-center gap-1 truncate text-xs font-semibold text-zinc-500">
            <Folder className="h-3.5 w-3.5" /> {info?.template === 'node' ? 'Node project' : 'Web project'}
          </span>
          <button type="button" onClick={reset} className="rounded p-1 text-zinc-400 hover:bg-zinc-100" title="New project">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setActivePath(f.path)}
              className={[
                'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] transition',
                activePath === f.path ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50',
              ].join(' ')}
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void downloadFilesZip(files, (info?.template ?? 'oioxo') + '-project.zip')}
            className="mt-2 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
          >
            <Download className="h-3.5 w-3.5" /> Download project
          </button>
        </div>
      </aside>

      {/* editor + agent */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center border-b border-zinc-200 px-3 text-xs text-zinc-500">
          {activePath ?? 'Select a file'}
        </div>
        <div className="min-h-0 flex-1">
          {activePath ? (
            <CodeEditor
              value={files.find((f) => f.path === activePath)?.content ?? ''}
              filename={activePath.split('/').pop() ?? activePath}
              onChange={(next) => {
                setFiles((cur) => cur.map((f) => (f.path === activePath ? { ...f, content: next } : f)));
                void ws.current.write(activePath, next);
                void refreshSandbox([{ path: activePath, content: next }]);
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-zinc-400">Pick a file to edit.</div>
          )}
        </div>
        <BuildOut
          ws={ws.current}
          match={match}
          goal={goal}
          onChanged={async (changed) => { await syncFiles(); await refreshSandbox(changed); }}
          onLog={append}
        />
      </main>

      {/* preview / terminal */}
      <section className="flex max-h-72 min-h-[200px] shrink-0 flex-col border-t border-zinc-200 bg-zinc-50 md:max-h-none md:w-[42%] md:border-l md:border-t-0">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-200 px-3 text-xs font-semibold text-zinc-500">
          <span className="flex items-center gap-1.5">
            {info?.preview ? <Play className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
            {info?.preview ? 'Live preview' : 'Test output'}
          </span>
          {preview && (
            <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="rounded p-1 text-zinc-400 hover:bg-zinc-200" title="Reload">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {error && (
          <div className="m-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {info?.preview && preview ? (
          <iframe
            key={previewKey}
            title="preview"
            src={preview}
            className="min-h-0 flex-1 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
          />
        ) : info?.preview && phase === 'starting' ? (
          <div className="grid flex-1 place-items-center text-sm text-zinc-400">
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Bringing your preview up…</span>
          </div>
        ) : (
          <pre ref={logRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-zinc-900 p-2 font-mono text-[11px] leading-relaxed text-zinc-100">
            {log || (supported ? 'Starting…' : 'Live run needs a Chromium browser. Files still build here.')}
          </pre>
        )}
        {/* a slim terminal strip under a live web preview, so output is still visible */}
        {info?.preview && (preview || log) && (
          <pre ref={info?.preview ? undefined : logRef} className="max-h-24 shrink-0 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-zinc-900 p-2 font-mono text-[10px] leading-snug text-zinc-300">
            {log}
          </pre>
        )}
      </section>
    </div>
  );
}

/** The "build it out" agent strip: type what to add/fix, the on-device coder edits
 *  the project's files and verifies (type oracle), then the preview refreshes. */
function BuildOut({
  ws, match, goal, onChanged, onLog,
}: {
  ws: MemoryWorkspace;
  match: string[];
  goal: string;
  onChanged: (changed: CodeFile[]) => Promise<void>;
  onLog: (s: string) => void;
}) {
  const [task, setTask] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [steps, setSteps] = React.useState<{ attempt: number; ok: boolean }[]>([]);
  const [done, setDone] = React.useState<null | { ok: boolean; iters: number; changed: number }>(null);
  const [hint, setHint] = React.useState(true);

  async function run() {
    const t = task.trim() || `Build this out: ${goal}`;
    if (busy) return;
    setBusy(true); setSteps([]); setDone(null); setProgress(0); setHint(false);
    try {
      const before = await ws.files();
      const orig = new Map(before.map((f) => [f.path, f.content]));
      const libFiles = await loadTsLibs().catch(() => undefined); // type oracle (no install)
      const res = await buildOrFix({
        task: t,
        files: before,
        match,
        mode: 'typecheck',
        libFiles,
        record: false,
        onProgress: setProgress,
        onStep: (s) => setSteps((p) => [...p, { attempt: s.attempt, ok: s.ok }]),
        onData: onLog,
      });
      const changed = res.files.filter((f) => orig.get(f.path) !== f.content);
      ws.applyAll(res.files);
      await onChanged(changed);
      setDone({ ok: res.ok, iters: res.iters, changed: changed.length });
    } catch (e) {
      onLog(`\n✖ ${e instanceof Error ? e.message : 'agent failed'}\n`);
      setDone({ ok: false, iters: 0, changed: 0 });
    } finally {
      setBusy(false); setTask('');
    }
  }

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white">
      {hint && (
        <p className="px-3 pt-2 text-[11px] text-zinc-400">
          The starter is running. Tell the agent what to add — it writes the files, verifies, and refreshes the preview.
        </p>
      )}
      {steps.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {steps.map((s, i) => (
            <span key={i} className={['rounded px-1.5 py-0.5 text-[10px] font-medium', s.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'].join(' ')}>
              try {s.attempt + 1} {s.ok ? '✓' : '✗'}
            </span>
          ))}
        </div>
      )}
      {done && (
        <div className={['mx-3 mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]', done.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'].join(' ')}>
          {done.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {done.ok
            ? `Updated ${done.changed} file${done.changed === 1 ? '' : 's'}, verified in ${done.iters} ${done.iters === 1 ? 'try' : 'tries'}.`
            : `Applied a best effort (${done.changed} file${done.changed === 1 ? '' : 's'}). Refine and try again.`}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex items-end gap-2 p-2">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={busy}
          placeholder={`Add a feature, fix something, or press → to build out: "${goal.slice(0, 40)}"`}
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[#E2B24A] focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E2B24A] text-[#232327] transition hover:brightness-105 disabled:opacity-40"
          aria-label="Build"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
      {busy && progress > 0 && progress < 1 && (
        <div className="px-3 pb-2 text-[11px] text-zinc-400">loading coder… {Math.round(progress * 100)}%</div>
      )}
    </div>
  );
}
