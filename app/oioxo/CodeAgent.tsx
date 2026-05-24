'use client';

import * as React from 'react';
import { FolderOpen, File as FileIcon, Folder, Save, Sparkles, ArrowUp, Loader2, AlertTriangle, Check, Play, Terminal, Wrench } from 'lucide-react';
import { fsSupported, openFolder, readFileText, writeFileText, writeByPath, isTextFile, snapshotTree, filesFromTree, type FileNode } from '@/lib/oioxo/fs';
import { buildOrFix } from '@/lib/oioxo/codebuild';
import { SKILLS } from '@/lib/oioxo/skills';
import { chatStream } from '@/lib/oioxo/runtime';
import { runSupported, mountTree, onServerReady, run, parseCommand } from '@/lib/oioxo/webcontainer';
import { useSkill } from '@/lib/oioxo/useSkills';
import SkillPanel from './SkillPanel';

export default function CodeAgent() {
  const { installed } = useSkill('code');
  if (!installed) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SkillPanel skillId="code" />
      </div>
    );
  }
  return <CodeWorkspace modelId={installed} />;
}

function CodeWorkspace({ modelId }: { modelId: string }) {
  const match = SKILLS.code.models.find((m) => m.id === modelId)?.webllmMatch ?? ['Coder'];
  const [rootName, setRootName] = React.useState<string | null>(null);
  const [rootHandle, setRootHandle] = React.useState<unknown>(null);
  const [tree, setTree] = React.useState<FileNode[] | null>(null);
  const [active, setActive] = React.useState<{ node: FileNode; content: string } | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showRun, setShowRun] = React.useState(false);
  const [showAgent, setShowAgent] = React.useState(false);
  const supported = fsSupported();

  async function pickFolder() {
    try {
      const res = await openFolder();
      if (res) {
        setRootName(res.name);
        setRootHandle(res.root);
        setTree(res.tree);
        setActive(null);
      }
    } catch {
      /* user cancelled */
    }
  }

  async function openFile(node: FileNode) {
    if (!isTextFile(node.name)) {
      setActive({ node, content: '/* binary or unsupported file */' });
      setDirty(false);
      return;
    }
    const content = await readFileText(node.handle);
    setActive({ node, content });
    setDirty(false);
  }

  async function save() {
    if (!active || !dirty) return;
    setSaving(true);
    try {
      await writeFileText(active.node.handle, active.content);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  if (!supported) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="mt-3 max-w-sm text-sm text-zinc-600">
          Opening a local folder needs a Chromium browser (Chrome, Edge, Brave). The oioxo native app
          supports editing on every platform.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* file tree */}
      <aside className="flex max-h-48 shrink-0 flex-col border-b border-zinc-200 md:max-h-none md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="truncate text-xs font-semibold text-zinc-500">{rootName ?? 'No folder'}</span>
          <button
            type="button"
            onClick={pickFolder}
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-zinc-700"
          >
            <FolderOpen className="h-3.5 w-3.5" /> Open
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {tree ? (
            <Tree nodes={tree} onOpen={openFile} activePath={active?.node.path} depth={0} />
          ) : (
            <p className="px-2 py-4 text-xs text-zinc-400">Open a folder to start editing.</p>
          )}
        </div>
      </aside>

      {/* editor */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-200 px-3">
          <span className="truncate text-xs text-zinc-500">
            {active ? active.node.path : 'Select a file'} {dirty && <span className="text-amber-500">•</span>}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </button>
            <button
              type="button"
              onClick={() => setShowRun((v) => !v)}
              disabled={!tree}
              className={[
                'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:opacity-30',
                showRun ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
              ].join(' ')}
            >
              <Play className="h-3.5 w-3.5" /> Run
            </button>
            <button
              type="button"
              onClick={() => setShowAgent((v) => !v)}
              disabled={!tree}
              className={[
                'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:opacity-30',
                showAgent ? 'bg-[#E2B24A] text-[#232327]' : 'text-zinc-600 hover:bg-zinc-100',
              ].join(' ')}
            >
              <Wrench className="h-3.5 w-3.5" /> Build / Fix
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {active ? (
            <textarea
              value={active.content}
              onChange={(e) => {
                setActive({ ...active, content: e.target.value });
                setDirty(true);
              }}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-white p-3 font-mono text-[13px] leading-relaxed text-zinc-800 focus:outline-none"
            />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-zinc-400">Open a file to edit it.</div>
          )}
          {showRun && tree && <RunPanel tree={tree} onClose={() => setShowRun(false)} />}
          {showAgent && tree && (
            <AgentPanel tree={tree} root={rootHandle} match={match} onClose={() => setShowAgent(false)} />
          )}
        </div>
      </main>

      {/* coder chat */}
      <CoderChat
        match={match}
        root={rootHandle}
        fileName={active?.node.name}
        fileContent={active?.content}
        onApply={
          active
            ? (code) => {
                setActive((cur) => (cur ? { ...cur, content: code } : cur));
                setDirty(true);
              }
            : undefined
        }
      />
    </div>
  );
}

