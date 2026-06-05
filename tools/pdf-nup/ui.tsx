'use client';
import * as React from 'react';
import { Loader2, Download, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { downloadBlob } from '@/engines/ffmpeg';

const LAYOUTS: { n: number; cols: number; rows: number; label: string }[] = [
  { n: 2, cols: 1, rows: 2, label: '2-up' }, { n: 4, cols: 2, rows: 2, label: '4-up' },
  { n: 6, cols: 2, rows: 3, label: '6-up' }, { n: 9, cols: 3, rows: 3, label: '9-up' },
];
const A4 = { w: 595.28, h: 841.89 }; // points, portrait

export default function PdfNup() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [layout, setLayout] = React.useState(LAYOUTS[1]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const { guard, gate } = useUsageGate('pdf');

  const run = async () => {
    if (!item) return;
    if (!(await guard({ bytes: item.file.size }))) return;
    setBusy(true); setError('');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const src = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const idx = src.getPageIndices();
      const embedded = await out.embedPdf(item.buffer, idx);
      const { cols, rows, n } = layout;
      const margin = 18, gap = 10;
      const cellW = (A4.w - margin * 2 - gap * (cols - 1)) / cols;
      const cellH = (A4.h - margin * 2 - gap * (rows - 1)) / rows;
      for (let i = 0; i < embedded.length; i += n) {
        const page = out.addPage([A4.w, A4.h]);
        for (let k = 0; k < n && i + k < embedded.length; k++) {
          const emb = embedded[i + k];
          const col = k % cols, row = Math.floor(k / cols);
          const scale = Math.min(cellW / emb.width, cellH / emb.height);
          const w = emb.width * scale, h = emb.height * scale;
          const x = margin + col * (cellW + gap) + (cellW - w) / 2;
          const yTop = margin + row * (cellH + gap) + (cellH - h) / 2;
          page.drawPage(emb, { x, y: A4.h - yTop - h, width: w, height: h });
        }
      }
      const { stampPdfFooter } = await import('@/engines/pdf');
      try { await stampPdfFooter(out); } catch { /* */ }
      const bytes = await out.save();
      downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${item.file.name.replace(/\.pdf$/i, '')}-${n}up.pdf`);
    } catch (e) { setError((e as Error).message || 'Could not build the N-up PDF.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {gate}
      {!item ? <PdfDrop onLoad={setItem} loaded={false} /> : (
        <>
          <div className="flex items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <FileText className="h-4 w-4 text-[var(--color-cat-pdf)]" />
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <button type="button" onClick={() => setItem(null)} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {LAYOUTS.map((l) => (
              <button key={l.n} type="button" onClick={() => setLayout(l)} className={cn('border px-4 py-2 text-[13px] font-semibold', layout.n === l.n ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)]/10' : 'border-black/[0.12]')}>{l.label}</button>
            ))}
          </div>
          <button type="button" onClick={run} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-pdf)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Build {layout.label} PDF
          </button>
        </>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
