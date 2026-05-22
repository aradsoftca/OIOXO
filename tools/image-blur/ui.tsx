'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Upload, Image as ImageIcon, Loader2, ArrowLeftRight, Sparkles } from 'lucide-react';
import { setRecent } from '@/lib/storage/recent';
import { cn } from '@/lib/cn';
import type { BlurRequest, BlurResult, BlurError } from './worker';

type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function ImageBlurTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState<string>('');
  const [outputUrl, setOutputUrl] = React.useState<string>('');
  const [outputBytes, setOutputBytes] = React.useState<number>(0);
  const [naturalDims, setNaturalDims] = React.useState<{ w: number; h: number } | null>(null);
  const [blurPx, setBlurPx] = React.useState<number>(8);
  const [quality, setQuality] = React.useState<number>(92);
  const [format, setFormat] = React.useState<ExportFormat>('image/jpeg');
  const [compare, setCompare] = React.useState<number>(55);
  const [rendering, setRendering] = React.useState<boolean>(false);

  const workerRef = React.useRef<Worker | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const draggingCompareRef = React.useRef<boolean>(false);

  // Lazily create the worker
  const getWorker = React.useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    }
    return workerRef.current;
  }, []);

  React.useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) {
      // surface a toast later; for now just bail
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(next);

    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to read image'));
    });

    setFile(next);
    setSourceUrl(url);
    setNaturalDims({ w: img.naturalWidth, h: img.naturalHeight });
    setOutputUrl('');
    setOutputBytes(0);
  }, [sourceUrl]);

  const render = React.useCallback(async () => {
    if (!file) return;
    setRendering(true);
    try {
      const bitmap = await createImageBitmap(file);
      const req: BlurRequest = { type: 'blur', bitmap, blurPx, format, quality };

      const worker = getWorker();
      const result = await new Promise<BlurResult>((resolve, reject) => {
        const onMessage = (e: MessageEvent<BlurResult | BlurError>) => {
          worker.removeEventListener('message', onMessage);
          if (e.data.type === 'error') reject(new Error(e.data.message));
          else resolve(e.data);
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage(req, [bitmap]);
      });

      if (outputUrl) URL.revokeObjectURL(outputUrl);
      const url = URL.createObjectURL(result.blob);
      setOutputUrl(url);
      setOutputBytes(result.bytes);

      // Save a small thumb for the home-page live tile
      const thumb = await makeThumb(result.blob, 192);
      setRecent('image-blur', thumb);
    } catch (err) {
      console.error('blur render failed', err);
    } finally {
      setRendering(false);
    }
  }, [file, blurPx, format, quality, outputUrl, getWorker]);

  // Auto-render on parameter change (debounced)
  React.useEffect(() => {
    if (!file) return;
    const id = setTimeout(() => { void render(); }, 120);
    return () => clearTimeout(id);
  }, [file, blurPx, format, quality, render]);

  // Compare slider drag
  const onComparePointerDown = (e: React.PointerEvent) => {
    draggingCompareRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateCompare(e);
  };
  const onComparePointerMove = (e: React.PointerEvent) => {
    if (!draggingCompareRef.current) return;
    updateCompare(e);
  };
  const onComparePointerUp = (e: React.PointerEvent) => {
    draggingCompareRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  const updateCompare = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setCompare(pct);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const download = () => {
    if (!outputUrl || !file) return;
    const a = document.createElement('a');
    const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '');
    a.href = outputUrl;
    a.download = `${base}-blur-${blurPx}px.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Stage — kept dark so transparent and dark images preview well */}
      <div
        ref={stageRef}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'tile-surface relative aspect-[4/3] overflow-hidden',
          !sourceUrl && 'flex items-center justify-center',
        )}
        style={{ ['--tile-color' as string]: 'oklch(20% 0.008 250)', ['--tile-fg' as string]: 'oklch(99% 0 0)' }}
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
                JPG · PNG · WebP · AVIF — files stay yours
              </div>
            </div>
            <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">
              or click to browse
            </div>
          </button>
        )}

        {sourceUrl && (
          <>
            {/* Original (under) */}
            <img
              src={sourceUrl}
              alt="original"
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
            {/* Blurred (over, clipped) */}
            {outputUrl && (
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
              >
                <img
                  src={outputUrl}
                  alt="blurred"
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              </div>
            )}
            {/* Compare divider */}
            {outputUrl && (
              <div
                onPointerDown={onComparePointerDown}
                onPointerMove={onComparePointerMove}
                onPointerUp={onComparePointerUp}
                className="absolute top-0 bottom-0 z-10 cursor-ew-resize"
                style={{ left: `${compare}%`, transform: 'translateX(-50%)' }}
              >
                <div className="h-full w-0.5 bg-white/80 shadow-[0_0_0_1px_oklch(0%_0_0/0.4)]" />
                <div className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-black shadow-lg">
                  <ArrowLeftRight className="h-4 w-4" />
                </div>
              </div>
            )}
            {/* Rendering pulse */}
            {rendering && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Rendering…
              </div>
            )}
            {/* Metadata */}
            {naturalDims && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
                {naturalDims.w}×{naturalDims.h}
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

      {/* Controls */}
      <aside className="space-y-5">
        <div className="tile-surface" style={{ ['--tile-color' as string]: 'oklch(18% 0.008 250)' }}>
          <div className="tile-content gap-5 !justify-start">
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  Blur strength
                </label>
                <span className="font-mono text-[20px] font-semibold tabular-nums text-white">
                  {blurPx}<span className="text-[12px] font-medium text-white/45">px</span>
                </span>
              </div>
              <Slider.Root
                value={[blurPx]}
                onValueChange={([v]) => setBlurPx(v)}
                min={0}
                max={64}
                step={1}
                className="relative mt-3 flex h-5 w-full touch-none items-center"
              >
                <Slider.Track className="relative h-1.5 grow bg-white/[0.08]">
                  <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
                </Slider.Track>
                <Slider.Thumb className="block h-5 w-5 border-2 border-white bg-[var(--color-cat-image)] shadow-lg outline-none ring-0 transition focus-visible:outline-2 focus-visible:outline-white" />
              </Slider.Root>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  Quality
                </label>
                <span className="font-mono text-[16px] font-semibold tabular-nums text-white">{quality}</span>
              </div>
              <Slider.Root
                value={[quality]}
                onValueChange={([v]) => setQuality(v)}
                min={40}
                max={100}
                step={1}
                className="relative mt-3 flex h-5 w-full touch-none items-center"
              >
                <Slider.Track className="relative h-1.5 grow bg-white/[0.08]">
                  <Slider.Range className="absolute h-full bg-white/40" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-white bg-white/80 shadow-lg outline-none" />
              </Slider.Root>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Format
              </label>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(['image/jpeg', 'image/png', 'image/webp'] as ExportFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      'border px-3 py-2 text-[12px] font-semibold uppercase tracking-wider transition',
                      format === f
                        ? 'border-white/20 bg-white/10 text-white'
                        : 'border-white/8 bg-transparent text-white/55 hover:bg-white/[0.05] hover:text-white/80',
                    )}
                  >
                    {f.replace('image/', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={download}
          disabled={!outputUrl}
          className={cn(
            'flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            outputUrl
              ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110'
              : 'bg-white/[0.04] text-white/40',
          )}
        >
          <Download className="h-4 w-4" />
          Download
        </button>

        {file && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 border border-white/10 py-2.5 text-[12px] text-white/70 transition hover:bg-white/[0.04] hover:text-white"
          >
            <ImageIcon className="h-4 w-4" />
            Replace image
          </button>
        )}

        <div className="flex items-center gap-2 bg-white/[0.03] px-3 py-2.5 text-[11px] text-white/55">
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-cat-image)]" />
          Files stay yours.
        </div>
      </aside>
    </div>
  );
}

async function makeThumb(blob: Blob, maxEdge: number): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.6);
}
