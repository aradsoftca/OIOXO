'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { encode, type ImageFormat, FORMAT_TO_EXT } from '@/engines/image';

const PRESETS = [
  { label: '1:1',  w: 1024, h: 1024 },
  { label: '4:3',  w: 1024, h:  768 },
  { label: '16:9', w: 1920, h: 1080 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '3:2',  w: 1500, h: 1000 },
  { label: 'OG',   w: 1200, h:  630 },
];

const FORMATS: { id: ImageFormat; label: string; lossy: boolean }[] = [
  { id: 'png',  label: 'PNG',  lossy: false },
  { id: 'jpeg', label: 'JPEG', lossy: true  },
  { id: 'webp', label: 'WebP', lossy: true  },
];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [200, 200, 200];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function renderImage(opts: {
  width: number;
  height: number;
  bg: string;
  bg2: string;
  gradient: boolean;
  angle: number;
  text: string;
  textColor: string;
  showSize: boolean;
}): ImageData {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(opts.width, opts.height)
    : Object.assign(document.createElement('canvas'), { width: opts.width, height: opts.height });
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('Canvas 2D unavailable');

  if (opts.gradient) {
    const rad = (opts.angle * Math.PI) / 180;
    const dx = Math.cos(rad) * opts.width;
    const dy = Math.sin(rad) * opts.height;
    const grad = ctx.createLinearGradient(
      opts.width / 2 - dx / 2, opts.height / 2 - dy / 2,
      opts.width / 2 + dx / 2, opts.height / 2 + dy / 2,
    );
    grad.addColorStop(0, opts.bg);
    grad.addColorStop(1, opts.bg2);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = opts.bg;
  }
  ctx.fillRect(0, 0, opts.width, opts.height);

  const label = opts.text || (opts.showSize ? `${opts.width} × ${opts.height}` : '');
  if (label) {
    ctx.fillStyle = opts.textColor;
    const fontSize = Math.max(24, Math.min(opts.width, opts.height) / 10);
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, opts.width / 2, opts.height / 2);
  }

  return ctx.getImageData(0, 0, opts.width, opts.height);
}

