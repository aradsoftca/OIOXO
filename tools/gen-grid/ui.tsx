'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';

const JUSTIFIES = ['start', 'end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly'] as const;
const ALIGNS = ['start', 'end', 'center', 'stretch'] as const;

type J = typeof JUSTIFIES[number];
type A = typeof ALIGNS[number];

interface Track { id: number; value: string; }
let _id = 1;
const newTrack = (v = '1fr'): Track => ({ id: _id++, value: v });

export default function Tool() {
  const [cols, setCols] = React.useState<Track[]>([newTrack(), newTrack(), newTrack()]);
  const [rows, setRows] = React.useState<Track[]>([newTrack('auto'), newTrack('auto')]);
  const [colGap, setColGap] = React.useState(12);
  const [rowGap, setRowGap] = React.useState(12);
  const [justify, setJustify] = React.useState<J>('stretch');
  const [align, setAlign] = React.useState<A>('stretch');
  const [copied, setCopied] = React.useState(false);

  const colsStr = cols.map((c) => c.value).join(' ');
  const rowsStr = rows.map((r) => r.value).join(' ');
  const totalCells = cols.length * rows.length;

  const css = `display: grid;
grid-template-columns: ${colsStr};
grid-template-rows: ${rowsStr};
column-gap: ${colGap}px;
row-gap: ${rowGap}px;
justify-items: ${justify};
align-items: ${align};`;

  const copy = async () => {
    await navigator.clipboard?.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const PRESETS: { label: string; cols: string[]; rows: string[] }[] = [
    { label: '3 cols',    cols: ['1fr', '1fr', '1fr'], rows: ['auto', 'auto'] },
    { label: 'Sidebar',   cols: ['240px', '1fr'],      rows: ['auto', '1fr', 'auto'] },
    { label: 'Holy grail', cols: ['200px', '1fr', '200px'], rows: ['auto', '1fr', 'auto'] },
    { label: 'Gallery',   cols: ['repeat(4, 1fr)'],    rows: ['auto'] },
  ];

  const applyPreset = (p: typeof PRESETS[number]) => {
    setCols(p.cols.map((v) => newTrack(v)));
    setRows(p.rows.map((v) => newTrack(v)));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 min-h-[320px]"
            style={{ display: 'grid', gridTemplateColumns: colsStr, gridTemplateRows: rowsStr, columnGap: colGap, rowGap, justifyItems: justify, alignItems: align }}>
            {Array.from({ length: totalCells }).map((_, i) => (
              <div key={i} className="bg-[var(--color-cat-gen)] text-white font-mono text-[12px] font-bold flex items-center justify-center min-h-[48px] min-w-[48px] p-2">
                {i + 1}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => applyPreset(p)}
                className="border border-black/[0.08] py-2 text-[11px] font-bold hover:border-[var(--color-cat-gen)]">
                {p.label}
              </button>
            ))}
          </div>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] whitespace-pre">{css}</div>
          <button type="button" onClick={copy}
            className="inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] text-[var(--color-bg)] py-2.5 text-[12px] font-bold uppercase tracking-wider">
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy CSS</>}
          </button>
        </div>

        <aside className="space-y-3">
          <TrackEditor label="Columns" tracks={cols} setTracks={setCols} />
          <TrackEditor label="Rows" tracks={rows} setTracks={setRows} />

          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">col-gap</span>
                  <span className="font-mono text-[11px] tabular-nums">{colGap}px</span>
                </div>
                <input type="range" min={0} max={64} value={colGap} onChange={(e) => setColGap(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-cat-gen)]" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">row-gap</span>
                  <span className="font-mono text-[11px] tabular-nums">{rowGap}px</span>
                </div>
                <input type="range" min={0} max={64} value={rowGap} onChange={(e) => setRowGap(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-cat-gen)]" />
              </div>
            </div>
            <Pill label="justify-items" value={justify} opts={JUSTIFIES} onChange={setJustify} />
            <Pill label="align-items" value={align} opts={ALIGNS} onChange={setAlign} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function TrackEditor({ label, tracks, setTracks }: { label: string; tracks: Track[]; setTracks: (t: Track[]) => void }) {
  return (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => setTracks(tracks.slice(0, -1))} disabled={tracks.length <= 1}
            className="border border-black/[0.08] px-2 py-1 text-[10px] font-bold disabled:opacity-30 hover:border-[var(--color-cat-gen)]">−</button>
          <button type="button" onClick={() => setTracks([...tracks, { id: Date.now(), value: '1fr' }])} disabled={tracks.length >= 8}
            className="border border-black/[0.08] px-2 py-1 text-[10px] font-bold disabled:opacity-30 hover:border-[var(--color-cat-gen)]">+</button>
        </div>
      </div>
      <div className="space-y-1.5">
        {tracks.map((t, i) => (
          <input key={t.id} type="text" value={t.value} onChange={(e) => setTracks(tracks.map((x) => x.id === t.id ? { ...x, value: e.target.value } : x))}
            placeholder={i.toString()}
            className="w-full bg-transparent border-b border-black/[0.1] py-0.5 font-mono text-[12px] outline-none focus:border-[var(--color-cat-gen)]" />
        ))}
      </div>
    </div>
  );
}

function Pill<T extends string>({ value, opts, onChange, label }: { value: T; opts: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`border px-2 py-1 text-[10px] font-bold transition ${value === o ? 'border-[var(--color-cat-gen)] bg-[var(--color-cat-gen)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
