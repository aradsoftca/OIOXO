'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, deletePages, parseRange, download, type PdfInfo } from '@/engines/pdf';

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [pages, setPages] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = async (it: PdfFileItem) => {
    setItem(it); setError('');
    try { setInfo(await getPdfInfo(it.buffer)); }
    catch (e) { setError((e as Error).message); }
  };

  const parsed = info ? parseRange(pages, info.pageCount) : [];

  const run = async () => {
    if (!item || !info || parsed.length === 0) return;
    if (parsed.length >= info.pageCount) {
      setError('Cannot delete all pages.'); return;
    }
    setBusy(true); setError('');
    try {
      const out = await deletePages(item.buffer, parsed);
      download(out, item.file.name.replace(/\.pdf$/i, '') + '-trimmed.pdf');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={load} />}

      {item && info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{info.pageCount} pages</span>
            <button type="button" onClick={() => { setItem(null); setInfo(null); setPages(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change PDF</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <label className="block">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Pages to delete</div>
                <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="2, 5-7, 10"
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-pdf)]" />
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Use commas and dashes. Pages are 1-indexed.</div>
              </label>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1">
                {Array.from({ length: info.pageCount }, (_, i) => {
                  const willDelete = parsed.includes(i);
                  return (
                    <div key={i}
                      className={`flex aspect-[3/4] items-center justify-center border text-[11px] font-mono ${willDelete ? 'border-red-500 bg-red-50 text-red-600 line-through' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
            <aside className="space-y-2">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</div>
                <div className="mt-1 font-mono text-[20px] tabular-nums font-bold">{info.pageCount - parsed.length}</div>
                <div className="text-[11px] text-[var(--color-fg-muted)]">pages will remain</div>
              </div>
              <button type="button" onClick={run} disabled={busy || parsed.length === 0}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Working…' : 'Delete & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
