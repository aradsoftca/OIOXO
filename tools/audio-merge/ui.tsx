'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AudioDrop, type AudioFileItem } from '@/components/tool/AudioDrop';
import { downloadBlob } from '@/engines/audio';
import { mergeAudio, type AudioProgress } from '@/lib/compute/audioMerge';

type Format = 'wav' | 'mp3';

export default function Tool() {
  const [items, setItems] = React.useState<AudioFileItem[]>([]);
  const [format, setFormat] = React.useState<Format>('wav');
  const [name, setName] = React.useState('merged');
  const [busy, setBusy] = React.useState(false);
  const [prog, setProg] = React.useState<AudioProgress | null>(null);
  const [error, setError] = React.useState('');

  const run = async () => {
    if (items.length < 2) { setError('Add at least 2 files.'); return; }
    setBusy(true); setError(''); setProg({ phase: 'Merging', ratio: 0.05 });
    try {
      // Heavy work runs in a Web Worker — the page stays responsive.
      const blob = await mergeAudio(items.map((it) => it.buffer), format, 192, setProg);
      downloadBlob(blob, `${name || 'merged'}.${format}`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); setProg(null); }
  };

  const totalDur = items.reduce((s, it) => s + it.info.duration, 0);

  return (
    <div className="space-y-4">
      <AudioDrop multiple items={items} onItemsChange={setItems} />

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
            <div className="mt-1 text-[16px] font-bold">{name || 'merged'}.{format}</div>
            <div className="text-[12px] text-[var(--color-fg-muted)]">
              {items.length} files → 1 track · {totalDur.toFixed(1)}s total
            </div>
          </div>
          <aside className="space-y-3">
            <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Filename</div>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-audio)]" />
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {(['wav', 'mp3'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${format === f ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </label>
            <button type="button" onClick={run} disabled={busy || items.length < 2}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-audio)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy ? `${prog?.phase ?? 'Working'}… ${Math.round((prog?.ratio ?? 0) * 100)}%` : 'Merge & Download'}
            </button>
            {busy && (
              <div className="h-1 w-full overflow-hidden bg-black/[0.08]">
                <div className="h-full bg-[var(--color-cat-audio)] transition-[width] duration-200" style={{ width: `${Math.round((prog?.ratio ?? 0) * 100)}%` }} />
              </div>
            )}
            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
