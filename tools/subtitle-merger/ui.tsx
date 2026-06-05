'use client';
import * as React from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { parse, shift, write } from '@/engines/subtitle';
import { cn } from '@/lib/cn';
import { SubtitleTextarea } from '@/components/tool/SubtitleTextarea';
import { SubtitleCuePreview } from '@/components/tool/SubtitleCuePreview';

export default function Tool() {
  const [first, setFirst] = React.useState('');
  const [second, setSecond] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [format, setFormat] = React.useState<'srt' | 'vtt'>('srt');
  const [copied, setCopied] = React.useState(false);

  const output = React.useMemo(() => {
    if (!first.trim() && !second.trim()) return '';
    try {
      const a = parse(first);
      const b = shift(parse(second), offset);
      return write([...a, ...b], { format, reindex: true });
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [first, second, offset, format]);

  const isError = output.startsWith('Error:');
  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard?.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard denied */ }
  };
  const download = () => {
    if (!output || isError) return;
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged.${format}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Defer revoke — mobile Safari/Firefox can abort the download if the
    // blob URL is torn down before the stream starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SubtitleTextarea value={first} onChange={setFirst} placeholder="First subtitle file" label="First subtitle file" className="h-56 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
        <SubtitleTextarea value={second} onChange={setSecond} placeholder="Second subtitle file" label="Second subtitle file" className="h-56 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
      </div>
      <div className="flex flex-wrap items-end gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
          Offset second file
          <input type="number" value={offset} step="0.1" onChange={(e) => setOffset(Number(e.target.value) || 0)} className="ml-2 w-24 border border-black/[0.08] bg-transparent px-2 py-1 font-mono text-[13px] text-[var(--color-fg)] outline-none" />
          <span className="ml-1 text-[var(--color-fg-subtle)]">sec</span>
        </label>
        <div className="flex gap-1">
          {(['srt', 'vtt'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFormat(f)} className={cn(
              'border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition',
              format === f
                ? 'border-[var(--color-cat-subtitle)] bg-[var(--color-cat-subtitle)] text-white'
                : 'border-black/[0.08] text-[var(--color-fg-muted)]',
            )}>{f}</button>
          ))}
        </div>
        <button type="button" onClick={copy} disabled={!output} className="ml-auto flex items-center gap-2 border border-black/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:text-[var(--color-fg-subtle)]">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
        </button>
        <button type="button" onClick={download} disabled={!output || isError} className="flex items-center gap-2 bg-[var(--color-cat-subtitle)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>
      <textarea readOnly value={output} placeholder="Merged result will appear here." className="h-72 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
      {!isError && output && <SubtitleCuePreview text={output} />}
    </div>
  );
}
