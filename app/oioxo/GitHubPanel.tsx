'use client';

/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §3) — the GitHub workspace surface. Paste a
 * fine-grained PAT (stored only in this browser), open any repo you can reach,
 * let the on-device agent build/fix against it, then commit + push back as one
 * clean commit. Host-nothing: every call goes straight to api.github.com.
 */
import * as React from 'react';
import {
  Github, Loader2, KeyRound, File as FileIcon, GitCommit, Check, AlertTriangle, LogOut, ExternalLink,
} from 'lucide-react';
import type { CodeFile } from '@/lib/oioxo/codeloop';
import {
  getToken, setToken, parseRepoRef, openGitHubWorkspace, type GitHubWorkspace,
} from '@/lib/oioxo/github';
import CodeEditor from './CodeEditor';
import { AgentRun } from './NewProject';

export default function GitHubPanel({ match }: { match: string[] }) {
  const [token, setTok] = React.useState<string | null>(() => getToken());
  const [tokenInput, setTokenInput] = React.useState('');
  const [repoInput, setRepoInput] = React.useState('');
  const [ws, setWs] = React.useState<GitHubWorkspace | null>(null);
  const [repoLabel, setRepoLabel] = React.useState('');
  const [files, setFiles] = React.useState<CodeFile[]>([]);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(0);
  const [pushing, setPushing] = React.useState(false);
  const [pushed, setPushed] = React.useState<string | null>(null);
  const [log, setLog] = React.useState('');
  const append = (s: string) => setLog((o) => (o + s).slice(-12000));

  function saveToken() {
    const t = tokenInput.trim();
    if (!t) return;
    setToken(t); setTok(t); setTokenInput('');
  }
  function signOut() {
    setToken(null); setTok(null); setWs(null); setFiles([]); setActivePath(null); setRepoLabel('');
  }

  async function open() {
    const ref = parseRepoRef(repoInput);
    if (!ref || !token) { setError('Enter a repo like owner/name or a github.com URL.'); return; }
    setLoading(true); setError(null); setWs(null); setPushed(null);
    try {
      const w = await openGitHubWorkspace(token, ref);
      setWs(w);
      setRepoLabel(`${ref.owner}/${ref.repo}@${w.branch}`);
      const fs = await w.files();
      setFiles(fs);
      setActivePath(fs.find((f) => /readme/i.test(f.path))?.path ?? fs[0]?.path ?? null);
      setPending(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not open the repo');
    } finally {
      setLoading(false);
    }
  }

  const sync = React.useCallback(async () => {
    if (!ws) return;
    setFiles(await ws.files());
    setPending(ws.pending().length);
  }, [ws]);

  async function commitPush() {
    if (!ws || pushing) return;
    setPushing(true); setError(null);
    try {
      const res = await ws.push(`oioxo: ${repoLabel.split('@')[0]} — agent changes`);
      if (res) { setPushed(res.sha.slice(0, 7)); setPending(0); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'push failed');
    } finally {
      setPushing(false);
    }
  }

  // --- token gate ---
  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900">
            <Github className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900">Connect GitHub</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            Paste a fine-grained personal access token with <strong>Contents: read &amp; write</strong> on the repos you
            want. It stays in this browser only — oioxo never sees it.
          </p>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-zinc-300 bg-white p-1.5 focus-within:border-zinc-900">
            <KeyRound className="ml-1 h-4 w-4 shrink-0 text-zinc-400" />
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveToken(); }}
              placeholder="github_pat_…"
              className="flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={saveToken}
              disabled={!tokenInput.trim()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Connect
            </button>
          </div>
          <a
            href="https://github.com/settings/tokens?type=beta"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-600"
          >
            Create a token <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  // --- repo open prompt ---
  if (!ws) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <h2 className="text-lg font-bold text-zinc-900">Open a repository</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">Paste a repo to load it into the agent workspace.</p>
          <form
            onSubmit={(e) => { e.preventDefault(); void open(); }}
            className="mt-5 flex items-center gap-2 rounded-xl border border-zinc-300 bg-white p-1.5 focus-within:border-zinc-900"
          >
            <Github className="ml-1 h-4 w-4 shrink-0 text-zinc-400" />
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              autoFocus
              placeholder="owner/repo  ·  or  https://github.com/owner/repo"
              className="flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none"
            />
            <button type="submit" disabled={loading || !repoInput.trim()} className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Open'}
            </button>
          </form>
          {error && <p className="mt-3 text-[12px] text-amber-600">{error}</p>}
          <button type="button" onClick={signOut} className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-600">
            <LogOut className="h-3 w-3" /> Disconnect GitHub
          </button>
        </div>
      </div>
    );
  }

  // --- the workspace ---
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="flex max-h-40 shrink-0 flex-col border-b border-zinc-200 md:max-h-none md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="flex items-center gap-1 truncate text-xs font-semibold text-zinc-600" title={repoLabel}>
            <Github className="h-3.5 w-3.5 shrink-0" /> {repoLabel}
          </span>
          <button type="button" onClick={() => setWs(null)} className="shrink-0 rounded px-1 text-[11px] text-zinc-400 hover:bg-zinc-100" title="Open another repo">↻</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setActivePath(f.path)}
              className={['flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] transition', activePath === f.path ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'].join(' ')}
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3">
          <span className="truncate text-xs text-zinc-500">{activePath ?? 'Select a file'}</span>
          <div className="flex items-center gap-2">
            {pushed && <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600"><Check className="h-3.5 w-3.5" /> pushed {pushed}</span>}
            <button
              type="button"
              onClick={() => void commitPush()}
              disabled={pushing || pending === 0}
              className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-30"
              title={pending === 0 ? 'No changes to push' : `Commit + push ${pending} changed file(s)`}
            >
              {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
              Commit &amp; push{pending > 0 ? ` (${pending})` : ''}
            </button>
          </div>
        </div>
        {error && (
          <div className="m-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {activePath ? (
            <CodeEditor
              value={files.find((f) => f.path === activePath)?.content ?? ''}
              filename={activePath.split('/').pop() ?? activePath}
              onChange={(next) => {
                setFiles((cur) => cur.map((f) => (f.path === activePath ? { ...f, content: next } : f)));
                void ws.write(activePath, next).then(() => setPending(ws.pending().length));
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-zinc-400">Pick a file to edit.</div>
          )}
        </div>
        <AgentRun
          ws={ws}
          match={match}
          goal={`improve ${repoLabel.split('@')[0]}`}
          onChanged={async () => { await sync(); }}
          onLog={append}
        />
        {log && (
          <pre className="max-h-24 shrink-0 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-zinc-900 p-2 font-mono text-[10px] leading-snug text-zinc-300">{log}</pre>
        )}
      </main>
    </div>
  );
}
