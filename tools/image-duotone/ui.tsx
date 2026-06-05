'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Upload, Download } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useImageDrop } from '@/lib/compute/useImageDrop';

type Format = 'png' | 'jpeg';

interface Preset { label: string; shadow: string; highlight: string }
const PRESETS: Preset[] = [
  { label: 'Mono',    shadow: '#000000', highlight: '#ffffff' },
  { label: 'Indigo',  shadow: '#1a1a40', highlight: '#7b8cff' },
  { label: 'Ember',   shadow: '#2b0a0a', highlight: '#ff9a3c' },
  { label: 'Mint',    shadow: '#06281f', highlight: '#5ef0b0' },
  { label: 'Magenta', shadow: '#2a0628', highlight: '#ff5cc8' },
  { label: 'Gold',    shadow: '#1c1606', highlight: '#ffd24a' },
];

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export default function ImageDuotoneTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [shadow, setShadow] = React.useState('#1a1a40');
  const [highlight, setHighlight] = React.useState('#7b8cff');
  const [intensity, setIntensity] = React.useState(1);
  const [format, setFormat] = React.useState<Format>('png');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { bitmap?.close(); }, [bitmap]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    bitmap?.close();
    const bm = await createImageBitmap(next);
    setBitmap(bm);
    setFile(next);
  };

  const clear = React.useCallback(() => {
    setBitmap((b) => { b?.close(); return null; });
    setFile(null);
  }, []);

  // Clipboard paste, drag-anywhere hover state, Esc to clear, Enter to download.
  const downloadRef = React.useRef<() => void>(() => {});
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
    onRun: file ? () => downloadRef.current() : undefined,
  });

  const render = React.useCallback((canvas: HTMLCanvasElement) => {
    if (!bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    const [sr, sg, sb] = hexToRgb(shadow);
    const [hr, hg, hb] = hexToRgb(highlight);
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const dr = sr + (hr - sr) * lum;
      const dg = sg + (hg - sg) * lum;
      const db = sb + (hb - sb) * lum;
      d[i] = d[i] + (dr - d[i]) * intensity;
      d[i + 1] = d[i + 1] + (dg - d[i + 1]) * intensity;
      d[i + 2] = d[i + 2] + (db - d[i + 2]) * intensity;
    }
    ctx.putImageData(id, 0, 0);
  }, [bitmap, shadow, highlight, intensity]);

  React.useEffect(() => { if (canvasRef.current) render(canvasRef.current); }, [render]);

  const download = () => {
    if (!file || !canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `${base}-duotone.${format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
  };
  downloadRef.current = download;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {!file ? (
          <div
            {...dropZone}
            className={cn(
              'flex aspect-[4/3] items-center justify-center border border-dashed bg-[var(--color-surface-1)] transition-colors',
              dragging ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/[0.06]' : 'border-black/[0.18]',
            )}
          >
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" />
              {dragging ? 'Drop for a duotone effect' : 'Drop, paste or click for a duotone effect'}
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
          </div>
        ) : (
          <div className="overflow-hidden border border-black/[0.08] bg-black/5">
            <canvas ref={canvasRef} className="block h-auto w-full" />
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Presets</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button"
                onClick={() => { setShadow(p.shadow); setHighlight(p.highlight); }}
                className="relative h-10 border border-black/[0.08] text-[10px] font-bold uppercase tracking-wider transition hover:border-[var(--color-fg)]"
                style={{ background: `linear-gradient(135deg, ${p.shadow}, ${p.highlight})` }}>
                <span className="absolute inset-x-0 bottom-0.5 text-center text-white drop-shadow">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex flex-1 items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Shadows
              <input type="color" value={shadow} onChange={(e) => setShadow(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
            <label className="flex flex-1 items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
              Highlights
              <input type="color" value={highlight} onChange={(e) => setHighlight(e.target.value)}
                className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
            </label>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Intensity</span>
              <span className="font-mono text-[12px] tabular-nums">{Math.round(intensity * 100)}%</span>
            </div>
            <Slider.Root value={[intensity]} min={0} max={1} step={0.05}
              onValueChange={([v]) => setIntensity(v)}
              className="relative mt-2 flex h-5 w-full touch-none items-center">
              <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
            </Slider.Root>
          </div>
        </div>

        {file && (
          <>
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(['png', 'jpeg'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {f === 'jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={download}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              Replace image
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
