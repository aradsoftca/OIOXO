'use client';
import * as React from 'react';
import { Download, Loader2, ArrowLeft, ArrowRight, RotateCcw, FlipVertical } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, reorderPages, download, type PdfInfo } from '@/engines/pdf';

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [order, setOrder] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = async (it: PdfFileItem) => {
    setItem(it); setError('');
    try {
      const i = await getPdfInfo(it.buffer);
      setInfo(i);
      setOrder(Array.from({ length: i.pageCount }, (_, k) => k));
    } catch (e) { setError((e as Error).message); }
  };

  const move = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  };

  const reset = () => info && setOrder(Array.from({ length: info.pageCount }, (_, k) => k));
  const reverse = () => setOrder([...order].reverse());

  const run = async () => {
    if (!item || !info) return;
    setBusy(true); setError('');
    try {
      const out = await reorderPages(item.buffer, order);
      download(out, item.file.name.replace(/\.pdf$/i, '') + '-reordered.pdf');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const changed = order.some((v, i) => v !== i);

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={load} />}

      {item && info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{info.pageCount} pages</span>
            <button type="button" onClick={() => { setItem(null); setInfo(null); setOrder([]); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change PDF</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">New order</div>
                <div className="flex gap-1">
                  <button type="button" onClick={reverse}
                    className="flex items-center gap-1 border border-black/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:border-[var(--color-cat-pdf)] hover:text-[var(--color-cat-pdf)]">
                    <FlipVertical className="h-3 w-3" /> Reverse
                  </button>
                  <button type="button" onClick={reset} disabled={!changed}
                    className="flex items-center gap-1 border border-black/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:border-[var(--color-cat-pdf)] hover:text-[var(--color-cat-pdf)] disabled:opacity-30">
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                </div>
              </div>
              <ul className="space-y-1 max-h-[480px] overflow-y-auto">
                {order.map((pageIdx, i) => (
                  <li key={i} className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-canvas)] px-3 py-1.5">
                    <span className="font-mono text-[11px] text-[var(--color-fg-muted)] w-8">#{i + 1}</span>
                    <span className="font-mono text-[12px] text-[var(--color-fg)] flex-1">Original page {pageIdx + 1}</span>
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)}
                      className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">
                      <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button type="button" disabled={i === order.length - 1} onClick={() => move(i, 1)}
                      className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">
                      <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <aside>
              <button type="button" onClick={run} disabled={busy || !changed}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Saving…' : 'Save Reordered PDF'}
              </button>
              {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
