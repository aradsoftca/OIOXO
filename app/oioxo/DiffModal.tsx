'use client';
/**
 * oioxo Code — DIFF REVIEW. Shows what changed between two file sets (e.g. a saved
 * version → now, so you can review the agent's edits) as a real side-by-side Monaco
 * diff, with one-click revert. Self-hosted Monaco (loader configured in CodeEditor).
 */
import * as React from 'react';
import dynamic from 'next/dynamic';
import { X, RotateCcw, FilePlus, FileMinus, FileText } from 'lucide-react';
import type { CodeFile } from '@/lib/oioxo/codeloop';

const DiffEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-zinc-400">Loading diff…</div>,
});

const LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown', py: 'python', sql: 'sql', yml: 'yaml', yaml: 'yaml',
};
const langFor = (p: string) => LANG[p.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext';

type Status = 'added' | 'removed' | 'modified';
interface Change { path: string; status: Status; before: string; after: string; }

/** Diff two file sets → only the changed files. */
function changeset(oldFiles: CodeFile[], newFiles: CodeFile[]): Change[] {
  const a = new Map(oldFiles.map((f) => [f.path, f.content]));
  const b = new Map(newFiles.map((f) => [f.path, f.content]));
  const out: Change[] = [];
  for (const [path, after] of b) {
    if (!a.has(path)) out.push({ path, status: 'added', before: '', after });
    else if (a.get(path) !== after) out.push({ path, status: 'modified', before: a.get(path)!, after });
  }
  for (const [path, before] of a) if (!b.has(path)) out.push({ path, status: 'removed', before, after: '' });
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

const DOT: Record<Status, React.ReactNode> = {
  added: <FilePlus className="h-3.5 w-3.5 text-green-600" />,
  removed: <FileMinus className="h-3.5 w-3.5 text-rose-600" />,
  modified: <FileText className="h-3.5 w-3.5 text-amber-600" />,
};

export default function DiffModal({
  title, oldFiles, newFiles, onClose, onRevert,
}: {
  title: string;
  oldFiles: CodeFile[];
  newFiles: CodeFile[];
  onClose: () => void;
  /** Revert everything back to `oldFiles` (the "reject" action). */
  onRevert?: () => void;
}) {
  const changes = React.useMemo(() => changeset(oldFiles, newFiles), [oldFiles, newFiles]);
  const [sel, setSel] = React.useState(0);
  const cur = changes[sel];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5">
          <h3 className="truncate text-sm font-bold text-zinc-900">{title}</h3>
          <div className="flex items-center gap-2">
            {onRevert && changes.length > 0 && (
              <button type="button" onClick={onRevert} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700 hover:bg-rose-100">
                <RotateCcw className="h-3.5 w-3.5" /> Revert all
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {changes.length === 0 ? (
          <div className="grid flex-1 place-items-center text-sm text-zinc-400">No differences.</div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="w-56 shrink-0 overflow-auto border-r border-zinc-200 p-1">
              {changes.map((c, i) => (
                <button
                  key={c.path}
                  type="button"
                  onClick={() => setSel(i)}
                  title={c.path}
                  className={['flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px]', i === sel ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'].join(' ')}
                >
                  {DOT[c.status]}
                  <span className="truncate">{c.path}</span>
                </button>
              ))}
            </aside>
            <div className="min-h-0 flex-1">
              {cur && (
                <DiffEditor
                  original={cur.before}
                  modified={cur.after}
                  language={langFor(cur.path)}
                  theme="light"
                  height="100%"
                  options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, automaticLayout: true, scrollBeyondLastLine: false }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
