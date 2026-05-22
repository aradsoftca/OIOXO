'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { decode, encode, type ImageFormat } from '@/engines/image';

const FONTS = ['system-ui, sans-serif', 'Georgia, serif', 'Courier New, monospace', 'Impact, sans-serif', 'Arial Black, sans-serif'];
const FONT_LABELS = ['Sans', 'Serif', 'Mono', 'Impact', 'Heavy'];

interface Pos { id: string; label: string; ax: number; ay: number; }
const POSITIONS: Pos[] = [
  { id: 'tl', label: '↖', ax: 0.05, ay: 0.10 },
  { id: 'tc', label: '↑', ax: 0.50, ay: 0.10 },
  { id: 'tr', label: '↗', ax: 0.95, ay: 0.10 },
  { id: 'ml', label: '←', ax: 0.05, ay: 0.50 },
  { id: 'mc', label: '·', ax: 0.50, ay: 0.50 },
  { id: 'mr', label: '→', ax: 0.95, ay: 0.50 },
  { id: 'bl', label: '↙', ax: 0.05, ay: 0.90 },
  { id: 'bc', label: '↓', ax: 0.50, ay: 0.90 },
  { id: 'br', label: '↘', ax: 0.95, ay: 0.90 },
];

export default function Tool() {
  const [src, setSrc] = React.useState<{ file: File; url: string; data: ImageData } | null>(null);
  const [text, setText] = React.useState('Your Caption');
  const [fontIdx, setFontIdx] = React.useState(3);
  const [fontSize, setFontSize] = React.useState(72);
  const [color, setColor] = React.useState('#ffffff');
  const [strokeColor, setStrokeColor] = React.useState('#000000');
  const [strokeWidth, setStrokeWidth] = React.useState(4);
  const [pos, setPos] = React.useState(POSITIONS[7]);
  const [format, setFormat] = React.useState<ImageFormat>('png');
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => () => { if (src?.url) URL.revokeObjectURL(src.url); }, [src]);
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const render = React.useCallback(async () => {
    if (!src) return null;
    const c = document.createElement('canvas');
    c.width = src.data.width; c.height = src.data.height;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(src.data, 0, 0);
    ctx.font = `900 ${fontSize}px ${FONTS[fontIdx]}`;
    ctx.textAlign = pos.ax < 0.4 ? 'left' : pos.ax > 0.6 ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    const x = src.data.width * pos.ax;
    const y = src.data.height * pos.ay;
    if (strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return c;
  }, [src, text, fontIdx, fontSize, color, strokeColor, strokeWidth, pos]);

  React.useEffect(() => {
    if (!src) return;
    let cancelled = false;
    (async () => {
      const c = await render();
      if (!c || cancelled) return;
      c.toBlob((b) => {
        if (b && !cancelled) {
          setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b); });
        }
      }, 'image/png');
    })();
    return () => { cancelled = true; };
  }, [src, render]);

  const loadFile = async (file: File) => {
    setError(''); setBusy(true);
    try {
      const { data } = await decode(file);
      const url = URL.createObjectURL(file);
      setSrc({ file, url, data });
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const exportPng = async () => {
    if (!src) return;
    setBusy(true); setError('');
    try {
      const c = await render();
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const { blob } = await encode(imgData, format);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = src.file.name.replace(/\.[^.]+$/, '') + '-text.' + ext;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!src && (
        <label className="block">
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
          <div className="cursor-pointer border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-12 text-center transition hover:border-[var(--color-cat-image)]">
            <div className="text-[14px] font-bold">Drop an image</div>
            <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">JPG · PNG · WebP · AVIF</div>
          </div>
        </label>
      )}

      {src && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{src.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{src.data.width}×{src.data.height}</span>
            <button type="button" onClick={() => setSrc(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="border border-black/[0.08] bg-black/[0.02] p-2">
              {previewUrl && <img src={previewUrl} alt="preview" className="mx-auto block max-h-[60vh] object-contain" />}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Text</div>
                  <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
                    className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-image)]" />
                </label>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Font</div>
                  <div className="grid grid-cols-5 gap-1">
                    {FONTS.map((f, i) => (
                      <button key={f} type="button" onClick={() => setFontIdx(i)}
                        className={`border py-1 text-[10px] font-bold transition ${fontIdx === i ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08]'}`}>
                        {FONT_LABELS[i]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Size</span>
                    <span className="font-mono text-[12px] tabular-nums font-bold">{fontSize}px</span>
                  </div>
                  <Slider.Root value={[fontSize]} min={16} max={Math.max(120, Math.round(src.data.width * 0.25))} step={2}
                    onValueChange={([v]) => setFontSize(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
                  </Slider.Root>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Fill</span>
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-8 w-full cursor-pointer border-0 bg-transparent" />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Stroke</span>
                    <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className="mt-1 h-8 w-full cursor-pointer border-0 bg-transparent" />
                  </label>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Stroke width</span>
                    <span className="font-mono text-[12px] tabular-nums font-bold">{strokeWidth}px</span>
                  </div>
                  <Slider.Root value={[strokeWidth]} min={0} max={20} step={1}
                    onValueChange={([v]) => setStrokeWidth(v)}
                    className="relative mt-2 flex h-5 w-full touch-none items-center">
                    <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" /></Slider.Track>
                    <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)]" />
                  </Slider.Root>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Position</div>
                  <div className="grid grid-cols-3 gap-1">
                    {POSITIONS.map((p) => (
                      <button key={p.id} type="button" onClick={() => setPos(p)}
                        className={`border py-2 text-[14px] transition ${pos.id === p.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08]'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Export</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['png', 'jpeg', 'webp'] as ImageFormat[]).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase transition ${format === f ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08]'}`}>
                      {f === 'jpeg' ? 'JPG' : f}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" onClick={exportPng} disabled={busy || !text.trim()}
                className="w-full bg-[var(--color-cat-image)] text-white py-3 text-[12px] font-bold uppercase tracking-wider disabled:opacity-50">
                {busy ? 'Working…' : 'Add Text & Download'}
              </button>
              {error && <div className="text-[11px] text-red-600">{error}</div>}
            </aside>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  );
}