export default function PlaceholderTool() {
  const [width, setWidth] = React.useState(1200);
  const [height, setHeight] = React.useState(630);
  const [lock, setLock] = React.useState(false);
  const [bg, setBg] = React.useState('#3a4a5a');
  const [bg2, setBg2] = React.useState('#7b9acc');
  const [gradient, setGradient] = React.useState(true);
  const [angle, setAngle] = React.useState(135);
  const [text, setText] = React.useState('');
  const [textColor, setTextColor] = React.useState('#ffffff');
  const [showSize, setShowSize] = React.useState(true);
  const [format, setFormat] = React.useState<ImageFormat>('png');
  const [quality, setQuality] = React.useState(92);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [outputBytes, setOutputBytes] = React.useState(0);

  const renderToken = React.useRef(0);

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ratio = React.useRef(width / height);

  const onWidth = (v: number) => {
    setWidth(v);
    if (lock) setHeight(Math.max(1, Math.round(v / ratio.current)));
    else ratio.current = v / height;
  };
  const onHeight = (v: number) => {
    setHeight(v);
    if (lock) setWidth(Math.max(1, Math.round(v * ratio.current)));
    else ratio.current = width / v;
  };

  const render = React.useCallback(async () => {
    const token = ++renderToken.current;
    const data = renderImage({ width, height, bg, bg2, gradient, angle, text, textColor, showSize });
    const { blob, bytes } = await encode(data, format, { quality });
    if (token !== renderToken.current) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setOutputBytes(bytes);
    setRecent('image-placeholder', await blobToDataUrl(blob, 192));
  }, [width, height, bg, bg2, gradient, angle, text, textColor, showSize, format, quality, previewUrl]);

  React.useEffect(() => {
    const id = setTimeout(() => { void render(); }, 200);
    return () => clearTimeout(id);
  }, [render]);

  const download = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `placeholder-${width}x${height}.${FORMAT_TO_EXT[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="relative aspect-[4/3] overflow-hidden border border-black/[0.08] bg-[oklch(95%_0.005_80)]">
        {previewUrl && (
          <img src={previewUrl} alt="preview" className="absolute inset-0 h-full w-full object-contain" />
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
          {width}×{height}
          {outputBytes > 0 && <span className="text-white/50">· {formatBytes(outputBytes)}</span>}
        </div>
      </div>

      <aside className="space-y-4">
        {/* Dimensions */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Size</div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              value={width}
              onChange={(e) => onWidth(Math.max(1, Math.min(8192, Number(e.target.value) || 1)))}
              className="w-full bg-transparent border-b-2 border-black/[0.1] py-1 font-mono text-[18px] font-semibold tabular-nums text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-image)]"
            />
            <button
              type="button"
              onClick={() => setLock((l) => !l)}
              className={cn(
                'grid h-9 w-9 place-items-center border transition',
                lock
                  ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)]',
              )}
            >
              {lock ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            </button>
            <input
              type="number"
              value={height}
              onChange={(e) => onHeight(Math.max(1, Math.min(8192, Number(e.target.value) || 1)))}
              className="w-full bg-transparent border-b-2 border-black/[0.1] py-1 font-mono text-[18px] font-semibold tabular-nums text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-image)]"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setWidth(p.w); setHeight(p.h); ratio.current = p.w / p.h; }}
                className="border border-black/[0.08] py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Background */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Background</div>
            <button
              type="button"
              onClick={() => setGradient((g) => !g)}
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              {gradient ? '★ Gradient' : '○ Solid'}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <input type="text" value={bg} onChange={(e) => setBg(e.target.value)} className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] outline-none" />
          </div>
          {gradient && (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input type="color" value={bg2} onChange={(e) => setBg2(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
                <input type="text" value={bg2} onChange={(e) => setBg2(e.target.value)} className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[12px] text-[var(--color-fg)] outline-none" />
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-mono uppercase text-[var(--color-fg-subtle)]">Angle</span>
                  <span className="font-mono text-[13px] tabular-nums">{angle}°</span>
                </div>
                <Slider.Root
                  value={[angle]}
                  onValueChange={([v]) => setAngle(v)}
                  min={0}
                  max={360}
                  step={5}
                  className="relative mt-1 flex h-5 w-full touch-none items-center"
                >
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                    <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)] outline-none" />
                </Slider.Root>
              </div>
            </>
          )}
        </div>

        {/* Text */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Label</div>
          <input
            type="text"
            value={text}
            placeholder={showSize ? `${width} × ${height}` : '(empty)'}
            onChange={(e) => setText(e.target.value)}
            className="mt-2 w-full border border-black/[0.08] bg-transparent px-2 py-2 text-[12px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]"
          />
          <div className="mt-2 flex items-center gap-2">
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
            <button
              type="button"
              onClick={() => setShowSize((s) => !s)}
              className={cn(
                'flex-1 border py-2 text-[11px] font-bold uppercase tracking-wider transition',
                showSize
                  ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)]',
              )}
            >
              Show dimensions
            </button>
          </div>
        </div>

        {/* Format */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Format</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={cn(
                  'border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition',
                  format === f.id
                    ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                    : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={download}
          disabled={!previewUrl}
          className={cn(
            'flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            previewUrl
              ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110'
              : 'bg-black/[0.06] text-[var(--color-fg-subtle)]',
          )}
        >
          <Download className="h-4 w-4" />
          Download .{FORMAT_TO_EXT[format]}
        </button>

        {/* Unused but kept for future quality control */}
        <input type="hidden" value={quality} onChange={() => setQuality(quality)} />
      </aside>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

async function blobToDataUrl(blob: Blob, maxEdge: number): Promise<string> {
  const bm = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bm.width, bm.height));
  const w = Math.max(1, Math.round(bm.width * scale));
  const h = Math.max(1, Math.round(bm.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(bm, 0, 0, w, h);
  bm.close();
  return canvas.toDataURL('image/jpeg', 0.6);
}
