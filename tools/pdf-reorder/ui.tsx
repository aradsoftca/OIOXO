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
  // Page thumbnails keyed by ORIGINAL page index (rendered once on load).
  const [thumbs, setThumbs] = React.useState<Record<number, string>>({});
  const dragFrom = React.useRef<number | null>(null);

  const load = async (it: PdfFileItem) => {
    setItem(it); setError(''); setThumbs({});
    try {
      const i = await getPdfInfo(it.buffer);
      setInfo(i);
      setOrder(Array.from({ length: i.pageCount }, (_, k) => k));
      // Render low-res page thumbnails so reordering is visual, not a text list.
      (async () => {
        try {
          const { rasterizePdf } = await import('@/engines/pdf/rasterize');
          const pages = await rasterizePdf(it.buffer.slice(0), { maxEdge: 220 });
          const map: Record<number, string> = {};
          for (const p of pages) map[p.index] = p.canvas.toDataURL('image/jpeg', 0.7);
          setThumbs(map);
        } catch { /* thumbnails are best-effort; the text list still works */ }
      })();
    } catch (e) { setError((e as Error).message); }
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    const next = [...order];
    const [v] = next.splice(from, 1);
    next.splice(to, 0, v);
    setOrder(next);
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
              <div className="grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                {order.map((pageIdx, i) => (
                  <div key={i}
                    draggable
                    onDragStart={() => { dragFrom.current = i; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) moveTo(dragFrom.current, i); dragFrom.current = null; }}
                    className="group relative cursor-grab overflow-hidden border border-black/[0.08] bg-[var(--color-canvas)]">
                    <div className="aspect-[3/4] w-full bg-white">
                      {thumbs[pageIdx]
                        ? <img src={thumbs[pageIdx]} alt={`Page ${pageIdx + 1}`} className="h-full w-full object-contain" />
                        : <div className="flex h-full w-full items-center justify-center font-mono text-[11px] text-[var(--color-fg-subtle)]">p{pageIdx + 1}</div>}
                    </div>
                    <div className="flex items-center justify-between px-1.5 py-1 text-[10px]">
                      <span className="font-mono text-[var(--color-fg-muted)]">#{i + 1} · p{pageIdx + 1}</span>
                      <span className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} title="Move earlier"
                          className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-20"><ArrowLeft className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={i === order.length - 1} onClick={() => move(i, 1)} title="Move later"
                          className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-20"><ArrowRight className="h-3.5 w-3.5" /></button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-[var(--color-fg-subtle)]">Drag a page to reorder, or use the arrows.</div>
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
