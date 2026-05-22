'use client';

import * as React from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';

type Format = 'png' | 'jpeg';

export default function ImageSplitTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [url, setUrl] = React.useState('');
  const [cols, setCols] = React.useState(3);
  const [rows, setRows] = React.useState(3);
  const [format, setFormat] = React.useState<Format>('png');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => () => { bitmap?.close(); if (url) URL.revokeObjectURL(url); }, [bitmap, url]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    bitmap?.close();
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(next));
    const bm = await createImageBitmap(next);
    setBitmap(bm);
    setFile(next);
  };

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';

  const sliceAll = async (): Promise<{ name: string; blob: Blob }[]> => {
    if (!bitmap || !file) return [];
    const tileW = Math.floor(bitmap.width / cols);
    const tileH = Math.floor(bitmap.height / rows);
    const base = file.name.replace(/\.[^.]+$/, '');
    const out: { name: string; blob: Blob }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const canvas = document.createElement('canvas');
        canvas.width = tileW; canvas.height = tileH;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(bitmap, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
        const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode')), mime, 0.92));
        out.push({ name: `${base}-r${r + 1}c${c + 1}.${format === 'jpeg' ? 'jpg' : 'png'}`, blob });
      }
    }
    return out;
  };

  const download = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const tiles = await sliceAll();
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const t of tiles) zip.file(t.name, await t.blob.arrayBuffer());
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name.replace(/\.[^.]+$/, '') + `-${cols}x${rows}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        {!file ? (
          <div
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[4/3] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
          >
            <label className="flex cursor-pointer flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" />
              Drop an image or click to browse
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
            </label>
          </div>
        ) : (
          <div className="relative overflow-hidden border border-black/[0.08] bg-black/5">
            <img src={url} alt="" className="block h-auto w-full" />
            {/* grid overlay */}
            <div className="pointer-events-none absolute inset-0">
              {Array.from({ length: cols - 1 }).map((_, i) => (
                <div key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-white/70 mix-blend-difference" style={{ left: `${((i + 1) / cols) * 100}%` }} />
              ))}
              {Array.from({ length: rows - 1 }).map((_, i) => (
                <div key={`h${i}`} className="absolute left-0 right-0 h-px bg-white/70 mix-blend-difference" style={{ top: `${((i + 1) / rows) * 100}%` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          {[
            { label: 'Columns', value: cols, set: setCols },
            { label: 'Rows', value: rows, set: setRows },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{s.label}</span>
                <span className="font-mono text-[12px] tabular-nums">{s.value}</span>
              </div>
              <input type="range" min={1} max={10} step={1} value={s.value}
                onChange={(e) => s.set(parseInt(e.target.value, 10))} className="mt-2 w-full" />
            </div>
          ))}
          <div className="text-[11px] text-[var(--color-fg-subtle)]">{cols * rows} tiles{bitmap ? ` · ~${Math.floor(bitmap.width / cols)}×${Math.floor(bitmap.height / rows)}px each` : ''}</div>
          <div>
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
        </div>
        {file && (
          <>
            <button type="button" onClick={download} disabled={busy}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Split & download ZIP
            </button>
            <button type="button" onClick={() => { setFile(null); bitmap?.close(); setBitmap(null); }}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              Replace image
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
