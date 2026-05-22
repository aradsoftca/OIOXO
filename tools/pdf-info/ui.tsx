'use client';
import * as React from 'react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, type PdfInfo } from '@/engines/pdf';

function Row({ label, value }: { label: string; value: string | number }) {
  if (value === '' || value === null || value === undefined) return null;
  return (
    <div className="flex items-baseline justify-between border-b border-black/[0.06] py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-mono text-[12px] tabular-nums text-right max-w-[70%] truncate">{String(value)}</span>
    </div>
  );
}

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [error, setError] = React.useState('');

  const load = async (it: PdfFileItem) => {
    setItem(it); setError('');
    try { setInfo(await getPdfInfo(it.buffer)); }
    catch (e) { setError((e as Error).message); }
  };

  const fmt = (iso: string) => iso ? new Date(iso).toLocaleString() : '';
  const orientation = info && info.pageSize.width > info.pageSize.height ? 'Landscape' : 'Portrait';
  const sizeName = info ? guessPageName(info.pageSize.width, info.pageSize.height) : '';

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={load} />}

      {item && info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <button type="button" onClick={() => { setItem(null); setInfo(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change PDF</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Document</div>
              <Row label="Title" value={info.title} />
              <Row label="Author" value={info.author} />
              <Row label="Subject" value={info.subject} />
              <Row label="Keywords" value={info.keywords.join(', ')} />
              <Row label="Pages" value={info.pageCount} />
              <Row label="File size" value={`${(info.fileSize / 1024).toFixed(1)} KB`} />
              <Row label="Encrypted" value={info.encrypted ? 'Yes (loaded)' : 'No'} />
            </div>

            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Format & Software</div>
              <Row label="Page size" value={`${info.pageSize.width.toFixed(0)} × ${info.pageSize.height.toFixed(0)} pt`} />
              <Row label="Page format" value={sizeName} />
              <Row label="Orientation" value={orientation} />
              <Row label="Producer" value={info.producer} />
              <Row label="Creator" value={info.creator} />
              <Row label="Created" value={fmt(info.creationDate)} />
              <Row label="Modified" value={fmt(info.modificationDate)} />
            </div>
          </div>
        </>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
    </div>
  );
}

function guessPageName(w: number, h: number): string {
  const candidates: { n: string; w: number; h: number }[] = [
    { n: 'A4', w: 595, h: 842 }, { n: 'A3', w: 842, h: 1191 }, { n: 'A5', w: 420, h: 595 },
    { n: 'Letter', w: 612, h: 792 }, { n: 'Legal', w: 612, h: 1008 }, { n: 'Tabloid', w: 792, h: 1224 },
  ];
  for (const c of candidates) {
    if (
      (Math.abs(w - c.w) < 4 && Math.abs(h - c.h) < 4) ||
      (Math.abs(w - c.h) < 4 && Math.abs(h - c.w) < 4)
    ) return c.n;
  }
  return 'Custom';
}
