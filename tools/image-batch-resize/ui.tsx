'use client';

import * as React from 'react';
import { BatchImage, type BatchItem } from '@/components/tool/BatchImage';

type Mode = 'longest' | 'width' | 'percent';

export default function ImageBatchResizeTool() {
  const [mode, setMode] = React.useState<Mode>('longest');
  const [value, setValue] = React.useState(1280);
  const [pct, setPct] = React.useState(50);

  const process = React.useCallback(async (item: BatchItem) => {
    const { bitmap, file } = item;
    let w = bitmap.width, h = bitmap.height;
    if (mode === 'longest') {
      const scale = value / Math.max(w, h);
      if (scale < 1) { w = Math.round(w * scale); h = Math.round(h * scale); }
    } else if (mode === 'width') {
      const scale = value / w; w = value; h = Math.round(h * scale);
    } else {
      w = Math.round(w * pct / 100); h = Math.round(h * pct / 100);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, w); canvas.height = Math.max(1, h);
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const isPng = /png$/i.test(file.type) || /\.png$/i.test(file.name);
    const mime = isPng ? 'image/png' : 'image/jpeg';
    const ext = isPng ? 'png' : 'jpg';
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode')), mime, 0.9));
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + `.${ext}` };
  }, [mode, value, pct]);

  const controls = (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Resize by</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(['longest', 'width', 'percent'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${mode === m ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
              {m === 'longest' ? 'Longest' : m === 'width' ? 'Width' : 'Percent'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'percent' ? (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Scale</span>
            <span className="font-mono text-[12px] tabular-nums">{pct}%</span>
          </div>
          <input type="range" min={5} max={100} step={5} value={pct} onChange={(e) => setPct(parseInt(e.target.value, 10))} className="mt-2 w-full" />
        </div>
      ) : (
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{mode === 'longest' ? 'Max longest edge' : 'Target width'} (px)</span>
          <input type="number" min={16} max={8000} value={value} onChange={(e) => setValue(parseInt(e.target.value, 10) || 1280)}
            className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)]" />
        </label>
      )}
      <div className="text-[11px] text-[var(--color-fg-subtle)]">Output keeps each file&apos;s original format (PNG stays PNG, everything else → JPG).</div>
    </div>
  );

  return <BatchImage controls={controls} process={process} zipName="resized-images.zip" cta="Resize all → ZIP" policyKey="image-batch-resize" />;
}
