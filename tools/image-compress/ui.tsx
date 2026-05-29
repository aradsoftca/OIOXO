'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Download, Upload, Image as ImageIcon, Loader2, ArrowLeftRight, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { decode, encode, type ImageFormat, FORMAT_TO_EXT } from '@/engines/image';

const FORMATS: { id: ImageFormat; label: string; lossy: boolean; supportsEffort: boolean }[] = [
  { id: 'jpeg', label: 'JPEG', lossy: true,  supportsEffort: false },
  { id: 'webp', label: 'WebP', lossy: true,  supportsEffort: true },
  { id: 'avif', label: 'AVIF', lossy: true,  supportsEffort: true },
  { id: 'png',  label: 'PNG',  lossy: false, supportsEffort: false },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function CompressTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [decoded, setDecoded] = React.useState<ImageData | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [outputUrl, setOutputUrl] = React.useState('');
  const [outputBytes, setOutputBytes] = React.useState(0);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [format, setFormat] = React.useState<ImageFormat>('webp');
  const [quality, setQuality] = React.useState(75);
  const [effort, setEffort] = React.useState(4);
  const [encoding, setEncoding] = React.useState(false);
  const [decoding, setDecoding] = React.useState(false);
  const [compare, setCompare] = React.useState(55);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const draggingCompareRef = React.useRef(false);
  const renderToken = React.useRef(0);

  // Mirror current URLs into refs so the unmount cleanup reads the LATEST
  // values, not the empty initial state. With empty deps + closure capture,
  // the loaded source/output URLs leaked on every navigation away.
  const sourceUrlRef = React.useRef('');
  const outputUrlRef = React.useRef('');
  React.useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);
  React.useEffect(() => { outputUrlRef.current = outputUrl; }, [outputUrl]);
  React.useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
  }, []);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    setDecoding(true);
    try {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      const url = URL.createObjectURL(next);
      setSourceUrl(url);
      setFile(next);
      const { data } = await decode(next);
      setDecoded(data);
      setDims({ w: data.width, h: data.height });
    } catch (err) {
      console.error('decode failed', err);
    } finally {
      setDecoding(false);
    }
  }, [sourceUrl]);

  const render = React.useCallback(async () => {
    if (!decoded) return;
    const token = ++renderToken.current;
    setEncoding(true);
    try {
      const { blob, bytes } = await encode(decoded, format, {
        quality,
        effort: FORMATS.find((f) => f.id === format)?.supportsEffort ? effort : undefined,
      });
      if (token !== renderToken.current) return;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setOutputBytes(bytes);

      // Save thumbnail on first successful encode (debounce keeps this from thrashing)
      if (file) {
        const thumb = await makeThumb(blob, 192);
        setRecent('image-compress', thumb);
      }
    } catch (err) {
      console.error('encode failed', err);
    } finally {
      if (token === renderToken.current) setEncoding(false);
    }
  }, [decoded, format, quality, effort, outputUrl, file]);

  React.useEffect(() => {
    if (!decoded) return;
    const id = setTimeout(() => { void render(); }, 200);
    return () => clearTimeout(id);
  }, [decoded, format, quality, effort, render]);

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
    setCompare(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  };

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
    a.download = `${base}-compressed.${FORMAT_TO_EXT[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sourceBytes = file?.size ?? 0;
  const ratio = sourceBytes > 0 && outputBytes > 0
    ? Math.round((1 - outputBytes / sourceBytes) * 100)
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div
        ref={stageRef}
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
            <img src={sourceUrl} alt="original" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
            {outputUrl && (
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                <img src={outputUrl} alt="compressed" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
              </div>
            )}
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

            {(encoding || decoding) && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {decoding ? 'Reading…' : 'Compressing…'}
              </div>
            )}

            {dims && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
                {dims.w}×{dims.h}
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
        {/* Savings */}
        {outputBytes > 0 && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Savings</div>
                <div className="mt-1 font-mono text-[32px] font-extrabold tracking-tight tabular-nums text-[var(--color-cat-image)]">
                  {ratio > 0 ? `−${ratio}%` : `+${-ratio}%`}
                </div>
              </div>
              <Zap className="h-7 w-7 text-[var(--color-cat-image)]" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/[0.06] pt-3 text-[11px]">
              <div>
                <div className="text-[var(--color-fg-subtle)]">Before</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{formatBytes(sourceBytes)}</div>
              </div>
              <div>
                <div className="text-[var(--color-fg-subtle)]">After</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{formatBytes(outputBytes)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Format */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Output format</div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    'border px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider transition',
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

          {FORMATS.find((f) => f.id === format)?.lossy && (
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Quality</label>
                <span className="font-mono text-[18px] font-semibold tabular-nums text-[var(--color-fg)]">{quality}</span>
              </div>
              <Slider.Root
                value={[quality]}
                onValueChange={([v]) => setQuality(v)}
                min={20}
                max={100}
                step={1}
                className="relative mt-3 flex h-5 w-full touch-none items-center"
              >
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                  <Slider.Range className="absolute h-full bg-[var(--color-cat-image)]" />
                </Slider.Track>
                <Slider.Thumb className="block h-5 w-5 border-2 border-[var(--color-fg)] bg-[var(--color-cat-image)] outline-none" />
              </Slider.Root>
            </div>
          )}

          {FORMATS.find((f) => f.id === format)?.supportsEffort && (
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Effort</label>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--color-fg)]">{effort}</span>
              </div>
              <Slider.Root
                value={[effort]}
                onValueChange={([v]) => setEffort(v)}
                min={0}
                max={6}
                step={1}
                className="relative mt-3 flex h-5 w-full touch-none items-center"
              >
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                  <Slider.Range className="absolute h-full bg-black/30" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-white outline-none" />
              </Slider.Root>
              <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">Higher = smaller file, slower.</div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={download}
          disabled={!outputUrl || encoding}
          className={cn(
            'flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            outputUrl && !encoding
              ? 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110'
              : 'bg-black/[0.06] text-[var(--color-fg-subtle)]',
          )}
        >
          {encoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
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
