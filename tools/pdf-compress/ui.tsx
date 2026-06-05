'use client';
import { stampPdfFooter } from '@/engines/pdf';

import * as React from 'react';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { rasterizePdf } from '@/engines/pdf/rasterize';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'pdf-compress';

interface Level { id: string; label: string; edge: number; quality: number; hint: string }

const LEVELS: Level[] = [
  { id: 'high',   label: 'Light',  edge: 2200, quality: 0.82, hint: 'Barely visible change. Best when you still need crisp detail.' },
  { id: 'medium', label: 'Balanced', edge: 1700, quality: 0.7,  hint: 'Recommended. Big size drop, still clean on screen.' },
  { id: 'low',    label: 'Strong', edge: 1300, quality: 0.6,  hint: 'Smallest files. Good for email and quick sharing.' },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function PdfCompressTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [levelId, setLevelId] = React.useState('medium');
  const [grayscale, setGrayscale] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ page: number; total: number } | null>(null);
  const [result, setResult] = React.useState<{ blob: Blob; size: number } | null>(null);
  const [error, setError] = React.useState('');

  const level = LEVELS.find((l) => l.id === levelId)!;
  const originalSize = item?.file.size ?? 0;

  const run = async () => {
    if (!item) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'input-size', value: item.file.size },
    ]);
    if (!ok) return;
    setBusy(true); setError(''); setResult(null); setProgress(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pages = await rasterizePdf(item.buffer, {
        maxEdge: level.edge,
        background: '#ffffff',
        onProgress: (p) => setProgress({ page: p.page, total: p.pageCount }),
      });

      const doc = await PDFDocument.create();
      for (const p of pages) {
        let source: HTMLCanvasElement = p.canvas;
        if (grayscale) {
          const gc = document.createElement('canvas');
          gc.width = p.canvas.width; gc.height = p.canvas.height;
          const gctx = gc.getContext('2d');
          if (gctx) {
            gctx.drawImage(p.canvas, 0, 0);
            const id = gctx.getImageData(0, 0, gc.width, gc.height);
            const d = id.data;
            for (let i = 0; i < d.length; i += 4) {
              const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
              d[i] = d[i + 1] = d[i + 2] = y;
            }
            gctx.putImageData(id, 0, 0);
            source = gc;
          }
        }
        const jpegBlob: Blob = await new Promise((resolve, reject) =>
          source.toBlob((b) => b ? resolve(b) : reject(new Error('encode failed')), 'image/jpeg', level.quality));
        const jpeg = await doc.embedJpg(await jpegBlob.arrayBuffer());
        const page = doc.addPage([p.width, p.height]);
        page.drawImage(jpeg, { x: 0, y: 0, width: p.width, height: p.height });
      }

      await stampPdfFooter(doc); const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      setResult({ blob, size: blob.size });
    } catch (e) {
      setError((e as Error).message || 'Could not compress this PDF.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const download = () => {
    if (!result || !item) return;
    const a = document.createElement('a');
    const href = URL.createObjectURL(result.blob);
    a.href = href;
    a.download = item.file.name.replace(/\.[^.]+$/, '') + '-compressed.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const saving = result && originalSize ? (1 - result.size / originalSize) * 100 : 0;

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!item && <PdfDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{formatBytes(originalSize)}</span>
            <button type="button" onClick={() => { setItem(null); setResult(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change
            </button>
          </div>

          <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This rebuilds each page as a flattened image — perfect for scans and image-heavy files, but selectable text becomes part of the picture. For text PDFs, keep the original.
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              {!result && !busy && (
                <div className="grid place-items-center py-12 text-center text-[13px] text-[var(--color-fg-subtle)]">
                  Choose a compression level, then press <strong className="mx-1">Compress</strong>.
                </div>
              )}
              {busy && (
                <div className="px-2 py-12">
                  <div className="mx-auto max-w-xs">
                    <div className="flex items-center gap-2 text-[13px] text-[var(--color-fg)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-medium">{progress ? `Processing page ${progress.page} / ${progress.total}` : 'Working…'}</span>
                      {progress && <span className="ml-auto font-mono text-[var(--color-fg-muted)]">{Math.round((progress.page / Math.max(1, progress.total)) * 100)}%</span>}
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden bg-black/[0.06]">
                      <div className="h-full bg-[var(--color-cat-pdf)] transition-[width] duration-200 ease-out"
                        style={{ width: `${progress ? Math.round((progress.page / Math.max(1, progress.total)) * 100) : 8}%` }} />
                    </div>
                  </div>
                </div>
              )}
              {result && (
                <div className="space-y-4 py-6 text-center">
                  <div className="grid grid-cols-3 items-center gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">Before</div>
                      <div className="font-mono text-[18px] font-bold">{formatBytes(originalSize)}</div>
                    </div>
                    <div className="text-[24px] text-[var(--color-fg-subtle)]">→</div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">After</div>
                      <div className="font-mono text-[18px] font-bold text-[var(--color-cat-pdf)]">{formatBytes(result.size)}</div>
                    </div>
                  </div>
                  <div className={`text-[14px] font-semibold ${saving > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {saving > 0 ? `${saving.toFixed(0)}% smaller` : 'Already well-optimized — little to gain'}
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Level</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {LEVELS.map((l) => (
                    <button key={l.id} type="button" onClick={() => setLevelId(l.id)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${levelId === l.id ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">{level.hint}</div>
              </div>

              <label className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] text-[var(--color-fg)]">
                <span className="font-medium">Convert to grayscale</span>
                <input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} className="h-4 w-4" />
              </label>

              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {busy ? 'Compressing…' : 'Compress'}
              </button>

              {result && (
                <button type="button" onClick={download}
                  className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </button>
              )}

              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
