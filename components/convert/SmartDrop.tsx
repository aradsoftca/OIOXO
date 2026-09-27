'use client';

import * as React from 'react';
import Link from 'next/link';
import { Upload, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { TileIcon } from '@/components/tiles/TileIcon';
import { CATEGORIES } from '@/lib/registry/types';
import {
  detectKind, suggestForFile, suggestForQuery,
  type FileKind, type ToolSuggestion,
} from '@/lib/convert/intent';

const KIND_LABEL: Record<FileKind, string> = {
  image: 'image', audio: 'audio file', video: 'video', pdf: 'PDF',
  font: 'font', text: 'text file', unknown: 'file',
};

function SuggestionCard({ s }: { s: ToolSuggestion }) {
  const cat = CATEGORIES[s.tool.category];
  return (
    <Link prefetch={false}
      href={`/tools/${s.tool.id}`}
      className="group flex items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] px-3.5 py-3 transition hover:border-[var(--color-cat-convert)] hover:bg-[var(--color-surface-2)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ background: `var(${cat.colorVar})` }}>
        <TileIcon name={s.tool.icon} size={16} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[var(--color-fg)]">{s.tool.name}</div>
        <div className="truncate text-[11px] text-[var(--color-fg-muted)]">{s.tool.blurb}</div>
      </div>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)] group-hover:text-[var(--color-cat-convert)]">
        Open →
      </span>
    </Link>
  );
}

export function SmartDrop() {
  const [dragging, setDragging] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [fileResult, setFileResult] = React.useState<{ name: string; kind: FileKind; suggestions: ToolSuggestion[] } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setQuery('');
    const { kind, suggestions } = suggestForFile({ name: file.name, type: file.type, size: file.size });
    setFileResult({ name: file.name, kind, suggestions });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const querySuggestions = React.useMemo(() => query.trim() ? suggestForQuery(query, 8) : [], [query]);

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={cn(
          'relative flex flex-col items-center justify-center gap-4 border-2 border-dashed px-6 py-12 text-center transition',
          dragging ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)]/5' : 'border-black/[0.14] bg-[var(--color-surface-1)]',
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center bg-[var(--color-cat-convert)]/10">
          <Upload className="h-6 w-6 text-[var(--color-cat-convert)]" />
        </div>
        <div>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="text-[18px] font-semibold tracking-tight text-[var(--color-fg)] hover:underline underline-offset-4">
            Drop any file to see what you can do
          </button>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
            Images, audio, video, PDFs, fonts — we&apos;ll suggest the right tools. Files stay on your device.
          </p>
        </div>

        {/* Smart search */}
        <div className="flex w-full max-w-md items-center gap-2 border border-black/[0.1] bg-[var(--color-surface-2)] px-3 py-2">
          <Search className="h-4 w-4 text-[var(--color-fg-subtle)]" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (e.target.value) setFileResult(null); }}
            placeholder="…or describe a task: “make my video smaller”"
            className="flex-1 bg-transparent text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
        </div>

        <input ref={inputRef} type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      {/* File-based suggestions */}
      {fileResult && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-cat-convert)]" />
            {fileResult.suggestions.length > 0 ? (
              <span>What you can do with this {KIND_LABEL[fileResult.kind]} — <span className="font-mono text-[var(--color-fg)]">{fileResult.name}</span></span>
            ) : (
              <span>We don&apos;t have a tool for <span className="font-mono text-[var(--color-fg)]">{fileResult.name}</span> yet. Try the search above.</span>
            )}
          </div>
          {fileResult.suggestions.length > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {fileResult.suggestions.map((s) => <SuggestionCard key={s.tool.id} s={s} />)}
            </div>
          )}
        </div>
      )}

      {/* Query-based suggestions */}
      {query.trim() && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-cat-convert)]" />
            {querySuggestions.length > 0 ? <span>Best matches for “{query}”</span> : <span>No tools match “{query}” — try different words.</span>}
          </div>
          {querySuggestions.length > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {querySuggestions.map((s) => <SuggestionCard key={s.tool.id} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
