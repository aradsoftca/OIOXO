'use client';

import * as React from 'react';
import { Upload, Download, X, Loader2 } from 'lucide-react';
import { zipFiles, formatBytes } from '@/engines/archive';

interface Item { file: File }

export default function ArchiveZipTool() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [name, setName] = React.useState('archive');
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[]) => {
    const list = Array.from(files).map((file) => ({ file }));
    setItems((prev) => [...prev, ...list]);
  };
  const removeAt = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const build = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      const files = await Promise.all(items.map(async (it) => ({ name: it.file.name, data: new Uint8Array(await it.file.arrayBuffer()) })));
      const blob = await zipFiles(files);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (name.trim() || 'archive') + '.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  };

  const total = items.reduce((s, it) => s + it.file.size, 0);

  return (
    <div className="space-y-4">
      <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) add(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-5">
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
          <Upload className="h-4 w-4" /> Drop files to add, or click to browse
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="max-h-[400px] overflow-y-auto border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <span>{items.length} files · {formatBytes(total)}</span>
              <button type="button" onClick={() => setItems([])} className="hover:text-[var(--color-fg)]">Clear</button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-black/[0.04] px-3 py-2 last:border-b-0">
                <span className="flex-1 truncate font-mono text-[12px] text-[var(--color-fg)]">{it.file.name}</span>
                <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{formatBytes(it.file.size)}</span>
                <button type="button" onClick={() => removeAt(i)} className="text-[var(--color-fg-muted)] hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <aside className="space-y-3">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">ZIP name</span>
              <div className="mt-1 flex items-center border border-black/[0.08] bg-[var(--color-surface-2)]">
                <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 bg-transparent px-2.5 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none" />
                <span className="px-2 font-mono text-[12px] text-[var(--color-fg-muted)]">.zip</span>
              </div>
            </label>
            <button type="button" onClick={build} disabled={busy}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download ZIP
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
