'use client';

import * as React from 'react';
import { Download, Loader2, Box } from 'lucide-react';
import { cadKind } from '@/engines/cad';
import { convertCadInWorker } from '@/engines/cad/client';
import { ConvertDropZone } from '@/components/tool/ConvertDropZone';
import { extOf } from '@/lib/convert/matrix';

type Target = 'stl' | 'obj';

export default function CadConvertTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [target, setTarget] = React.useState<Target>('stl');
  const [busy, setBusy] = React.useState(false);
  const [stats, setStats] = React.useState<{ parts: number; triangles: number } | null>(null);
  const [error, setError] = React.useState('');

  const load = (f: File) => {
    if (!cadKind(extOf(f.name))) { setError('Please choose a STEP (.step/.stp), IGES (.iges/.igs) or BREP file.'); return; }
    setFile(f); setError(''); setStats(null);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true); setError(''); setStats(null);
    try {
      const kind = cadKind(extOf(file.name))!;
      const { text, stats } = await convertCadInWorker(file, kind, target);
      setStats(stats);
      const blob = new Blob([text], { type: 'text/plain' });
      const base = file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `${base}.${target}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      setError((e as Error).message || 'Conversion failed.');
    } finally { setBusy(false); }
  };

  // Keyboard: Enter tessellates the loaded CAD file, Esc clears it.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!file) return;
      if (e.key === 'Enter' && !busy) { e.preventDefault(); void run(); }
      else if (e.key === 'Escape') { e.preventDefault(); setFile(null); setStats(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4">
      {!file && (
        <ConvertDropZone
          accept=".step,.stp,.iges,.igs,.brep"
          label="Drop a CAD file, click to browse, or paste"
          sublabel="STEP · IGES · BREP"
          onFiles={(files) => load(files[0])}
        />
      )}

      {file && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <Box className="h-4 w-4 text-[var(--color-cat-convert)]" />
              <span className="text-[12px] font-semibold">{file.name}</span>
              <button type="button" onClick={() => { setFile(null); setStats(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
            </div>
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
              CAD solids are tessellated into a triangle mesh — perfect for 3D printing (STL) or the web (OBJ). The original parametric geometry isn&apos;t preserved.
              {stats && <div className="mt-2 font-mono text-[var(--color-fg)]">{stats.parts} part{stats.parts === 1 ? '' : 's'} · {stats.triangles.toLocaleString()} triangles</div>}
            </div>
          </div>
          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output format</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(['stl', 'obj'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTarget(t)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${target === t ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">STL for 3D printing/slicers. OBJ keeps separate parts.</div>
            </div>
            <button type="button" onClick={run} disabled={busy}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Box className="h-3.5 w-3.5" />} {busy ? 'Tessellating…' : `Convert to ${target.toUpperCase()}`}
            </button>
            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
