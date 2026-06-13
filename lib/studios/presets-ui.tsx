'use client';

/**
 * C4 — Preset System UI (campaign engine). A drop-in `usePresets` hook + a
 * compact `PresetBar` so any studio gets save/apply/favorite/rename/delete +
 * JSON import-export with one line. Reused across all 9 studios.
 */

import * as React from 'react';
import { Star, Save as SaveIcon, Trash2, Upload, Download, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { presetStore, type Preset, type PresetStore } from './presets';

export function usePresets<T>(
  kind: string,
  builtins?: { id: string; name: string; value: T; favorite?: boolean }[],
): { store: PresetStore<T>; presets: Preset<T>[]; refresh: () => void } {
  const store = React.useMemo(() => presetStore<T>(kind, { builtins }), [kind]);
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => store.subscribe(() => force()), [store]);
  const presets = store.list();
  return { store, presets, refresh: () => force() };
}

/**
 * Compact preset bar: a dropdown of saved presets (apply on click), a "save
 * current" affordance, per-row favorite/delete, and import/export. `capture`
 * returns the current value to save; `onApply` receives a chosen preset's value.
 */
export function PresetBar<T>({
  kind, builtins, capture, onApply, label = 'Presets', className,
}: {
  kind: string;
  builtins?: { id: string; name: string; value: T; favorite?: boolean }[];
  capture: () => T;
  onApply: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const { store, presets } = usePresets<T>(kind, builtins);
  const [open, setOpen] = React.useState(false);
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setNaming(false); } };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const doSave = () => {
    const n = name.trim();
    if (!n) return;
    store.save(n, capture());
    setName(''); setNaming(false);
  };

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
        title="Saved presets"
      >
        <Star className="h-3.5 w-3.5" /> {label} {presets.length > 0 && <span className="text-zinc-500">({presets.length})</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-white/10 bg-[#16181d] p-1.5 shadow-2xl">
          <div className="mb-1 flex items-center gap-1">
            {naming ? (
              <>
                <input
                  autoFocus value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { setNaming(false); setName(''); } }}
                  placeholder="Preset name…"
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
                />
                <button onClick={doSave} className="rounded bg-cyan-500 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-cyan-400"><Check className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <button onClick={() => setNaming(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded bg-cyan-500/15 px-2 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25">
                <SaveIcon className="h-3.5 w-3.5" /> Save current
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {presets.length === 0 && <div className="px-2 py-3 text-center text-xs text-zinc-500">No presets yet</div>}
            {presets.map(p => (
              <div key={p.id} className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/5">
                <button onClick={() => store.toggleFavorite(p.id)} title="Favorite" className={cn('shrink-0', p.favorite ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400')}>
                  <Star className="h-3 w-3" fill={p.favorite ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => { onApply(p.value); setOpen(false); }} className="min-w-0 flex-1 truncate py-1 text-left text-xs text-zinc-200" title={`Apply ${p.name}`}>
                  {p.name}{p.builtin && <span className="ml-1 text-[9px] text-zinc-600">built-in</span>}
                </button>
                {!p.builtin && (
                  <button onClick={() => store.remove(p.id)} title="Delete" className="shrink-0 text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1 border-t border-white/5 pt-1">
            <button onClick={() => { const blob = new Blob([store.exportJson()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${kind.replace(/\./g, '-')}-presets.json`; a.click(); URL.revokeObjectURL(url); }}
              className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/5" title="Export presets">
              <Download className="h-3 w-3" /> Export
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/5" title="Import presets">
              <Upload className="h-3 w-3" /> Import
            </button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { store.importJson(await f.text()); } e.target.value = ''; }} />
          </div>
        </div>
      )}
    </div>
  );
}
