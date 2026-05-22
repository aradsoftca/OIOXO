'use client';

import * as React from 'react';
import { BatchImage, type BatchItem } from '@/components/tool/BatchImage';

type Target = 'png' | 'jpeg' | 'webp';

export default function ImageBatchConvertTool() {
  const [target, setTarget] = React.useState<Target>('webp');
  const [quality, setQuality] = React.useState(0.92);
  const [bg, setBg] = React.useState('#ffffff');

  const process = React.useCallback(async (item: BatchItem) => {
    const { bitmap, file } = item;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (target === 'jpeg') { ctx!.fillStyle = bg; ctx!.fillRect(0, 0, canvas.width, canvas.height); }
    ctx?.drawImage(bitmap, 0, 0);
    const mime = target === 'png' ? 'image/png' : target === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const ext = target === 'jpeg' ? 'jpg' : target;
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode')), mime, quality));
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + `.${ext}` };
  }, [target, quality, bg]);

  const controls = (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Convert to</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(['png', 'jpeg', 'webp'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTarget(t)}
              className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${target === t ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
              {t === 'jpeg' ? 'JPG' : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {target !== 'png' && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Quality</span>
            <span className="font-mono text-[12px] tabular-nums">{Math.round(quality * 100)}%</span>
          </div>
          <input type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(parseFloat(e.target.value))} className="mt-2 w-full" />
        </div>
      )}
      {target === 'jpeg' && (
        <label className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
          Background (for transparent areas)
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-7 w-9 cursor-pointer border border-black/[0.08]" />
        </label>
      )}
    </div>
  );

  return <BatchImage controls={controls} process={process} zipName={`converted-${target === 'jpeg' ? 'jpg' : target}.zip`} cta="Convert all → ZIP" />;
}
