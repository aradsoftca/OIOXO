'use client';
/**
 * oioxo Code — editor TAB STRIP (VS Code-style). Open files stay as tabs so
 * switching files doesn't lose your place; a red dot marks files with diagnostics.
 */
import * as React from 'react';
import { X, File as FileIcon, AlertCircle } from 'lucide-react';

export default function EditorTabs({
  open, active, errorPaths, dirtyPaths, onSelect, onClose,
}: {
  open: string[];
  active: string | null;
  /** Paths that currently have ≥1 diagnostic (red dot). */
  errorPaths?: Set<string>;
  /** Paths with unsaved changes (amber dot). */
  dirtyPaths?: Set<string>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  if (open.length === 0) return null;
  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-zinc-200 bg-zinc-50">
      {open.map((path) => {
        const isActive = path === active;
        const name = path.split('/').pop() ?? path;
        const hasErr = errorPaths?.has(path.replace(/\\/g, '/'));
        const isDirty = dirtyPaths?.has(path);
        return (
          <div
            key={path}
            onClick={() => onSelect(path)}
            title={path}
            className={[
              'group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-zinc-200 px-3 text-[12px] transition',
              isActive ? 'bg-white font-medium text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100',
            ].join(' ')}
          >
            {hasErr ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" /> : isDirty ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" /> : <FileIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
            <span className="max-w-[140px] truncate">{name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(path); }}
              className="rounded p-0.5 text-zinc-300 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100"
              aria-label={`Close ${name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
