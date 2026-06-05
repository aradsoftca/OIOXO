'use client';

import * as React from 'react';
import { Download, Loader2, Wand2, Image as ImageIcon } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { rasterizePdf } from '@/engines/pdf/rasterize';

type Format = 'png' | 'jpeg' | 'webp';

const RESOLUTIONS = [
  { label: 'Web', edge: 1200 },
  { label: 'Standard', edge: 1600 },
  { label: 'Print', edge: 2400 },
];

export default function PdfToImagesTool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [format, setFormat] = React.useState<Format>('png');
  const [edge, setEdge] = React.useState(1600);
  const [quality, setQuality] = React.useState(0.92);
  const [previews, setPreviews] = React.useState<{ index: number; url: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ page: number; total: number } | null>(null);
  const [error, setError] = React.useState('');

  // Unmount-only. Previous [previews] dep revoked URLs of previews still on
  // screen each time the list grew.
  const previewsRef = React.useRef<typeof previews>([]);
  React.useEffect(() => { previewsRef.current = previews; }, [previews]);
  React.useEffect(() => () => {
    previewsRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';

  const render = async (target: PdfFileItem): Promise<{ index: number; blob: Blob }[]> => {
    const rendered = await rasterizePdf(target.buffer, {
      maxEdge: edge,
      background: '#ffffff',
      onProgress: (p) => setProgress({ page: p.page, total: p.pageCount }),
    });
    const out: { index: number; blob: Blob }[] = [];
    for (const r of rendered) {
      const blob: Blob = await new Promise((resolve, reject) => {
        r.canvas.toBlob((b) => b ? resolve(b) : reject(new Error('encode failed')), mime, quality);
      });
      out.push({ index: r.index, blob });
    }
    return out;
  };

  const run = async () => {
    if (!item) return;
    setBusy(true); setError('');
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews([]);
    setProgress(null);
    try {
      const pages = await render(item);
      setPreviews(pages.map((p) => ({ index: p.index, url: URL.createObjectURL(p.blob) })));
    } catch (e) {
      setError((e as Error).message || 'Could not render this PDF.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadZip = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const pages = await render(item);
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const base = item.file.name.replace(/\.[^.]+$/, '');
      for (const p of pages) {
        const buf = await p.blob.arrayBuffer();
        zip.file(`${base}-page-${String(p.index + 1).padStart(3, '0')}.${format}`, buf);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `${base}-pages.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = (idx: number) => {
    const p = previews[idx];
    if (!p || !item) return;
    const base = item.file.name.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = p.url;
    a.download = `${base}-page-${String(p.index + 1).padStart(3, '0')}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            {previews.length > 0 && <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{previews.length} pages</span>}
            <button type="button" onClick={() => { setItem(null); setPreviews([]); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              {!previews.length && !busy && (
                <div className="grid place-items-center py-12 text-center text-[13px] text-[var(--color-fg-subtle)]">
                  Press <strong className="mx-1">Preview</strong> to render pages, then download all as ZIP or each one alone.
                </div>
              )}
              {busy && (
                <div className="px-2 py-12">
                  <div className="mx-auto max-w-xs">
                    <div className="flex items-center gap-2 text-[13px] text-[var(--color-fg)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-medium">{progress ? `Rendering page ${progress.page} / ${progress.total}` : 'Rendering…'}</span>
                      {progress && <span className="ml-auto font-mono text-[var(--color-fg-muted)]">{Math.round((progress.page / Math.max(1, progress.total)) * 100)}%</span>}
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden bg-black/[0.06]">
                      <div className="h-full bg-[var(--color-cat-pdf)] transition-[width] duration-200 ease-out"
                        style={{ width: `${progress ? Math.round((progress.page / Math.max(1, progress.total)) * 100) : 8}%` }} />
                    </div>
                  </div>
                </div>
              )}
              {previews.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {previews.map((p, i) => (
                    <button key={p.index} type="button" onClick={() => downloadOne(i)}
                      className="group relative aspect-[3/4] border border-black/[0.08] bg-black/[0.02] transition hover:border-[var(--color-cat-pdf)]">
                      <img src={p.url} alt={`page ${p.index + 1}`} className="absolute inset-0 h-full w-full object-contain" />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] font-mono text-white">
                        Page {p.index + 1}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Format</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(['png', 'jpeg', 'webp'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Resolution</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {RESOLUTIONS.map((r) => (
                    <button key={r.edge} type="button" onClick={() => setEdge(r.edge)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${edge === r.edge ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">Longest edge ≈ {edge}px</div>
              </div>

              {format !== 'png' && (
                <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Quality {Math.round(quality * 100)}%</div>
                  <input type="range" min={0.5} max={1} step={0.02} value={quality}
                    onChange={(e) => setQuality(parseFloat(e.target.value))}
                    className="mt-2 w-full" />
                </div>
              )}

              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Preview
              </button>

              <button type="button" onClick={downloadZip} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download ZIP
              </button>

              {error && <div className="text-[12px] text-red-600">{error}</div>}

              {previews.length > 0 && (
                <div className="text-[11px] text-[var(--color-fg-subtle)] flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3" /> Click a thumbnail to download just that page.
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