/** Pull the first fenced code block out of a model reply (drops the lang line). */
function extractCodeBlock(text: string): string | null {
  const m = text.match(/```[a-zA-Z0-9+\-.]*\n([\s\S]*?)```/);
  return m ? m[1].replace(/\n$/, '') : null;
}

/** Parse multi-file output: `FILE: path` lines each followed by a fenced block. */
function parseFiles(text: string): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = [];
  const re = /FILE:\s*([^\n`]+?)\s*\n```[a-zA-Z0-9+\-.]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ path: m[1].trim(), code: m[2].replace(/\n$/, '') });
  return out;
}

/** In-browser run: mount the folder into a WebContainer and execute commands. */
function RunPanel({ tree, onClose }: { tree: FileNode[]; onClose: () => void }) {
  const supported = runSupported();
  const [out, setOut] = React.useState('');
  const [cmd, setCmd] = React.useState('npm install');
  const [running, setRunning] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const termRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [out]);

  function append(s: string) {
    setOut((o) => (o + s).slice(-20000)); // cap terminal buffer
  }

  async function execute() {
    if (running) return;
    setRunning(true);
    append(`\n$ ${cmd}\n`);
    try {
      if (!mounted) {
        append('Mounting project…\n');
        const snap = await snapshotTree(tree);
        await mountTree(snap);
        await onServerReady((url) => {
          setPreview(url);
          append(`\n▶ server ready: ${url}\n`);
        });
        setMounted(true);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            execute();
          }}
          className="flex flex-1 items-center gap-1"
        >
          <span className="text-zinc-400">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            className="flex-1 bg-transparent font-mono text-[12px] text-zinc-700 focus:outline-none"
            placeholder="npm install"
          />
          <button
            type="submit"
            disabled={running || !supported}
            className="flex items-center gap-1 rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-30"
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
          </button>
        </form>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200">
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <pre
          ref={termRef}
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-zinc-900 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
        >
          {supported ? out || 'Type a command and press Run. First run mounts your folder into a sandbox.' : ''}
          {!supported && 'In-browser run needs a Chromium browser with cross-origin isolation. The native app runs everywhere.'}
        </pre>
        {preview && (
          <iframe
            title="preview"
            src={preview}
            className="h-full w-1/2 border-l border-zinc-300 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>
    </div>
  );
}

function Tree({
  nodes,
  onOpen,
  activePath,
  depth,
}: {
  nodes: FileNode[];
  onOpen: (n: FileNode) => void;
  activePath?: string;
  depth: number;
}) {
  return (
    <ul>
      {nodes.map((n) =>
        n.kind === 'dir' ? (
          <DirItem key={n.path} node={n} onOpen={onOpen} activePath={activePath} depth={depth} />
        ) : (
          <li key={n.path}>
            <button
              type="button"
              onClick={() => onOpen(n)}
              style={{ paddingLeft: depth * 12 + 8 }}
              className={[
                'flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[12px] transition',
                activePath === n.path ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50',
              ].join(' ')}
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function DirItem({ node, onOpen, activePath, depth }: { node: FileNode; onOpen: (n: FileNode) => void; activePath?: string; depth: number }) {
  const [open, setOpen] = React.useState(depth < 1);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: depth * 12 + 8 }}
        className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="truncate">{node.name}</span>
      </button>
      {open && node.children && <Tree nodes={node.children} onOpen={onOpen} activePath={activePath} depth={depth + 1} />}
    </li>
  );
}

interface CMsg { role: 'user' | 'assistant'; text: string }

function CoderChat({
  match,
  root,
  fileName,
  fileContent,
  onApply,
}: {
  match: string[];
  root?: unknown;
  fileName?: string;
  fileContent?: string;
  onApply?: (code: string) => void;
}) {
  const [msgs, setMsgs] = React.useState<CMsg[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [load, setLoad] = React.useState<number | null>(null);
  const [applied, setApplied] = React.useState<Record<string, 'ok' | 'err'>>({});

  async function applyFile(path: string, code: string) {
    if (!root) return;
    try {
      await writeByPath(root, path, code);
      setApplied((s) => ({ ...s, [path]: 'ok' }));
    } catch {
      setApplied((s) => ({ ...s, [path]: 'err' }));
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setBusy(true);
    try {
      const ctx = fileName
        ? `The user is editing "${fileName}". Current contents:\n\n${(fileContent ?? '').slice(0, 4000)}\n\n`
        : '';
      let acc = '';
      for await (const delta of chatStream(
        match,
        [
          {
            role: 'system',
            content:
              'You are a concise coding assistant inside oioxo. Be brief and correct. ' +
              'To create or edit files, output EACH file as a line `FILE: <relative/path>` immediately followed by a fenced code block containing that file\'s COMPLETE new contents (one FILE block per file). ' +
              'For a small tweak to the currently open file you may instead reply with a single fenced code block. End with a one-line summary.',
          },
          { role: 'user', content: ctx + text },
        ],
        { onProgress: (p) => setLoad(p < 1 ? p : null), maxTokens: 640 },
      )) {
        acc += delta;
        setMsgs((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: 'assistant', text: acc };
          return copy;
        });
      }
      if (!acc) {
        setMsgs((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: 'assistant', text: '(no response)' };
          return copy;
        });
      }
    } catch (err) {
      const msg = `Error: ${err instanceof Error ? err.message : 'failed'}`;
      setMsgs((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: 'assistant', text: msg };
        return copy;
      });
    } finally {
      setBusy(false);
      setLoad(null);
    }
  }

  return (
    <aside className="flex max-h-72 shrink-0 flex-col border-t border-zinc-200 md:max-h-none md:w-80 md:border-l md:border-t-0">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-zinc-200 px-3 text-xs font-semibold text-zinc-600">
        <Sparkles className="h-3.5 w-3.5" /> Coding agent
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <p className="text-xs text-zinc-400">
            Ask about the open file, request a change, or describe what to build. Runs on your device.
          </p>
        )}
        {msgs.map((m, i) => {
          const files = m.role === 'assistant' ? parseFiles(m.text) : [];
          const code = m.role === 'assistant' && files.length === 0 ? extractCodeBlock(m.text) : null;
          return (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <div
                className={[
                  'inline-block max-w-full whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-[13px] leading-relaxed',
                  m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800',
                ].join(' ')}
              >
                {m.text}
              </div>
              {files.length > 0 && !!root && (
                <div className="mt-2 space-y-1.5">
                  {files.map((f) => (
                    <div key={f.path} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                      <span className="truncate font-mono text-[11px] text-zinc-600">{f.path}</span>
                      <button
                        type="button"
                        onClick={() => applyFile(f.path, f.code)}
                        className={[
                          'flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition',
                          applied[f.path] === 'ok'
                            ? 'bg-emerald-100 text-emerald-700'
                            : applied[f.path] === 'err'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500',
                        ].join(' ')}
                      >
                        <Check className="h-3 w-3" />
                        {applied[f.path] === 'ok' ? 'Saved' : applied[f.path] === 'err' ? 'Failed' : 'Apply'}
                      </button>
                    </div>
                  ))}
                  {files.length > 1 && (
                    <button
                      type="button"
                      onClick={() => files.forEach((f) => applyFile(f.path, f.code))}
                      className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-zinc-700"
                    >
                      Apply all {files.length} files
                    </button>
                  )}
                </div>
              )}
              {code && onApply && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => onApply(code)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
                  >
                    <Check className="h-3.5 w-3.5" /> Apply to editor
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {busy && (load != null || msgs[msgs.length - 1]?.text === '') && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {load != null ? `Loading model ${Math.round(load * 100)}%` : 'Thinking…'}
          </div>
        )}
      </div>
      <form onSubmit={ask} className="shrink-0 border-t border-zinc-200 p-2">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-300 bg-white p-1.5 focus-within:border-zinc-400">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) ask(e);
            }}
            rows={1}
            placeholder="Ask the coder…"
            className="max-h-28 min-h-[2rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] placeholder:text-zinc-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-30"
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}

/** The execute→repair loop as a panel: describe a task, the on-device coder drafts,
 *  the WebContainer runs the tests, errors feed back until green — then changed
 *  files are written to disk. The "device proves it" surface. */
function AgentPanel({ tree, root, match, onClose }: { tree: FileNode[]; root: unknown; match: string[]; onClose: () => void }) {
  const [task, setTask] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [steps, setSteps] = React.useState<{ attempt: number; ok: boolean }[]>([]);
  const [log, setLog] = React.useState('');
  const [result, setResult] = React.useState<null | { ok: boolean; iters: number; changed: number; error?: string }>(null);
  const logRef = React.useRef<HTMLPreElement>(null);
  React.useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [log]);

  async function run() {
    if (!task.trim() || busy) return;
    setBusy(true); setSteps([]); setLog(''); setResult(null); setProgress(0);
    try {
      const files = await filesFromTree(tree);
      const original = new Map(files.map((f) => [f.path, f.content]));
      const res = await buildOrFix({
        task: task.trim(),
        files,
        match,
        onProgress: (p) => setProgress(p),
        onStep: (s) => setSteps((prev) => [...prev, { attempt: s.attempt, ok: s.ok }]),
        onData: (c) => setLog((prev) => (prev + c).slice(-8000)),
      });
      let changed = 0;
      for (const f of res.files) {
        if (original.get(f.path) !== f.content) {
          try { await writeByPath(root, f.path, f.content); changed++; } catch { /* skip unwritable */ }
        }
      }
      setResult({ ok: res.ok, iters: res.iters, changed });
    } catch (e) {
      setResult({ ok: false, iters: 0, changed: 0, error: String((e as Error)?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
          <Wrench className="h-3.5 w-3.5 text-[#E2B24A]" /> Agent — build or fix on-device
        </span>
        <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-600">close</button>
      </div>
      <div className="flex gap-2 px-3 pb-2">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
          placeholder="e.g. make the failing tests pass / fix the build error"
          disabled={busy}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] focus:border-zinc-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !task.trim()}
          className="flex items-center gap-1 rounded-lg bg-[#E2B24A] px-3 py-1.5 text-[13px] font-semibold text-[#232327] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Run
        </button>
      </div>
      {busy && progress > 0 && progress < 1 && (
        <div className="px-3 pb-1 text-[11px] text-zinc-500">loading coder… {Math.round(progress * 100)}%</div>
      )}
      {steps.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {steps.map((s, i) => (
            <span
              key={i}
              className={['rounded px-1.5 py-0.5 text-[10px] font-medium', s.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'].join(' ')}
            >
              try {s.attempt + 1} {s.ok ? '✓ pass' : '✗ fail'}
            </span>
          ))}
        </div>
      )}
      {log && (
        <pre ref={logRef} className="mx-3 mb-2 max-h-32 overflow-auto rounded-lg bg-zinc-900 p-2 font-mono text-[11px] leading-relaxed text-zinc-100">{log}</pre>
      )}
      {result && (
        <div className={['mx-3 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]', result.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'].join(' ')}>
          {result.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            {result.error
              ? `Couldn't run: ${result.error}`
              : result.ok
                ? `Done — green after ${result.iters} ${result.iters === 1 ? 'try' : 'tries'}. Wrote ${result.changed} file${result.changed === 1 ? '' : 's'}.`
                : `Couldn't get it green in ${result.iters} tries. Wrote ${result.changed} (best effort) — refine the task and retry.`}
          </span>
        </div>
      )}
    </div>
  );
}
