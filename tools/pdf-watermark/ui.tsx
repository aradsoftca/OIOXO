'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { getPdfInfo, addTextWatermark, download, type PdfInfo } from '@/engines/pdf';

const PRESETS = ['DRAFT', 'CONFIDENTIAL', 'SAMPLE', 'COPY', 'INTERNAL'];

function hexToRgb01(hex: string) {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0.6, g: 0.6, b: 0.6 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

export default function Tool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [info, setInfo] = React.useState<PdfInfo | null>(null);
  const [text, setText] = React.useState('DRAFT');
  const [fontSize, setFontSize] = React.useState(72);
  const [opacity, setOpacity] = React.useState(0.2);
  const [rotation, setRotation] = React.useState(-45);
  const [color, setColor] = React.useState('#888888');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = async (it: PdfFileItem) => {
    setItem(it); setError('');
    try { setInfo(await getPdfInfo(it.buffer)); }
    catch (e) { setError((e as Error).message); }
  };

  const run = async () => {
    if (!item || !text.trim()) return;
    setBusy(true); setError('');
    try {
      const out = await addTextWatermark(item.buffer, {
        text, fontSize, opacity, rotation, color: hexToRgb01(color),
      });
      download(out, item.file.name.replace(/\.pdf$/i, '') + '-watermarked.pdf');
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
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <label className="block">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Text</div>
                <input value={text} onChange={(e) => setText(e.target.value)}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 text-[14px] font-bold tracking-wider outline-none focus:border-[var(--color-cat-pdf)]" />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setText(p)}
                    className="border border-black/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:border-[var(--color-cat-pdf)] hover:text-[var(--color-cat-pdf)]">
                    {p}
                  </button>
                ))}
              </div>

              {([
                ['Font size', fontSize, setFontSize, 12, 200, 1, 'px'],
                ['Opacity',   opacity,  setOpacity,  0.05, 1, 0.05, ''],
                ['Rotation',  rotation, setRotation, -90, 90, 5, '°'],
              ] as const).map(([label, value, setter, min, max, step, unit]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
                    <span className="font-mono text-[12px] tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
                  </div>
                  <Slider.Root value={[value]} min={min} max={max} step={step}
                    onValueChange={([v]) => (setter as (n: number) => void)(v)}
                    className="relative mt-1 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-pdf)]" /></Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-pdf)]" />
                  </Slider.Root>
                </div>
              ))}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
                  <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Color</span>
                </div>
              </div>
              <button type="button" onClick={run} disabled={busy || !text.trim()}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Stamping…' : 'Add Watermark & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
