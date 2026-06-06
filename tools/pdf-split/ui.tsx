'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, splitEveryPage, splitPdf, parseRange, download, type PdfInfo } from '@/engines/pdf';

type Mode = 'every' | 'ranges' | 'pick';

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [mode, setMode] = React.useState<Mode>('every');
  const [ranges, setRanges] = React.useState('1-3, 4-6');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [thumbs, setThumbs] = React.useState<Record<number, string>>({}); // by 0-based page
  const [picked, setPicked] = React.useState<Set<number>>(new Set());     // 0-based pages

  const load = async (it: PdfFileItem) => {
    setItem(it);
    setError(''); setThumbs({}); setPicked(new Set());
    try {
      setInfo(await getPdfInfo(it.buffer));
      (async () => {
        try {
          const { rasterizePdf } = await import('@/engines/pdf/rasterize');
          const pages = await rasterizePdf(it.buffer.slice(0), { maxEdge: 220 });
          const map: Record<number, string> = {};
          for (const p of pages) map[p.index] = p.canvas.toDataURL('image/jpeg', 0.7);
          setThumbs(map);
        } catch { /* picker thumbnails best-effort */ }
      })();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const togglePage = (p: number) => setPicked((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const run = async () => {
    if (!item || !info) return;
    setBusy(true); setError('');
    try {
      const baseName = item.file.name.replace(/\.pdf$/i, '');
      let outputs: Uint8Array[];
      let labels: string[];

      if (mode === 'pick') {
        const pages = [...picked].sort((a, b) => a - b);
        if (!pages.length) { setError('Select at least one page.'); setBusy(false); return; }
        // splitPdf takes 0-based page-index arrays; one output = the picked pages.
        outputs = await splitPdf(item.buffer, [pages]);
        labels = [`${baseName}-selected-${pages.length}p.pdf`];
      } else if (mode === 'every') {
        outputs = await splitEveryPage(item.buffer);
        labels = outputs.map((_, i) => `${baseName}-page-${i + 1}.pdf`);
      } else {
        const rangeStrs = ranges.split(',').map((s) => s.trim()).filter(Boolean);
        const parsed = rangeStrs.map((r) => parseRange(r, info.pageCount)).filter((r) => r.length);
        if (!parsed.length) { setError('No valid page ranges.'); setBusy(false); return; }
        outputs = await splitPdf(item.buffer, parsed);
        labels = rangeStrs.map((r) => `${baseName}-${r.replace(/\s/g, '')}.pdf`);
      }

      outputs.forEach((bytes, i) => download(bytes, labels[i]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={load} />}

      {item && info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{info.pageCount} pages</span>
            <button type="button" onClick={() => { setItem(null); setInfo(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change PDF</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Split mode</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['every', 'ranges', 'pick'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${mode === m ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {m === 'every' ? 'Every page' : m === 'ranges' ? 'Custom ranges' : 'Pick pages'}
                  </button>
                ))}
              </div>

              {mode === 'pick' && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
                    <span>Tap pages to include ({picked.size})</span>
                    <button type="button" onClick={() => setPicked(new Set(Array.from({ length: info.pageCount }, (_, i) => i)))} className="text-[var(--color-cat-pdf)]">All</button>
                  </div>
                  <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
                    {Array.from({ length: info.pageCount }, (_, p) => (
                      <button key={p} type="button" onClick={() => togglePage(p)}
                        className={`relative overflow-hidden border-2 ${picked.has(p) ? 'border-[var(--color-cat-pdf)]' : 'border-black/[0.08]'}`}>
                        <div className="aspect-[3/4] bg-white">
                          {thumbs[p]
                            ? <img src={thumbs[p]} alt={`Page ${p + 1}`} className="h-full w-full object-contain" />
                            : <div className="flex h-full w-full items-center justify-center font-mono text-[11px] text-[var(--color-fg-subtle)]">p{p + 1}</div>}
                        </div>
                        <span className={`absolute left-1 top-1 rounded px-1 text-[9px] font-bold ${picked.has(p) ? 'bg-[var(--color-cat-pdf)] text-white' : 'bg-black/40 text-white'}`}>{p + 1}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Selected pages export as one PDF, in page order.</div>
                </div>
              )}

              {mode === 'ranges' && (
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Ranges (comma-separated)</div>
                  <input value={ranges} onChange={(e) => setRanges(e.target.value)}
                    placeholder="1-3, 4-6, 7"
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-pdf)]" />
                  <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Each range becomes one PDF.</div>
                </label>
              )}
              <div className="text-[12px] text-[var(--color-fg-muted)]">
                {mode === 'every'
                  ? `→ ${info.pageCount} files`
                  : mode === 'pick'
                  ? `→ 1 file (${picked.size} page${picked.size === 1 ? '' : 's'})`
                  : `→ ${ranges.split(',').filter((s) => s.trim()).length} files`}
              </div>
            </div>
            <aside>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Splitting…' : 'Split & Download'}
              </button>
              {error && <div className="mt-2 text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
