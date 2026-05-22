'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, addPageNumbers, download, type PdfInfo, type PageNumberPosition } from '@/engines/pdf';

const POSITIONS: { id: PageNumberPosition; label: string }[] = [
  { id: 'top-left', label: '↖' }, { id: 'top-center', label: '↑' }, { id: 'top-right', label: '↗' },
  { id: 'bottom-left', label: '↙' }, { id: 'bottom-center', label: '↓' }, { id: 'bottom-right', label: '↘' },
];

const FORMATS = [
  { id: '{n}', label: '1, 2, 3' },
  { id: 'Page {n}', label: 'Page 1' },
  { id: '{n} / {total}', label: '1 / 10' },
  { id: '- {n} -', label: '- 1 -' },
];

function hexToRgb01(hex: string) {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0.1, g: 0.1, b: 0.1 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [position, setPosition] = React.useState<PageNumberPosition>('bottom-center');
  const [format, setFormat] = React.useState('{n}');
  const [fontSize, setFontSize] = React.useState(11);
  const [startAt, setStartAt] = React.useState(1);
  const [color, setColor] = React.useState('#1a1a1a');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = async (it: PdfFileItem) => {
    setItem(it); setError('');
    try { setInfo(await getPdfInfo(it.buffer)); }
    catch (e) { setError((e as Error).message); }
  };

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const out = await addPageNumbers(item.buffer, {
        position, format, fontSize, startAt, color: hexToRgb01(color),
      });
      download(out, item.file.name.replace(/\.pdf$/i, '') + '-numbered.pdf');
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
            <button type="button" onClick={() => { setItem(null); setInfo(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change PDF</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Position</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {POSITIONS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPosition(p.id)}
                      className={`border py-2 text-[16px] transition ${position === p.id ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Format</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FORMATS.map((f) => (
                    <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f.id ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <input value={format} onChange={(e) => setFormat(e.target.value)}
                  className="mt-2 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[12px] outline-none focus:border-[var(--color-cat-pdf)]" />
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Use {`{n}`} for page number, {`{total}`} for total.</div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Font size</div>
                  <input type="number" value={fontSize} min={6} max={48} onChange={(e) => setFontSize(Number(e.target.value))}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-pdf)]" />
                </label>
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Start at</div>
                  <input type="number" value={startAt} onChange={(e) => setStartAt(Number(e.target.value))}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-pdf)]" />
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
                  <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Text color</span>
                </div>
              </div>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Stamping…' : 'Add Numbers & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
