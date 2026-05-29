'use client';

import * as React from 'react';
import { BatchImage, type BatchItem } from '@/components/tool/BatchImage';

type Target = 'jpeg' | 'webp';

export default function ImageBatchCompressTool() {
  const [target, setTarget] = React.useState<Target>('jpeg');
  const [quality, setQuality] = React.useState(0.7);
  const [maxEdge, setMaxEdge] = React.useState(0); // 0 = keep size

  const process = React.useCallback(async (item: BatchItem) => {
    const { bitmap, file } = item;
    let w = bitmap.width, h = bitmap.height;
    if (maxEdge > 0) {
      const scale = maxEdge / Math.max(w, h);
      if (scale < 1) { w = Math.round(w * scale); h = Math.round(h * scale); }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (target === 'jpeg') { ctx!.fillStyle = '#fff'; ctx!.fillRect(0, 0, w, h); }
    ctx?.drawImage(bitmap, 0, 0, w, h);
    const mime = target === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const ext = target === 'jpeg' ? 'jpg' : 'webp';
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode')), mime, quality));
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + `.${ext}` };
  }, [target, quality, maxEdge]);

  const controls = (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(['jpeg', 'webp'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTarget(t)}
              className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${target === t ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
              {t === 'jpeg' ? 'JPG' : 'WebP'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Quality</span>
          <span className="font-mono text-[12px] tabular-nums">{Math.round(quality * 100)}%</span>
        </div>
        <input type="range" min={0.3} max={1} step={0.02} value={quality} onChange={(e) => setQuality(parseFloat(e.target.value))} className="mt-2 w-full" />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Cap longest edge</span>
          <span className="font-mono text-[12px] tabular-nums">{maxEdge === 0 ? 'off' : `${maxEdge}px`}</span>
        </div>
        <input type="range" min={0} max={4000} step={100} value={maxEdge} onChange={(e) => setMaxEdge(parseInt(e.target.value, 10))} className="mt-2 w-full" />
      </div>
    </div>
  );

  return <BatchImage controls={controls} process={process} zipName="compressed-images.zip" cta="Compress all → ZIP" policyKey="image-batch-compress" />;
}
