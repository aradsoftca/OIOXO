'use client';

import * as React from 'react';
import { Upload, Copy, Download, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ColorBucket {
  r: number; g: number; b: number;
  count: number;
}

function hex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function readableTextColor(r: number, g: number, b: number): string {
  // YIQ luminance check.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000' : '#fff';
}

/**
 * Mini k-means in RGB. Samples the canvas at a stride to keep work bounded.
 */
function kmeans(pixels: Uint8ClampedArray, k: number, sampleStride = 4, iters = 12): ColorBucket[] {
  const samples: [number, number, number][] = [];
  for (let i = 0; i < pixels.length; i += 4 * sampleStride) {
    const a = pixels[i + 3];
    if (a < 128) continue;
    samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (!samples.length) return [];

  // Seed using k spread-out samples.
  const centers: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(samples.length / k));
  for (let i = 0; i < k; i++) centers.push(samples[Math.min(samples.length - 1, i * step)].slice() as [number, number, number]);

  const assignments = new Int32Array(samples.length);
  for (let it = 0; it < iters; it++) {
    // Assign
    for (let i = 0; i < samples.length; i++) {
      const [r, g, b] = samples[i];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = r - centers[c][0], dg = g - centers[c][1], db = b - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = c; }
      }
      assignments[i] = best;
    }
    // Update
    const sums = new Float64Array(k * 3);
    const counts = new Int32Array(k);
    for (let i = 0; i < samples.length; i++) {
      const c = assignments[i];
      sums[c * 3]     += samples[i][0];
      sums[c * 3 + 1] += samples[i][1];
      sums[c * 3 + 2] += samples[i][2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c]) {
        centers[c][0] = sums[c * 3] / counts[c];
        centers[c][1] = sums[c * 3 + 1] / counts[c];
        centers[c][2] = sums[c * 3 + 2] / counts[c];
      }
    }
  }
  const counts = new Int32Array(k);
  for (let i = 0; i < samples.length; i++) counts[assignments[i]]++;
  const out: ColorBucket[] = [];
  for (let c = 0; c < k; c++) {
    out.push({ r: centers[c][0], g: centers[c][1], b: centers[c][2], count: counts[c] });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

export default function ImageColorExtractTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [colors, setColors] = React.useState<ColorBucket[]>([]);
  const [count, setCount] = React.useState(8);
  const [sort, setSort] = React.useState<'frequency' | 'hue'>('frequency');
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const extract = React.useCallback(async (next: File, k: number) => {
    setBusy(true);
    try {
      const bm = await createImageBitmap(next);
      const maxEdge = 320;
      const scale = Math.min(1, maxEdge / Math.max(bm.width, bm.height));
      const w = Math.max(1, Math.round(bm.width * scale));
      const h = Math.max(1, Math.round(bm.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bm, 0, 0, w, h);
      bm.close();
      const data = ctx.getImageData(0, 0, w, h).data;
      const buckets = kmeans(data, k, 2, 14);
      setColors(buckets);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(next));
    setFile(next);
    void extract(next, count);
  };

  React.useEffect(() => {
    if (file) void extract(file, count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const sortedColors = React.useMemo(() => {
    if (sort === 'hue') {
      return [...colors].sort((a, b) => rgbToHsl(a.r, a.g, a.b)[0] - rgbToHsl(b.r, b.g, b.b)[0]);
    }
    return colors;
  }, [colors, sort]);

  const total = colors.reduce((s, c) => s + c.count, 0);

  const copyHex = async (c: ColorBucket) => {
    const h = hex(c.r, c.g, c.b);
    await navigator.clipboard.writeText(h);
    setCopied(h);
    setTimeout(() => setCopied(null), 1200);
  };

  const copyAll = async () => {
    const lines = sortedColors.map((c) => hex(c.r, c.g, c.b)).join('\n');
    await navigator.clipboard.writeText(lines);
    setCopied('all');
    setTimeout(() => setCopied(null), 1200);
  };

  const downloadJson = () => {
    if (!file || !colors.length) return;
    const out = sortedColors.map((c) => {
      const [hh, ss, ll] = rgbToHsl(c.r, c.g, c.b);
      return {
        hex: hex(c.r, c.g, c.b),
        rgb: [Math.round(c.r), Math.round(c.g), Math.round(c.b)],
        hsl: [Math.round(hh), Math.round(ss), Math.round(ll)],
        percent: total ? +(100 * c.count / total).toFixed(2) : 0,
      };
    });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name.replace(/\.[^.]+$/, '') + '.palette.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      {!file && (
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
        >
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" />
            Drop an image to extract its palette
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
        </div>
      )}

      {file && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <span className="text-[12px] font-semibold">{file.name}</span>
              {busy && <span className="text-[11px] text-[var(--color-fg-muted)]">Analyzing…</span>}
              <button type="button" onClick={() => { setFile(null); setColors([]); }}
                className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                Change
              </button>
            </div>

            {previewUrl && (
              <div className="overflow-hidden border border-black/[0.08] bg-black/5">
                <img src={previewUrl} alt="" className="block h-auto max-h-[320px] w-full object-contain" />
              </div>
            )}

            {colors.length > 0 && (
              <>
                <div className="flex h-12 overflow-hidden border border-black/[0.08]">
                  {sortedColors.map((c, i) => (
                    <div key={i} className="h-full" style={{ flex: c.count, background: hex(c.r, c.g, c.b) }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {sortedColors.map((c, i) => {
                    const h = hex(c.r, c.g, c.b);
                    const pct = total ? (100 * c.count / total) : 0;
                    return (
                      <button key={i} type="button" onClick={() => copyHex(c)}
                        className="group border border-black/[0.08] text-left transition hover:border-[var(--color-fg)]">
                        <div className="flex h-16 items-center justify-end px-3" style={{ background: h, color: readableTextColor(c.r, c.g, c.b) }}>
                          <span className="font-mono text-[12px] font-bold tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                          <span className="font-mono uppercase text-[var(--color-fg)]">{h}</span>
                          {copied === h ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-[var(--color-fg-muted)] opacity-0 group-hover:opacity-100" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Colors</span>
                  <span className="font-mono text-[12px] tabular-nums">{count}</span>
                </div>
                <input type="range" min={2} max={16} step={1} value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10))}
                  className="mt-2 w-full" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Sort by</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(['frequency', 'hue'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setSort(s)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${sort === s ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="button" onClick={copyAll} disabled={!colors.length}
              className={cn(
                'flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium transition disabled:opacity-60',
                copied === 'all' ? 'bg-green-100 text-green-900' : 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]',
              )}>
              {copied === 'all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'all' ? 'All hex copied' : 'Copy all hex'}
            </button>
            <button type="button" onClick={downloadJson} disabled={!colors.length}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
              <Download className="h-3.5 w-3.5" />
              Download .json
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
