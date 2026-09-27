'use client';

import * as React from 'react';
import { useConvertTarget } from '@/lib/convert/target-context';
import * as Slider from '@radix-ui/react-slider';
import { Download, Upload, Image as ImageIcon, Loader2, Shuffle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { decode, encode, detectFormat, type ImageFormat, FORMAT_TO_EXT } from '@/engines/image';
import { useImageDrop } from '@/lib/compute/useImageDrop';

const FORMATS: { id: ImageFormat; label: string; sub: string; lossy: boolean }[] = [
  { id: 'jpeg', label: 'JPEG', sub: 'Photos · widely supported',     lossy: true  },
  { id: 'png',  label: 'PNG',  sub: 'Lossless · alpha · graphics',    lossy: false },
  { id: 'webp', label: 'WebP', sub: 'Modern · small · alpha',         lossy: true  },
  { id: 'avif', label: 'AVIF', sub: 'Newest · smallest · slowest',    lossy: true  },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function ConvertFormatTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [decoded, setDecoded] = React.useState<ImageData | null>(null);
  const [sourceFormat, setSourceFormat] = React.useState<string>('');
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [outputUrl, setOutputUrl] = React.useState('');
  const [outputBytes, setOutputBytes] = React.useState(0);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [target, setTarget] = React.useState<ImageFormat>(
    useConvertTarget<ImageFormat>(['jpeg', 'png', 'webp', 'avif'], 'webp', { jpg: 'jpeg' }),
  );
  const [quality, setQuality] = React.useState(90);
  const [busy, setBusy] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Ref-mirror the URLs so the unmount cleanup reads CURRENT values rather
  // than the empty strings captured at first render.
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
    setBusy(true);
    try {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      const url = URL.createObjectURL(next);
      setSourceUrl(url);
      setFile(next);

      const fmt = await detectFormat(next);
      setSourceFormat(fmt ?? guessExt(next));

      const { data } = await decode(next);
      setDecoded(data);
      setDims({ w: data.width, h: data.height });
    } catch (err) {
      console.error('decode failed', err);
    } finally {
      setBusy(false);
    }
  }, [sourceUrl]);

  const render = React.useCallback(async () => {
    if (!decoded || !file) return;
    setBusy(true);
    try {
      const { blob, bytes } = await encode(decoded, target, { quality });
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      setOutputBytes(bytes);

      const thumb = await makeThumb(blob, 192);
      setRecent('image-convert-format', thumb);
    } catch (err) {
      console.error('encode failed', err);
    } finally {
      setBusy(false);
    }
  }, [decoded, file, target, quality, outputUrl]);

  React.useEffect(() => {
    if (!decoded) return;
    const id = setTimeout(() => { void render(); }, 200);
    return () => clearTimeout(id);
  }, [decoded, target, quality, render]);

  const clear = React.useCallback(() => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    setFile(null);
    setDecoded(null);
    setSourceUrl('');
    setOutputUrl('');
    setOutputBytes(0);
    setDims(null);
  }, []);

  // Enter runs the latest download closure; mirror through a ref so we never
  // reorder the component.
  const downloadRef = React.useRef<() => void>(() => {});

  // Clipboard paste, drag-anywhere hover state, Esc to clear, Enter to download.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
    onRun: outputUrl && !busy ? () => downloadRef.current() : undefined,
  });

  const download = () => {
    if (!outputUrl || !file) return;
    const a = document.createElement('a');
    const base = file.name.replace(/\.[^.]+$/, '');
    a.href = outputUrl;
    a.download = `${base}.${FORMAT_TO_EXT[target]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  downloadRef.current = download;

  const sourceBytes = file?.size ?? 0;
  const ratio = sourceBytes > 0 && outputBytes > 0
    ? Math.round((1 - outputBytes / sourceBytes) * 100)
    : 0;
  const targetMeta = FORMATS.find((f) => f.id === target);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div
        {...dropZone}
        className={cn(
          'relative aspect-[4/3] overflow-hidden border bg-[oklch(20%_0.008_250)] transition-colors',
          dragging ? 'border-2 border-dashed border-[var(--color-cat-image)]' : 'border border-black/[0.08]',
          !sourceUrl && 'flex items-center justify-center',
        )}
      >
        {sourceUrl && dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="border-2 border-dashed border-white/70 px-5 py-3 text-[14px] font-semibold text-white">
              Drop to replace
            </div>
          </div>
        )}
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
                Drop, paste or click
              </div>
              <div className="mt-1 text-[13px] text-white/55">
                JPG · PNG · WebP · AVIF · GIF · BMP
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-white/70">
              <span className="border border-white/10 px-3 py-1.5">browse</span>
              <span className="text-white/40">or paste a screenshot</span>
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
                Working…
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
            e.target.value = '';
          }}
        />
      </div>

      <aside className="space-y-5">
        {/* Direction summary */}
        {file && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-center gap-3 text-[12px] font-mono uppercase tracking-wider">
              <span className="font-bold text-[var(--color-fg)]">{sourceFormat || 'image'}</span>
              <Shuffle className="h-4 w-4 text-[var(--color-cat-image)]" />
              <span className="font-bold text-[var(--color-cat-image)]">{target}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-[var(--color-fg-subtle)]">Source</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{formatBytes(sourceBytes)}</div>
              </div>
              <div>
                <div className="text-[var(--color-fg-subtle)]">Output</div>
                <div className={cn(
                  'mt-0.5 font-mono font-semibold tabular-nums',
                  ratio > 0 ? 'text-[var(--color-cat-image)]' : '',
                )}>
                  {outputBytes > 0 ? formatBytes(outputBytes) : '—'}
                  {ratio !== 0 && outputBytes > 0 && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-fg-subtle)]">
                      ({ratio > 0 ? '−' : '+'}{Math.abs(ratio)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Target format picker */}
        <div className="space-y-1.5">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            Convert to
          </div>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTarget(f.id)}
              className={cn(
                'group flex w-full items-center justify-between border px-3 py-2.5 text-left transition',
                target === f.id
                  ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white'
                  : 'border-black/[0.08] bg-[var(--color-surface-1)] text-[var(--color-fg)] hover:border-black/20',
              )}
            >
              <div>
                <div className="text-[13px] font-bold">{f.label}</div>
                <div className={cn(
                  'text-[10px]',
                  target === f.id ? 'text-white/75' : 'text-[var(--color-fg-subtle)]',
                )}>
                  {f.sub}
                </div>
              </div>
              {target === f.id && <span className="text-[18px] leading-none">→</span>}
            </button>
          ))}
        </div>

        {/* Quality (only for lossy) */}
        {targetMeta?.lossy && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
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
          Download .{FORMAT_TO_EXT[target]}
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

function guessExt(file: File): string {
  const m = file.name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : (file.type.replace('image/', '') || '');
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
