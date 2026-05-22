'use client';
import * as React from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { parse, write, stripTags } from '@/engines/subtitle';
import { cn } from '@/lib/cn';

export default function Tool() {
  const [mode, setMode] = React.useState<'extract' | 'merge'>('extract');
  const [original, setOriginal] = React.useState('');
  const [translated, setTranslated] = React.useState('');
  const [format, setFormat] = React.useState<'srt' | 'vtt'>('srt');
  const [copied, setCopied] = React.useState(false);

  const cues = React.useMemo(() => {
    try { return parse(original); } catch { return []; }
  }, [original]);

  const extracted = React.useMemo(() => {
    return cues.map((c, i) => `${i + 1}. ${stripTags(c.text).replace(/\n/g, ' ')}`).join('\n');
  }, [cues]);

  const merged = React.useMemo(() => {
    if (!cues.length || !translated.trim()) return '';
    const lines = translated.split('\n').map((l) => l.replace(/^\d+\.\s*/, '').trim());
    if (lines.length !== cues.length) {
      return `Mismatch: original has ${cues.length} cues, translation has ${lines.length} lines.\nFix line count and retry.`;
    }
    const out = cues.map((c, i) => ({ ...c, text: lines[i] || c.text }));
    return write(out, { format, reindex: true });
  }, [cues, translated, format]);

  const copy = async (s: string) => {
    if (!s) return;
    await navigator.clipboard?.writeText(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(['extract', 'merge'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn(
            'border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition',
            mode === m
              ? 'border-[var(--color-cat-subtitle)] bg-[var(--color-cat-subtitle)] text-white'
              : 'border-black/[0.08] text-[var(--color-fg-muted)]',
          )}>
            {m === 'extract' ? '1. Extract' : '2. Merge back'}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Original subtitle</div>
          <textarea value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="Paste original SRT here…" spellCheck={false} className="h-72 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
        </div>

        {mode === 'extract' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Extracted lines ({cues.length})
              </div>
              <button type="button" onClick={() => copy(extracted)} disabled={!extracted} className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </button>
            </div>
            <textarea readOnly value={extracted} placeholder="Numbered lines will appear here — paste them into your translator." className="h-72 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Translated lines</div>
            <textarea value={translated} onChange={(e) => setTranslated(e.target.value)} placeholder="Paste the translated numbered lines here…" spellCheck={false} className="h-72 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
          </div>
        )}
      </div>

      {mode === 'merge' && (
        <>
          <div className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
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
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([merged], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `translated.${format}`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              disabled={!merged}
              className="flex items-center gap-2 bg-[var(--color-cat-subtitle)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
          <textarea readOnly value={merged} placeholder="Merged subtitle will appear here." className="h-56 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none" />
        </>
      )}
    </div>
  );
}
