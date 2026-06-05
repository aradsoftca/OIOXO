'use client';

import * as React from 'react';
import { Download, Loader2, X, Box } from 'lucide-react';
import { type Model3dTarget } from '@/engines/model3d';
import { convertModelInWorker } from '@/engines/model3d/client';
import { ConvertDropZone } from '@/components/tool/ConvertDropZone';

interface Item { file: File }

export default function Model3dConvertTool() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [target, setTarget] = React.useState<Model3dTarget>('glb');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<{ url: string; name: string; count: number } | null>(null);

  React.useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  const add = (files: FileList | File[]) => { setError(''); setResult(null); setItems((prev) => [...prev, ...Array.from(files).map((file) => ({ file }))]); };
  const removeAt = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const primary = items[0]?.file.name.replace(/\.[^.]+$/, '') || 'model';

  const run = async () => {
    if (!items.length) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const files = await Promise.all(items.map(async (it) => ({ name: it.file.name, data: new Uint8Array(await it.file.arrayBuffer()) })));
      const out = await convertModelInWorker(files, target);
      let url: string, name: string;
      if (out.files.length === 1) {
        url = URL.createObjectURL(new Blob([out.files[0].data as unknown as BlobPart], { type: 'application/octet-stream' }));
        name = out.files[0].name;
      } else {
        const { zipFiles } = await import('@/engines/archive');
        const zip = await zipFiles(out.files);
        url = URL.createObjectURL(zip);
        name = `${primary}-gltf.zip`;
      }
      setResult({ url, name, count: out.files.length });
    } catch (e) {
      setError((e as Error).message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = result.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Keyboard: Enter converts the queued models, Esc clears the queue.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!items.length) return;
      if (e.key === 'Enter' && !busy) { e.preventDefault(); void run(); }
      else if (e.key === 'Escape') { e.preventDefault(); setItems([]); setResult(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <ConvertDropZone
          multiple
          compact
          label={items.length ? 'Add more files, or paste' : 'Drop a 3D model (+ .mtl / textures), click to browse, or paste'}
          sublabel={items.length ? undefined : 'OBJ · STL · PLY · GLTF · FBX · DAE'}
          onFiles={(files) => add(files)}
        />

        {items.length > 0 && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-black/[0.04] px-3 py-2 last:border-b-0">
                <Box className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-muted)]" />
                <span className="flex-1 truncate font-mono text-[12px] text-[var(--color-fg)]">{it.file.name}</span>
                {i === 0 && <span className="bg-black/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">main</span>}
                <button type="button" onClick={() => removeAt(i)} className="text-[var(--color-fg-muted)] hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-[12px] text-red-600">{error}</div>}

        {result && (
          <div className="border border-[var(--color-cat-convert)]/40 bg-[var(--color-cat-convert)]/5 p-4">
            <div className="text-[13px] font-semibold text-[var(--color-fg)]">Ready: {result.name}</div>
            <button type="button" onClick={download} className="mt-3 flex items-center gap-2 bg-[var(--color-cat-convert)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output format</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {([['glb', 'GLB'], ['gltf', 'glTF']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setTarget(v)}
                className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${target === v ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">GLB is a single self-contained file (best for the web). glTF splits into .gltf + .bin (zipped).</div>
        </div>
        <button type="button" onClick={run} disabled={busy || !items.length}
          className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Box className="h-3.5 w-3.5" />} {busy ? 'Converting…' : `Convert to ${target.toUpperCase()}`}
        </button>
      </aside>
    </div>
  );
}
