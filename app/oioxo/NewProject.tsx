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
  Check, AlertTriangle, Download, ArrowUp, Rocket, FolderDown, Share2, Copy, X, KeyRound, ExternalLink, Square,
} from 'lucide-react';
import type { CodeFile } from '@/lib/oioxo/codeloop';
import { scaffold, templateLabel, type Scaffold } from '@/lib/oioxo/scaffold';
import { MemoryWorkspace } from '@/lib/oioxo/workspace';
import { treeFromFiles } from '@/lib/oioxo/tempfs';
import {
  runSupported, mountTree, onServerReady, run, parseCommand, writeFiles, STATIC_SERVER,
} from '@/lib/oioxo/webcontainer';
import { fsSupported, writeByPath } from '@/lib/oioxo/fs';
import { runPython, pythonSupported } from '@/lib/oioxo/pyodide';
import { runSql, sqlSupported } from '@/lib/oioxo/sqljs';
import { makePreviewRun } from '@/lib/oioxo/preview-oracle';
import type { RunFn } from '@/lib/oioxo/codeloop';
import { saveSession, listSessions, loadSession, deleteSession, newSessionId, type Session } from '@/lib/oioxo/sessions';
import { buildOrFix } from '@/lib/oioxo/codebuild';
import { loadTsLibs } from '@/lib/oioxo/tslibs';
import { downloadFilesZip } from '@/lib/oioxo/zip';
import { runAgent, type PlanStep } from '@/lib/oioxo/agent';
import { makePlanner } from '@/lib/oioxo/planner';
import { recipeFor, type Check as GoalCheck } from '@/lib/oioxo/recipes';
import { searchForError } from '@/lib/oioxo/code-search';
import { useEntitlement } from '@/lib/oioxo/useEntitlement';
import { configureConductor } from '@/lib/oioxo/conductor-engine';
import { getFrontier, setFrontier, frontierChat, PROVIDERS, type FrontierConfig, type Provider } from '@/lib/oioxo/frontier';
import { sendProject, receiveProject, type SharePayload } from '@/lib/oioxo/share';
import type { PeerState } from '@/lib/p2p/peer';
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
  const [autoBuild, setAutoBuild] = React.useState(0); // bumped after a fresh scaffold → auto-build the goal
  const supported = runSupported();
  const logRef = React.useRef<HTMLPreElement>(null);
  React.useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [log]);

  const append = (s: string) => setLog((o) => (o + s).slice(-16000));
  const syncFiles = React.useCallback(async () => setFiles(await ws.current.files()), []);

  // RUNTIME oracle for web/UI/games: the agent verifies by actually running the
  // preview and catching runtime errors (OIOXO_CODE §4) — real signal where the
  // type oracle has almost none. Built only for previewable projects.
  const previewUrlRef = React.useRef<string | null>(null);
  React.useEffect(() => { previewUrlRef.current = preview; }, [preview]);
  // Goal checks (behavioral acceptance) come from the recipe for the goal; the
  // loop drives the build until they pass in the running preview.
  const checksRef = React.useRef<GoalCheck[]>([]);
  React.useEffect(() => { checksRef.current = recipeFor(goal)?.checks ?? []; }, [goal]);
  const previewOracle = React.useMemo<RunFn | undefined>(
    () => (info?.preview && supported
      ? makePreviewRun(() => previewUrlRef.current, () => checksRef.current, (s) => setLog((o) => (o + s).slice(-16000)))
      : undefined),
    [info?.preview, supported],
  );

  /** Load a project (scaffolded or received) into the workspace, mount it, and
   *  bring the preview/oracle up. The single path every entry point goes through. */
  async function bringUp(s: Scaffold) {
    setInfo(s);
    ws.current = new MemoryWorkspace(s.files);
    await syncFiles();
    setActivePath(s.files.find((f) => /index\.html|readme/i.test(f.path))?.path ?? s.files[0]?.path ?? null);

    // Python / SQL projects run in WASM (Pyodide / sql.js), not WebContainer —
    // execute the entry and show output; no install, no cross-origin isolation.
    if (s.runtime === 'python') {
      setPhase('ready');
      if (!pythonSupported()) { append('This browser cannot run Python.\n'); return; }
      append('Starting Python…\n');
      const res = await runPython(s.files, 'main.py', append);
      append(res.ok ? '\n[done]\n' : `\n[error]\n`);
      return;
    }
    if (s.runtime === 'sql') {
      setPhase('ready');
      if (!sqlSupported()) { append('This browser cannot run SQL.\n'); return; }
      append('Starting SQLite…\n');
      const res = await runSql(s.files, 'main.sql', append);
      append(res.ok ? '\n[done]\n' : `\n[error]\n`);
      return;
    }

    if (!supported) { setPhase('ready'); return; } // no sandbox: still edit + build the files

    append('Setting up your project…\n');
    const tree = treeFromFiles(s.files) as Record<string, unknown>;
    // Static projects (web/game) get the built-in zero-install server for an
    // instant preview; api/react start their own server via runCmd.
    if (s.staticServe) (tree as any)[SERVE_FILE] = { file: { contents: STATIC_SERVER } };
    await mountTree(tree);
    await onServerReady((url) => { setPreview(url); append(`\n▶ preview ready\n`); });
    setPhase('ready');

    // Optional one-time setup (e.g. npm install for React/Vite).
    if (s.setup) {
      append('$ ' + s.setup + '\n');
      const [sc, sargs] = parseCommand(s.setup);
      const code = await run(sc, sargs, append);
      if (code !== 0) { append(`\n✖ setup exited ${code}\n`); return; }
    }

    if (s.staticServe) {
      append('$ node ' + SERVE_FILE + '\n');
      void run('node', [SERVE_FILE], append); // long-lived; fires server-ready
    } else if (s.preview) {
      append('$ ' + s.runCmd + '\n');
      void run(...parseCommand(s.runCmd), append); // own server (api/react) — long-lived
    } else {
      append('$ ' + s.runCmd + '\n');
      const [c, args] = parseCommand(s.runCmd);
      const code = await run(c, args, append);
      append(`\n[exit ${code}]\n`);
    }
  }

  /** Scaffold the goal and bring it up. */
  async function start() {
    const g = goal.trim();
    if (!g || phase === 'starting') return;
    setPhase('starting'); setError(null); setLog(''); setPreview(null);
    try {
      await bringUp(scaffold(g));
      setAutoBuild((n) => n + 1); // scaffold is just the start — now actually build the goal
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not start the project');
      setPhase('ready');
    }
  }

  /** Push the workspace's current files into the live sandbox + refresh preview. */
  async function refreshSandbox(changed: CodeFile[]) {
    if (info?.runtime === 'python') {
      append('\n$ python main.py\n');
      const res = await runPython(await ws.current.files(), 'main.py', append);
      append(res.ok ? '\n[done]\n' : '\n[error]\n');
      return;
    }
    if (info?.runtime === 'sql') {
      append('\n$ sqlite main.sql\n');
      const res = await runSql(await ws.current.files(), 'main.sql', append);
      append(res.ok ? '\n[done]\n' : '\n[error]\n');
      return;
    }
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
    sessionId.current = '';
    shareRef.current?.cancel(); shareRef.current = null; liveRef.current = null; setLive(false); setShare(null);
    ws.current = new MemoryWorkspace();
  }

  // --- sessions: persist the project so it survives a refresh / can be resumed ---
  const sessionId = React.useRef<string>('');
  React.useEffect(() => {
    if (phase !== 'ready' || !info || !files.length) return;
    if (!sessionId.current) sessionId.current = newSessionId();
    const t = setTimeout(() => {
      void saveSession({
        id: sessionId.current,
        name: (goal || info.template).slice(0, 60),
        template: info.template, runtime: info.runtime, setup: info.setup,
        runCmd: info.runCmd, preview: info.preview, staticServe: info.staticServe,
        goal, files,
      });
    }, 800); // debounce rapid edits
    return () => clearTimeout(t);
  }, [files, info, goal, phase]);

  /** Resume a saved session: restore its files + metadata and bring it up. */
  async function resume(s: Session) {
    setPhase('starting'); setError(null); setLog(''); setPreview(null); setGoal(s.goal);
    sessionId.current = s.id;
    try {
      await bringUp({
        template: s.template, runtime: s.runtime, setup: s.setup,
        runCmd: s.runCmd, preview: s.preview, staticServe: s.staticServe, files: s.files,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not resume the project');
      setPhase('ready');
    }
  }

  // --- manual file management (a real IDE lets you add/remove files, not just the agent) ---
  const [newName, setNewName] = React.useState('');
  async function addFile() {
    const p = newName.trim().replace(/^\/+/, '');
    if (!p || files.some((f) => f.path === p)) { setNewName(''); return; }
    await ws.current.write(p, '');
    await syncFiles();
    setActivePath(p);
    setNewName('');
    void refreshSandbox([{ path: p, content: '' }]);
    liveRef.current?.sendEdit(p, '');
  }
  async function removeFile(path: string) {
    await ws.current.remove(path);
    await syncFiles();
    if (activePath === path) setActivePath((await ws.current.files())[0]?.path ?? null);
  }

  const [saved, setSaved] = React.useState<'idle' | 'saving' | 'done'>('idle');
  /** Persist the whole Temp project into a real folder the user picks (write-through
   *  to disk — the project is no longer trapped in the tab). Chromium only. */
  async function saveToFolder() {
    const picker = (window as { showDirectoryPicker?: (o?: unknown) => Promise<unknown> }).showDirectoryPicker;
    if (!picker) return;
    setSaved('saving');
    try {
      const root = await picker({ mode: 'readwrite' });
      for (const f of await ws.current.files()) await writeByPath(root, f.path, f.content);
      setSaved('done');
      setTimeout(() => setSaved('idle'), 2500);
    } catch {
      setSaved('idle'); // user cancelled or denied
    }
  }

  // --- recent sessions (shown on the idle screen) ---
  const [recents, setRecents] = React.useState<Session[]>([]);
  React.useEffect(() => { if (phase === 'idle') listSessions().then(setRecents).catch(() => {}); }, [phase]);

  // --- peer-to-peer sharing + live co-editing (browser-to-browser, no upload) ---
  const [share, setShare] = React.useState<null | { room: string; state: PeerState; sent: number; total: number }>(null);
  const shareRef = React.useRef<{ room: string; cancel(): void } | null>(null);
  const [joinCode, setJoinCode] = React.useState('');
  const [joining, setJoining] = React.useState<null | { state: PeerState; received: number; total: number }>(null);
  // The open live channel's edit-broadcaster (set while a share/receive session is
  // active); editor changes are sent through it and remote edits applied below.
  const liveRef = React.useRef<{ sendEdit(p: string, c: string): void } | null>(null);
  const [live, setLive] = React.useState(false);

  /** Apply a peer's edit to the workspace + editor + sandbox (last-write-wins). */
  const applyRemoteEdit = React.useCallback((path: string, content: string) => {
    void ws.current.write(path, content);
    setFiles((cur) => (cur.some((f) => f.path === path) ? cur.map((f) => (f.path === path ? { ...f, content } : f)) : [...cur, { path, content }]));
    void refreshSandbox([{ path, content }]);
  }, []); // refreshSandbox/ws are stable refs

  function startShare() {
    if (share) return;
    const payload: SharePayload = {
      meta: { name: goal.slice(0, 60), template: info?.template, goal, runCmd: info?.runCmd, preview: info?.preview },
      files,
    };
    const handle = sendProject(payload, {
      onState: (state) => { setShare((s) => (s ? { ...s, state } : s)); setLive(state === 'connected'); },
      onProgress: (sent, total) => setShare((s) => (s ? { ...s, sent, total } : s)),
      onRemoteEdit: applyRemoteEdit, // keep the channel live for co-editing
    });
    shareRef.current = handle;
    liveRef.current = handle;
    setShare({ room: handle.room, state: 'connecting', sent: 0, total: files.length });
  }
  function stopShare() { shareRef.current?.cancel(); shareRef.current = null; liveRef.current = null; setLive(false); setShare(null); }

  function join() {
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    setJoining({ state: 'connecting', received: 0, total: 0 });
    const handle = receiveProject(code, {
      onState: (state) => { setJoining((j) => (j ? { ...j, state } : j)); setLive(state === 'connected'); },
      onProgress: (received, total) => setJoining((j) => (j ? { ...j, received, total } : j)),
      onRemoteEdit: applyRemoteEdit, // stay live for co-editing after transfer
      onComplete: async (payload) => {
        setJoining(null);
        setPhase('starting'); setError(null); setLog('');
        try {
          await bringUp({
            template: (payload.meta.template as Scaffold['template']) ?? 'web',
            runCmd: payload.meta.runCmd ?? 'npx --yes serve -l 3111 .',
            preview: payload.meta.preview ?? true,
            files: payload.files,
          });
          if (payload.meta.goal) setGoal(payload.meta.goal);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'could not open the shared project');
          setPhase('ready');
        }
      },
    });
    liveRef.current = handle;
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

          {/* resume a saved project */}
          {recents.length > 0 && (
            <div className="mt-6 border-t border-zinc-200 pt-4 text-left">
              <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Recent projects</p>
              <ul className="mx-auto mt-2 max-w-sm space-y-1">
                {recents.slice(0, 5).map((s) => (
                  <li key={s.id} className="group flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 hover:border-[#E2B24A]">
                    <button type="button" onClick={() => void resume(s)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="truncate text-[13px] text-zinc-700">{s.name || templateLabel(s.template)}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-zinc-400">{templateLabel(s.template)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { void deleteSession(s.id).then(() => setRecents((r) => r.filter((x) => x.id !== s.id))); }}
                      className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100"
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* receive a project someone shared with a code */}
          <div className="mt-6 border-t border-zinc-200 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Got a code?</p>
            {joining ? (
              <div className="mt-2 flex items-center justify-center gap-2 text-[12px] text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {joining.state === 'connecting' && 'Connecting to peer…'}
                {joining.state === 'connected' && (joining.total ? `Receiving ${joining.received}/${joining.total} files…` : 'Connected — receiving…')}
                {joining.state === 'failed' && <span className="text-amber-600">Couldn’t connect. Check the code and that the sender is still open.</span>}
                {(joining.state === 'failed') && (
                  <button type="button" onClick={() => setJoining(null)} className="font-semibold text-zinc-500 hover:underline">cancel</button>
                )}
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); join(); }} className="mx-auto mt-2 flex max-w-xs items-center gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="paste a share code"
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-center text-sm tracking-widest focus:border-[#E2B24A] focus:outline-none"
                />
                <button type="submit" disabled={!joinCode.trim()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  Receive
                </button>
              </form>
            )}
          </div>
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
            <Folder className="h-3.5 w-3.5" /> {info ? templateLabel(info.template) : 'Project'}
          </span>
          <button type="button" onClick={reset} className="rounded p-1 text-zinc-400 hover:bg-zinc-100" title="New project">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {files.map((f) => (
            <div
              key={f.path}
              className={[
                'group flex w-full items-center gap-1.5 rounded px-2 py-1 text-[12px] transition',
                activePath === f.path ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50',
              ].join(' ')}
            >
              <button type="button" onClick={() => setActivePath(f.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="truncate">{f.path}</span>
              </button>
              <button
                type="button"
                onClick={() => void removeFile(f.path)}
                title="Delete file"
                className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition hover:bg-zinc-200 hover:text-rose-600 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); void addFile(); }} className="mt-1 px-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="+ new file (path)"
              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-zinc-600 placeholder:text-zinc-400 hover:border-zinc-200 focus:border-[#E2B24A] focus:outline-none"
            />
          </form>
          <button
            type="button"
            onClick={() => void downloadFilesZip(files, (info?.template ?? 'oioxo') + '-project.zip')}
            className="mt-2 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
          >
            <Download className="h-3.5 w-3.5" /> Download .zip
          </button>
          {fsSupported() && (
            <button
              type="button"
              onClick={() => void saveToFolder()}
              disabled={saved === 'saving'}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
            >
              {saved === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved === 'done' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <FolderDown className="h-3.5 w-3.5" />}
              {saved === 'done' ? 'Saved to folder' : 'Save to folder…'}
            </button>
          )}
          <button
            type="button"
            onClick={startShare}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
          >
            <Share2 className="h-3.5 w-3.5" /> Share live…
          </button>
        </div>
      </aside>

      {share && <SharePopover share={share} onClose={stopShare} />}

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
                liveRef.current?.sendEdit(activePath, next); // co-edit: broadcast to peer
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-zinc-400">Pick a file to edit.</div>
          )}
        </div>
        <AgentRun
          ws={ws.current}
          match={match}
          goal={goal}
          runtime={info?.runtime}
          oracle={previewOracle}
          autoBuild={autoBuild}
          onChanged={async (changed) => {
            await syncFiles();
            await refreshSandbox(changed);
            for (const f of changed) liveRef.current?.sendEdit(f.path, f.content); // co-edit: share agent results
          }}
          onLog={append}
        />
      </main>

      {/* preview / terminal */}
      <section className="flex max-h-72 min-h-[200px] shrink-0 flex-col border-t border-zinc-200 bg-zinc-50 md:max-h-none md:w-[42%] md:border-l md:border-t-0">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-200 px-3 text-xs font-semibold text-zinc-500">
          <span className="flex items-center gap-1.5">
            {info?.preview ? <Play className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
            {info?.preview ? 'Live preview' : info?.runtime === 'python' || info?.runtime === 'sql' ? 'Output' : 'Test output'}
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

type StepState = 'pending' | 'run' | 'ok' | 'fail';

/** Minimal workspace surface the agent strip needs — satisfied by both the Temp
 *  MemoryWorkspace and the GitHubWorkspace, so AgentRun is backend-agnostic. */
export interface AgentWorkspace {
  files(): Promise<CodeFile[]>;
  applyAll(files: CodeFile[]): void;
}

/** The agent strip: type a goal (or press → to build out the project goal), the
 *  on-device coder PLANS the steps, then works them one by one — writing files,
 *  verifying each with the type oracle, and refreshing the preview as it goes.
 *  The visible plan + per-step status is the "frontier agent" surface. */
export function AgentRun({
  ws, match, goal, onChanged, onLog, runtime, oracle, autoBuild,
}: {
  ws: AgentWorkspace;
  match: string[];
  goal: string;
  onChanged: (changed: CodeFile[]) => Promise<void>;
  onLog: (s: string) => void;
  /** 'python'/'sql' verify by running on Pyodide / sql.js; default is the TS type oracle. */
  runtime?: 'node' | 'python' | 'sql';
  /** RUNTIME oracle for previewable projects — run the app, catch runtime errors. */
  oracle?: RunFn;
  /** Bumped by the parent right after a fresh scaffold → auto plan-and-build the
   *  goal (through the brain gate), so "ask for X" actually builds X. */
  autoBuild?: number;
}) {
  const [task, setTask] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [plan, setPlan] = React.useState<PlanStep[]>([]);
  const [states, setStates] = React.useState<StepState[]>([]);
  const [done, setDone] = React.useState<null | { ok: boolean; completed: number; total: number }>(null);
  const [hint, setHint] = React.useState(true);
  // Pro: "thorough" drafts several candidates per step and keeps the one the
  // oracle proves best (more compute → higher success). Free runs single-draft.
  const { tier, pro } = useEntitlement();
  const [thorough, setThorough] = React.useState(false);
  // Gate the specialized conductor (when hosted) to Pro — see conductor-engine.
  React.useEffect(() => { configureConductor({ entitled: pro }); }, [pro]);
  // BYOK: the user's own frontier key drives plan + build when set.
  const [frontier, setFrontierState] = React.useState<FrontierConfig | null>(() => getFrontier());
  const [showKey, setShowKey] = React.useState(false);
  // Brain gate: don't silently download the on-device model — ask first, and
  // recommend the user's own key (much better for real apps). Remembered once.
  const coderReady = React.useRef<boolean>(typeof localStorage !== 'undefined' && localStorage.getItem('oioxo.coderReady') === '1');
  const [showBrain, setShowBrain] = React.useState(false);
  const pendingRun = React.useRef(false);
  const brainReady = () => !!frontier || coderReady.current;
  // Stop: cancel an in-flight agent run.
  const abortRef = React.useRef<AbortController | null>(null);

  // Auto plan-and-build the goal right after a scaffold (gated on a ready brain).
  React.useEffect(() => {
    if (autoBuild && autoBuild > 0) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBuild]);

  async function run() {
    if (busy) return;
    if (!brainReady()) { pendingRun.current = true; setShowBrain(true); return; } // ask before downloading
    const rawGoal = task.trim() || goal;
    const recipe = recipeFor(rawGoal); // ground the small model with the right structure
    const objective = (task.trim() || `Build this out to completion: ${goal}`) + (recipe ? `\n\nGuidance:\n${recipe.guidance}` : '');
    setBusy(true); setPlan([]); setStates([]); setDone(null); setProgress(0); setHint(false);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      // Python/SQL verify by running on their WASM engine; everything else uses
      // the in-browser TS type oracle (no install).
      const libFiles = runtime === 'python' || runtime === 'sql' ? undefined : await loadTsLibs().catch(() => undefined);
      const fc = frontier; // BYOK frontier key drives plan + build when set
      onLog('\n🧠 thinking…\n');
      const planner = makePlanner(match, {
        onProgress: setProgress,
        onToken: (d) => onLog(d), // stream the model's planning tokens → watch it think
        chat: fc ? (s, u) => frontierChat(fc, s, u, { maxTokens: 512 }) : undefined,
      });
      const build = async (
        stepTask: string,
        files: CodeFile[],
        ctx: { goal: string; index: number; total: number },
      ) => {
        // Frame the step with the overall goal + position so the coder keeps the
        // whole project in view (and stays consistent with earlier steps).
        const framed = ctx.total > 1
          ? `${stepTask}\n\n(Step ${ctx.index + 1} of ${ctx.total} toward: "${ctx.goal}". Keep the project consistent and runnable; only change what this step needs.)`
          : stepTask;
        const res = await buildOrFix({
          task: framed, files, match, mode: 'typecheck', libFiles, record: true,
          candidates: thorough && pro ? 3 : 1, // Pro "thorough": best-of-3, oracle-ranked
          coder: fc ? { kind: 'frontier', config: fc } : undefined, // BYOK writer
          run: oracle, // RUNTIME oracle for web/UI/games (else typecheck/python/sql)
          runtime,
          signal: ac.signal, // Stop
          search: (q) => searchForError(q, onLog), // search-when-stuck
          onNote: onLog,
          onProgress: setProgress, onData: onLog,
        });
        return { files: res.files, ok: res.ok, iters: res.iters };
      };

      const gen = runAgent({ goal: objective, files: await ws.files(), plan: planner, build, signal: ac.signal });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
        const ev = next.value;
        if (ev.type === 'plan') {
          setPlan(ev.steps);
          setStates(ev.steps.map(() => 'pending'));
          onLog(`\n▸ Plan (${ev.steps.length} steps):\n` + ev.steps.map((s, i) => `  ${i + 1}. ${s.title}`).join('\n') + '\n');
        } else if (ev.type === 'step-start') {
          setStates((s) => s.map((v, i) => (i === ev.index ? 'run' : v)));
          onLog(`\n→ Step ${ev.index + 1}: ${ev.step.title}\n`);
        } else if (ev.type === 'step-done') {
          setStates((s) => s.map((v, i) => (i === ev.index ? (ev.ok ? 'ok' : 'fail') : v)));
          onLog(`  ${ev.ok ? '✓ verified' : '✗ best effort'} (${ev.iters} ${ev.iters === 1 ? 'try' : 'tries'}, ${ev.changed.length} file${ev.changed.length === 1 ? '' : 's'})\n`);
        } else if (ev.type === 'files') {
          const before = new Map((await ws.files()).map((f) => [f.path, f.content]));
          ws.applyAll(ev.files);
          const changed = ev.files.filter((f) => before.get(f.path) !== f.content);
          await onChanged(changed);
        } else if (ev.type === 'done') {
          setDone({ ok: ev.ok, completed: ev.completed, total: ev.total });
        }
      }
    } catch (e) {
      onLog(`\n✖ ${e instanceof Error ? e.message : 'agent failed'}\n`);
      setDone({ ok: false, completed: 0, total: 0 });
    } finally {
      setBusy(false); setTask(''); setProgress(0); abortRef.current = null;
    }
  }

  function stop() { abortRef.current?.abort(); onLog('\n■ stopping…\n'); }

  const ICON: Record<StepState, React.ReactNode> = {
    pending: <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-300" />,
    run: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#7a5c12]" />,
    ok: <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />,
    fail: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
  };

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white">
      {hint && plan.length === 0 && (
        <p className="px-3 pt-2 text-[11px] text-zinc-400">
          Press → to build the whole project out, or describe a change. The agent plans the steps, writes the files,
          verifies each, and refreshes the preview.
        </p>
      )}
      {plan.length > 0 && (
        <ol className="max-h-32 space-y-0.5 overflow-auto px-3 pt-2">
          {plan.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              {ICON[states[i] ?? 'pending']}
              <span className={states[i] === 'pending' ? 'text-zinc-400' : 'text-zinc-700'}>{s.title}</span>
            </li>
          ))}
        </ol>
      )}
      {done && (
        <div className={['mx-3 mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]', done.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'].join(' ')}>
          {done.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {done.total === 0
            ? 'The agent could not run. Refine and try again.'
            : done.ok
              ? `Done — all ${done.total} steps verified. Preview is live.`
              : `Completed ${done.completed}/${done.total} steps (best effort on the rest). Refine and rerun.`}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-3 pt-2">
        <span
          title={pro ? 'Pro — strongest models, thorough builds, the specialized conductor' : 'Free — full IDE on your device; upgrade for thorough builds + the strongest brain'}
          className={['rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', pro ? 'bg-[#E2B24A]/20 text-[#7a5c12]' : 'bg-zinc-200 text-zinc-500'].join(' ')}
        >
          {tier}
        </span>
        {pro ? (
          <label title="Thorough: draft several candidates per step, keep the one the oracle proves best." className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500">
            <input type="checkbox" checked={thorough} disabled={busy} onChange={(e) => setThorough(e.target.checked)} className="accent-[#E2B24A]" />
            Thorough
          </label>
        ) : (
          <a href="/pricing" className="text-[10px] font-semibold text-[#7a5c12] hover:underline" title="Thorough builds + the strongest on-device brain">
            Thorough builds → Pro
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowKey(true)}
          disabled={busy}
          title={frontier ? `Using your ${frontier.provider} key (${frontier.model}). Click to change.` : 'Use your own frontier API key (OpenAI, Claude, Gemini…) — stays in your browser'}
          className={['flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition', frontier ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-500 hover:bg-zinc-100'].join(' ')}
        >
          <KeyRound className="h-3 w-3" />
          {frontier ? frontier.provider : 'Your key'}
        </button>
      </div>
      {showKey && (
        <FrontierKeyModal
          current={frontier}
          onClose={() => setShowKey(false)}
          onSave={(c) => {
            setFrontier(c); setFrontierState(c); setShowKey(false);
            if (c && pendingRun.current) { pendingRun.current = false; setTimeout(() => void run(), 0); } // continue the build with the new key
          }}
        />
      )}
      {showBrain && (
        <BrainGate
          goal={goal}
          onClose={() => { pendingRun.current = false; setShowBrain(false); }}
          onUseKey={() => { setShowBrain(false); setShowKey(true); }}
          onUseDevice={() => {
            coderReady.current = true;
            try { localStorage.setItem('oioxo.coderReady', '1'); } catch { /* */ }
            setShowBrain(false);
            if (pendingRun.current) { pendingRun.current = false; setTimeout(() => void run(), 0); }
          }}
        />
      )}
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex items-end gap-2 p-2 pt-1.5">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={busy}
          placeholder={`Press → to build out "${goal.slice(0, 38)}", or describe a change`}
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[#E2B24A] focus:outline-none disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-rose-600 px-3 text-[13px] font-semibold text-white transition hover:bg-rose-500"
            aria-label="Stop"
            title="Stop the agent"
          >
            <Square className="h-3.5 w-3.5 fill-current" /> Stop
          </button>
        ) : (
          <button
            type="submit"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E2B24A] text-[#232327] transition hover:brightness-105 disabled:opacity-40"
            aria-label="Build"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </form>
      {busy && progress > 0 && progress < 1 && (
        <div className="px-3 pb-2 text-[11px] text-zinc-400">loading coder… {Math.round(progress * 100)}%</div>
      )}
    </div>
  );
}

/** The share-code popover: shows the code to hand to a peer + live transfer state.
 *  The project streams browser-to-browser the moment they enter it — no upload. */
function SharePopover({
  share, onClose,
}: {
  share: { room: string; state: PeerState; sent: number; total: number };
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(share.room); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900"><Share2 className="h-4 w-4" /> Share this project</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[12px] text-zinc-500">
          Give this code to someone (in oioxo → Build a project → “Got a code?”). The files transfer directly
          between your browsers — nothing is uploaded.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
          <code className="flex-1 select-all text-center text-lg font-bold tracking-[0.3em] text-zinc-900">{share.room}</code>
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-zinc-700">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
          {share.state === 'connected' ? (
            share.total && share.sent >= share.total
              ? <><Check className="h-3.5 w-3.5 text-green-600" /> Sent {share.total} files — edits now sync both ways live.</>
              : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connected — sending {share.sent}/{share.total}…</>
          ) : share.state === 'failed' ? (
            <span className="text-amber-600">Connection failed — close and try sharing again.</span>
          ) : (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for someone to enter the code…</>
          )}
        </div>
      </div>
    </div>
  );
}

/** Bring-your-own frontier key: pick a provider, model and key (stored only in
 *  this browser). When set, the agent plans + builds with that model instead of
 *  the on-device coder — same verified loop, frontier-grade writer. */
function FrontierKeyModal({
  current, onClose, onSave,
}: {
  current: FrontierConfig | null;
  onClose: () => void;
  onSave: (c: FrontierConfig | null) => void;
}) {
  const [provider, setProvider] = React.useState<Provider>(current?.provider ?? 'openrouter');
  const [model, setModel] = React.useState(current?.model ?? PROVIDERS.openrouter.defaultModel);
  const [key, setKey] = React.useState(current?.key ?? '');
  const [baseURL, setBaseURL] = React.useState(current?.baseURL ?? '');
  const spec = provider === 'custom' ? null : PROVIDERS[provider];

  function pickProvider(p: Provider) {
    setProvider(p);
    if (p !== 'custom') setModel(PROVIDERS[p].defaultModel);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900"><KeyRound className="h-4 w-4" /> Use your own model</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[12px] text-zinc-500">
          Plug in a frontier API key to drive the agent with it. The key stays in this browser and calls go straight
          to the provider — oioxo never sees it.
        </p>

        <label className="mt-4 block text-[11px] font-semibold text-zinc-500">Provider</label>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {(['openrouter', 'openai', 'anthropic', 'groq', 'google', 'custom'] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pickProvider(p)}
              className={['rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition', provider === p ? 'border-[#E2B24A] bg-[#E2B24A]/10 text-[#7a5c12]' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'].join(' ')}
            >
              {p === 'custom' ? 'Custom' : PROVIDERS[p].label.split(' ')[0]}
            </button>
          ))}
        </div>

        {provider === 'custom' && (
          <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://… (OpenAI-compatible base URL)" className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] focus:border-[#E2B24A] focus:outline-none" />
        )}

        <label className="mt-3 block text-[11px] font-semibold text-zinc-500">Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 font-mono text-[12px] focus:border-[#E2B24A] focus:outline-none" />

        <label className="mt-3 flex items-center justify-between text-[11px] font-semibold text-zinc-500">
          API key
          {spec && <a href={spec.keysUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-zinc-400 hover:text-zinc-600">get a key <ExternalLink className="h-3 w-3" /></a>}
        </label>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 font-mono text-[12px] focus:border-[#E2B24A] focus:outline-none" />

        <div className="mt-4 flex items-center justify-between gap-2">
          {current ? (
            <button type="button" onClick={() => onSave(null)} className="text-[12px] font-semibold text-rose-600 hover:underline">Remove key</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-zinc-500 hover:bg-zinc-100">Cancel</button>
            <button
              type="button"
              disabled={!key.trim() || !model.trim()}
              onClick={() => onSave({ provider, model: model.trim(), key: key.trim(), baseURL: baseURL.trim() || undefined })}
              className="rounded-lg bg-[#E2B24A] px-3 py-1.5 text-[13px] font-semibold text-[#232327] disabled:opacity-40"
            >
              Use this model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shown before the first on-device build: don't silently download a model — ask,
 *  and recommend the user's own key (a 0.6B on-device coder can't build, say, a
 *  full game; a frontier key can). Remembered once chosen. */
function BrainGate({
  goal, onClose, onUseKey, onUseDevice,
}: {
  goal: string;
  onClose: () => void;
  onUseKey: () => void;
  onUseDevice: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900"><Sparkles className="h-4 w-4 text-[#7a5c12]" /> Pick a brain to build this</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[12px] text-zinc-500">
          Building “{goal.slice(0, 60) || 'your project'}” needs a model to plan and write the code. It then runs on
          your device, checks its own work, and fixes errors until it works. Asked once.
        </p>

        <button
          type="button"
          onClick={onUseDevice}
          className="mt-4 w-full rounded-xl border-2 border-[#E2B24A] bg-[#E2B24A]/10 p-3 text-left transition hover:bg-[#E2B24A]/20"
        >
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#7a5c12]"><Sparkles className="h-4 w-4" /> Build on your device — private &amp; free</div>
          <div className="mt-0.5 text-[12px] text-zinc-600">
            A small model runs entirely in your browser; the loop runs + verifies + repairs the code until it works.
            One-time download, then offline. Nothing is uploaded.
          </div>
        </button>

        <button
          type="button"
          onClick={onUseKey}
          className="mt-2 w-full rounded-xl border border-zinc-200 p-3 text-left transition hover:border-zinc-300"
        >
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-800"><KeyRound className="h-4 w-4" /> Or use your own API key — optional</div>
          <div className="mt-0.5 text-[12px] text-zinc-500">
            Plug in OpenAI / Claude / Gemini / Groq / OpenRouter to make the writer faster on big jobs. Same loop, your
            key stays in the browser.
          </div>
        </button>

        <button type="button" onClick={onClose} className="mt-3 w-full text-center text-[12px] font-semibold text-zinc-400 hover:text-zinc-600">
          Not now
        </button>
      </div>
    </div>
  );
}
