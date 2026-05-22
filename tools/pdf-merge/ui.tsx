'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { mergePdfs, download } from '@/engines/pdf';

export default function Tool() {
  const [items, setItems] = React.useState<PdfFileItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [name, setName] = React.useState('merged');

  const run = async () => {
    if (items.length < 2) { setError('Add at least 2 PDFs.'); return; }
    setBusy(true); setError('');
    try {
      const out = await mergePdfs(items.map((it) => it.buffer));
      download(out, `${name || 'merged'}.pdf`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PdfDrop multiple items={items} onItemsChange={setItems} />

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Output</div>
            <div className="text-[16px] font-bold">{name || 'merged'}.pdf</div>
            <div className="text-[12px] text-[var(--color-fg-muted)]">
              {items.length} file{items.length === 1 ? '' : 's'} → 1 PDF · {(items.reduce((s, it) => s + it.file.size, 0) / 1024).toFixed(0)} KB total
            </div>
          </div>
          <aside className="space-y-3">
            <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Filename</div>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-pdf)]" />
            </label>
            <button type="button" onClick={run} disabled={busy || items.length < 2}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy ? 'Merging…' : 'Merge & Download'}
            </button>
            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
