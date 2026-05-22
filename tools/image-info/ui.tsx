'use client';

import * as React from 'react';
import { Upload, Image as ImageIcon, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { detectFormat, type ImageFormat } from '@/engines/image';

interface Info {
  name: string;
  size: number;
  type: string;
  format: ImageFormat | 'unknown';
  width: number;
  height: number;
  megapixels: number;
  aspect: string;
  ratio: string;
  lastModified: number;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function aspectString(w: number, h: number): string {
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function nearestNamedRatio(w: number, h: number): string {
  const r = w / h;
  const named: [number, string][] = [
    [1,            'Square'],
    [4 / 3,        'Standard (4:3)'],
    [3 / 2,        'Classic (3:2)'],
    [16 / 9,       'Widescreen (16:9)'],
    [16 / 10,      'Golden (16:10)'],
    [21 / 9,       'Ultrawide (21:9)'],
    [9 / 16,       'Vertical (9:16)'],
    [3 / 4,        'Portrait (3:4)'],
    [2 / 3,        'Portrait classic (2:3)'],
  ];
  let best = named[0];
  let bestDelta = Math.abs(r - best[0]);
  for (const cand of named) {
    const d = Math.abs(r - cand[0]);
    if (d < bestDelta) { best = cand; bestDelta = d; }
  }
  return bestDelta < 0.02 ? best[1] : aspectString(w, h);
}

export default function ImageInfoTool() {
  const [info, setInfo] = React.useState<Info | null>(null);
  const [preview, setPreview] = React.useState<string>('');
  const [copied, setCopied] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFile = React.useCallback(async (file: File) => {
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    setPreview(url);

    const fmt = await detectFormat(file);
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to read image'));
    });

    setInfo({
      name: file.name,
      size: file.size,
      type: file.type || 'unknown',
      format: fmt ?? 'unknown',
      width: img.naturalWidth,
      height: img.naturalHeight,
      megapixels: (img.naturalWidth * img.naturalHeight) / 1_000_000,
      aspect: aspectString(img.naturalWidth, img.naturalHeight),
      ratio: nearestNamedRatio(img.naturalWidth, img.naturalHeight),
      lastModified: file.lastModified,
    });
  }, [preview]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const rows: { label: string; value: string }[] = info ? [
    { label: 'Name',          value: info.name },
    { label: 'Format',        value: info.format.toUpperCase() },
    { label: 'MIME type',     value: info.type },
    { label: 'Size',          value: formatBytes(info.size) },
    { label: 'Dimensions',    value: `${info.width} × ${info.height}` },
    { label: 'Megapixels',    value: info.megapixels.toFixed(2) + ' MP' },
    { label: 'Aspect ratio',  value: info.aspect },
    { label: 'Orientation',   value: info.ratio },
    { label: 'Modified',      value: new Date(info.lastModified).toLocaleString() },
  ] : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'relative aspect-[4/3] overflow-hidden border border-black/[0.08] bg-[oklch(20%_0.008_250)]',
          !preview && 'flex items-center justify-center',
        )}
      >
        {!preview && (
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
                Drop an image to inspect
              </div>
              <div className="mt-1 text-[13px] text-white/55">
                JPG · PNG · WebP · AVIF · GIF · BMP
              </div>
            </div>
          </button>
        )}
        {preview && (
          <img src={preview} alt="preview" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
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

      <aside className="space-y-3">
        {info ? (
          <>
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
              {rows.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => copy(r.label, r.value)}
                  className="group flex w-full items-start justify-between gap-3 border-b border-black/[0.05] px-4 py-3 text-left transition last:border-0 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
                      {r.label}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[13px] font-semibold text-[var(--color-fg)]">
                      {r.value}
                    </div>
                  </div>
                  <span className="mt-1 shrink-0 opacity-0 transition group-hover:opacity-100">
                    {copied === r.label
                      ? <Check className="h-3.5 w-3.5 text-[var(--color-cat-image)]" />
                      : <Copy className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            >
              <ImageIcon className="h-4 w-4" />
              Replace image
            </button>
          </>
        ) : (
          <div className="border border-dashed border-black/[0.1] p-6 text-center text-[12px] text-[var(--color-fg-muted)]">
            Click any field to copy it.
          </div>
        )}
      </aside>
    </div>
  );
}
