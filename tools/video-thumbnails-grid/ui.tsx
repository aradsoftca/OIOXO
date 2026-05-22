'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { buildThumbnailGrid, downloadBlob } from '@/engines/video';

const PRESETS = [
  { cols: 3, rows: 3, label: '3 × 3' },
  { cols: 4, rows: 4, label: '4 × 4' },
  { cols: 5, rows: 5, label: '5 × 5' },
  { cols: 4, rows: 3, label: '4 × 3' },
];

const CELL_WIDTHS = [160, 240, 320, 480];

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [preset, setPreset] = React.useState(PRESETS[1]);
  const [cellWidth, setCellWidth] = React.useState(240);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => {
    if (item?.url) URL.revokeObjectURL(item.url);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [item, previewUrl]);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const blob = await buildThumbnailGrid(item.video, preset.cols, preset.rows, cellWidth);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const u = URL.createObjectURL(blob);
      setPreviewUrl(u);
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + `-sheet-${preset.cols}x${preset.rows}.jpg`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.width}×{item.info.height}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-2)] aspect-video flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="grid preview" className="max-h-full max-w-full" />
              ) : (
                <div className="text-[12px] text-[var(--color-fg-muted)]">Preview will appear after build</div>
              )}
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Layout</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map((p) => (
                      <button key={p.label} type="button" onClick={() => setPreset(p)}
                        className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${preset.label === p.label ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">{preset.cols * preset.rows} frames evenly sampled</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Cell width (px)</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CELL_WIDTHS.map((w) => (
                      <button key={w} type="button" onClick={() => setCellWidth(w)}
                        className={`border py-2 text-[11px] font-mono tabular-nums transition ${cellWidth === w ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? `Building… ${progress}%` : 'Build & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
