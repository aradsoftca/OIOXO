'use client';

import * as React from 'react';
import { Upload, X, Download, Loader2 } from 'lucide-react';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { mapWithConcurrency } from '@/lib/compute/concurrency';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

export interface BatchItem {
  file: File;
  url: string;
  bitmap: ImageBitmap;
}

export interface BatchImageProps {
  /** Settings panel (lives in the parent so it can hold its own state). */
  controls: React.ReactNode;
  /** Transform one image; return the output blob + filename. */
  process: (item: BatchItem, index: number) => Promise<{ blob: Blob; name: string }>;
  zipName: string;
  cta?: string;
  accept?: string;
  /** Tool-specific policy key (e.g. 'image-batch-resize'). When set, the
   * batch+input-size levers from that policy are enforced. */
  policyKey?: string;
}

export function BatchImage({ controls, process, zipName, cta = 'Process all → ZIP', accept = 'image/*', policyKey }: BatchImageProps) {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [items, setItems] = React.useState<BatchItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { guard, gate } = useUsageGate('image');

  // Track the live items list in a ref so the UNMOUNT cleanup can free
  // resources without freeing them on every re-render. Previously the cleanup
  // depended on `items`, so adding a new image revoked the URLs and closed the
  // bitmaps of every existing item — thumbnails went broken and processing
  // failed because the bitmaps were already detached.
  // Per-item cleanup on remove/clear is handled inline in those handlers.
  const itemsRef = React.useRef<BatchItem[]>([]);
  React.useEffect(() => { itemsRef.current = items; }, [items]);
  React.useEffect(() => () => {
    itemsRef.current.forEach((i) => { URL.revokeObjectURL(i.url); i.bitmap.close(); });
  }, []);

  const add = async (files: FileList | File[]) => {
    setError('');
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) { setError('Drop one or more images.'); return; }
    // Decode with bounded concurrency: a large drop can't spike memory by
    // holding hundreds of full-res bitmaps in flight at once.
    const loaded = await mapWithConcurrency(list, async (file) => ({
      file, url: URL.createObjectURL(file), bitmap: await createImageBitmap(file),
    }));
    setItems((prev) => [...prev, ...loaded]);
  };

  const removeAt = (i: number) => setItems((prev) => {
    URL.revokeObjectURL(prev[i].url); prev[i].bitmap.close();
    return prev.filter((_, idx) => idx !== i);
  });

  const run = async () => {
    if (!items.length) return;
    // Compute the largest input size once via a fold — Math.max(...arr) blows
    // V8's argument-count stack on a 10k+ folder-drop.
    let maxBytes = 0;
    for (const it of items) if (it.file.size > maxBytes) maxBytes = it.file.size;
    if (policyKey) {
      const batchHit = checkLever(policyKey, 'batch', items.length, isPro);
      if (batchHit) { policyGate.fire(batchHit); return; }
      const sizeHit = checkLever(policyKey, 'input-size', maxBytes, isPro);
      if (sizeHit) { policyGate.fire(sizeHit); return; }
    }
    // Gate on the largest image in the batch (each is processed individually).
    if (!(await guard({ bytes: maxBytes }))) return;
    setBusy(true); setError(''); setProgress({ done: 0, total: items.length });
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      // Process several images at once (bounded, to leave the system headroom),
      // updating progress as each finishes. Order is preserved for naming.
      const outputs = await mapWithConcurrency(
        items,
        (item, i) => process(item, i),
        undefined,
        (done) => setProgress({ done, total: items.length }),
      );
      const seen = new Map<string, number>();
      for (const { blob, name } of outputs) {
        // de-dupe identical output names
        const n = seen.get(name) ?? 0; seen.set(name, n + 1);
        zip.file(n === 0 ? name : name.replace(/(\.[^.]+)$/, `-${n}$1`), await blob.arrayBuffer());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = zipName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      // Defer revoke — mobile Safari/Firefox can abort the download if the
      // blob URL is torn down before the stream starts. For large batch
      // zips this is particularly important since download starts later.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {gate}
      {policyGate.element}
      <div
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void add(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] p-5"
      >
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
          <Upload className="h-4 w-4" />
          Drop images here or click to add (process them all at once)
        </button>
        <input ref={inputRef} type="file" accept={accept} multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{items.length} images</span>
              <button type="button" onClick={() => { items.forEach((i) => { URL.revokeObjectURL(i.url); i.bitmap.close(); }); setItems([]); }}
                className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Clear all</button>
            </div>
            <div className="grid max-h-[420px] grid-cols-4 gap-2 overflow-y-auto p-3 sm:grid-cols-6">
              {items.map((it, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden border border-black/[0.08]">
                  <img src={it.url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeAt(i)}
                    className="absolute right-0.5 top-0.5 bg-black/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-3">
            {controls}
            <button type="button" onClick={run} disabled={busy}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy && progress ? `${progress.done}/${progress.total}…` : cta}
            </button>
            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
