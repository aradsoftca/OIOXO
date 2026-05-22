'use client';

import * as React from 'react';
import { Download, Upload, Image as ImageIcon, Loader2, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { decode, encode, resize, type ImageFormat, type ResizeOptions, FORMAT_TO_EXT } from '@/engines/image';

const FORMATS: { id: ImageFormat; label: string }[] = [
  { id: 'jpeg', label: 'JPEG' },
  { id: 'png',  label: 'PNG' },
  { id: 'webp', label: 'WebP' },
  { id: 'avif', label: 'AVIF' },
];

const METHODS: { id: NonNullable<ResizeOptions['method']>; label: string; hint: string }[] = [
  { id: 'lanczos3', label: 'Lanczos',  hint: 'Photos · sharp · default' },
  { id: 'mitchell', label: 'Mitchell', hint: 'Graphics · smooth edges' },
  { id: 'catrom',   label: 'CatRom',   hint: 'Balanced · text-friendly' },
  { id: 'triangle', label: 'Triangle', hint: 'Fastest · slight softness' },
  { id: 'hqx',      label: 'HQx',      hint: 'Pixel art · integer upscale' },
];

const PRESETS = [
  { label: '50%',  factor: 0.5 },
  { label: '75%',  factor: 0.75 },
  { label: '150%', factor: 1.5 },
  { label: '2×',   factor: 2 },
  { label: '4×',   factor: 4 },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function ResizeTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [decoded, setDecoded] = React.useState<ImageData | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [outputUrl, setOutputUrl] = React.useState('');
  const [outputBytes, setOutputBytes] = React.useState(0);
  const [outputDims, setOutputDims] = React.useState<{ w: number; h: number } | null>(null);
  const [sourceDims, setSourceDims] = React.useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = React.useState<number>(0);
  const [height, setHeight] = React.useState<number>(0);
  const [lockRatio, setLockRatio] = React.useState(true);
  const [method, setMethod] = React.useState<NonNullable<ResizeOptions['method']>>('lanczos3');
  const [format, setFormat] = React.useState<ImageFormat>('png');
  const [quality, setQuality] = React.useState(92);
  const [busy, setBusy] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const renderToken = React.useRef(0);

  React.useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setBusy(true);
    try {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      const url = URL.createObjectURL(next);
      setSourceUrl(url);
      setFile(next);

      const { data } = await decode(next);
      setDecoded(data);
      setSourceDims({ w: data.width, h: data.height });
      setWidth(data.width);
      setHeight(data.height);
    } catch (err) {
      console.error('decode failed', err);
    } finally {
      setBusy(false);
    }
  }, [sourceUrl]);

  const ratio = sourceDims ? sourceDims.w / sourceDims.h : 1;

  const onWidthChange = (next: number) => {
    setWidth(next);
    if (lockRatio && next > 0) setHeight(Math.max(1, Math.round(next / ratio)));
  };
  const onHeightChange = (next: number) => {
    setHeight(next);
    if (lockRatio && next > 0) setWidth(Math.max(1, Math.round(next * ratio)));
  };

  const setFactor = (f: number) => {
    if (!sourceDims) return;
    setWidth(Math.max(1, Math.round(sourceDims.w * f)));
    setHeight(Math.max(1, Math.round(sourceDims.h * f)));
  };

  const render = React.useCallback(async () => {
    if (!decoded || width < 1 || height < 1) return;
    const token = ++renderToken.current;
    setBusy(true);
    try {
      const resized = await resize(decoded, { width, height, method });
      const { blob, bytes } = await encode(resized, format, { quality });
      if (token !== renderToken.current) return;

      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      setOutputBytes(bytes);
      setOutputDims({ w: resized.width, h: resized.height });

      if (file) {
        const thumb = await makeThumb(blob, 192);
        setRecent('image-resize', thumb);
      }
    } catch (err) {
      console.error('resize failed', err);
    } finally {
      if (token === renderToken.current) setBusy(false);
    }
  }, [decoded, width, height, method, format, quality, outputUrl, file]);

  React.useEffect(() => {
    if (!decoded) return;
    const id = setTimeout(() => { void render(); }, 250);
    return () => clearTimeout(id);
  }, [decoded, width, height, method, format, quality, render]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const download = () => {
    if (!outputUrl || !file) return;
    const a = document.createElement('a');
    const base = file.name.replace(/\.[^.]+$/, '');
    a.href = outputUrl;
    a.download = `${base}-${width}x${height}.${FORMAT_TO_EXT[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'relative aspect-[4/3] overflow-hidden border border-black/[0.08] bg-[oklch(20%_0.008_250)]',
          !sourceUrl && 'flex items-center justify-center',
        )}
      >
        {!sourceUrl && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-4 px-6 text-center"
          >
            <div className="bg-white/[0.06] p-4">
              <Upload className="h-6 w-6 text-white/80" />
            </div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">
                Drop an image here
              </div>
              <div className="mt-1 text-[13px] text-white/55">
                JPG · PNG · WebP · AVIF
              </div>
            </div>
            <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">
              or click to browse
            </div>
          </button>
        )}

        {sourceUrl && (
          <>
            <img
              src={outputUrl || sourceUrl}
              alt="preview"
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
            {busy && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Resampling…
              </div>
            )}
            {outputDims && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
                {outputDims.w}×{outputDims.h}
                {outputBytes > 0 && <span className="text-white/50">· {formatBytes(outputBytes)}</span>}
              </div>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f);
          }}
        />
      </div>

      <aside className="space-y-5">
        {/* Dimensions */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Dimensions</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[10px] font-mono uppercase text-[var(--color-fg-subtle)]">Width</div>
              <input
                type="number"
                value={width || ''}
                onChange={(e) => onWidthChange(Number(e.target.value) || 0)}
                className="mt-0.5 w-full bg-transparent border-b-2 border-black/[0.1] py-1 font-mono text-[20px] font-semibold tabular-nums text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-image)]"
                min={1}
              />
            </div>
            <button
              type="button"
              onClick={() => setLockRatio((l) => !l)}
              title={lockRatio ? 'Locked aspect ratio' : 'Free dimensions'}
              className={cn(
                'mt-4 grid h-9 w-9 place-items-center border transition',
                lockRatio
                  ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                  : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
              )}
            >
              {lockRatio ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            </button>
            <div className="flex-1">
              <div className="text-[10px] font-mono uppercase text-[var(--color-fg-subtle)]">Height</div>
              <input
                type="number"
                value={height || ''}
                onChange={(e) => onHeightChange(Number(e.target.value) || 0)}
                className="mt-0.5 w-full bg-transparent border-b-2 border-black/[0.1] py-1 font-mono text-[20px] font-semibold tabular-nums text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-image)]"
                min={1}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setFactor(p.factor)}
                className="border border-black/[0.08] py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
              >
                {p.label}
              </button>
            ))}
          </div>

          {sourceDims && (
            <div className="mt-3 border-t border-black/[0.06] pt-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">
              Source: {sourceDims.w}×{sourceDims.h}
            </div>
          )}
        </div>

        {/* Method */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Quality</div>
          <div className="mt-2 space-y-1">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cn(
                  'flex w-full items-center justify-between border px-3 py-2 text-left transition',
                  method === m.id
                    ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                    : 'border-black/[0.08] text-[var(--color-fg)] hover:border-black/20',
                )}
              >
                <span className="text-[12px] font-bold">{m.label}</span>
                <span className={cn(
                  'text-[10px]',
                  method === m.id ? 'text-white/75' : 'text-[var(--color-fg-subtle)]',
                )}>{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Output format */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Format</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
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
          {format !== 'png' && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-fg-subtle)]">Quality</span>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--color-fg)]">{quality}</span>
              </div>
              <input
                type="range"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                min={20}
                max={100}
                className="mt-1 w-full"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={download}
          disabled={!outputUrl || busy}
          className={cn(
            'flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            outputUrl && !busy
              ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110'
              : 'bg-black/[0.06] text-[var(--color-fg-subtle)]',
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </button>

        {file && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            <ImageIcon className="h-4 w-4" />
            Replace image
          </button>
        )}
      </aside>
    </div>
  );
}

async function makeThumb(blob: Blob, maxEdge: number): Promise<string> {
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
