'use client';
import * as React from 'react';
import { Download } from 'lucide-react';
import type { Font } from 'opentype.js';
import { FontDrop } from '@/components/tool/FontDrop';
import { getFontInfo, subsetFont, type FontInfo } from '@/engines/font';

const PRESETS = [
  { label: 'A–Z, a–z, 0–9', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' },
  { label: 'Latin Basic', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?\'"-—–()[]{}@#$%&*+=/<>' },
  { label: 'Digits + punctuation', text: '0123456789 .,;:!?\'"-—–()' },
  { label: 'Numbers only', text: '0123456789' },
  { label: 'Uppercase only', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
];

export default function Tool() {
  const [font, setFont] = React.useState<Font | null>(null);
  const [info, setInfo] = React.useState<FontInfo | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [chars, setChars] = React.useState(PRESETS[0].text);
  const [outSize, setOutSize] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!font) { setOutSize(null); return; }
    try {
      const buf = subsetFont(font, chars);
      setOutSize(buf.byteLength);
    } catch {
      setOutSize(null);
    }
  }, [font, chars]);

  const handleDownload = () => {
    if (!font) return;
    const buf = subsetFont(font, chars);
    const blob = new Blob([buf], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (fileName.replace(/\.[^.]+$/, '') || 'font') + '-subset.ttf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const uniqueChars = new Set(chars).size;
  const savings = info && outSize !== null
    ? Math.max(0, Math.round((1 - outSize / info.fileSize) * 100))
    : null;

  return (
    <div className="space-y-4">
      {!font && (
        <FontDrop
          loaded={false}
          onLoad={(f, file) => {
            setFont(f);
            setInfo(getFontInfo(f, file.size));
            setFileName(file.name);
          }}
        />
      )}

      {info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">{fileName}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{info.glyphCount} glyphs · {(info.fileSize / 1024).toFixed(1)} KB</span>
            <button type="button"
              onClick={() => { setFont(null); setInfo(null); setFileName(''); setOutSize(null); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >Change font</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Keep these characters</div>
                <textarea
                  value={chars} onChange={(e) => setChars(e.target.value)} rows={6}
                  className="w-full resize-y bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-font)]"
                />
                <div className="mt-2 text-[10px] text-[var(--color-fg-muted)]">
                  {uniqueChars} unique character{uniqueChars === 1 ? '' : 's'}
                </div>
              </div>

              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Presets</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => setChars(p.text)}
                      className="border border-black/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:border-[var(--color-cat-font)] hover:text-[var(--color-cat-font)]">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</div>
                <div className="flex items-baseline justify-between py-1">
                  <span className="text-[11px] text-[var(--color-fg-muted)]">Original</span>
                  <span className="font-mono text-[12px] tabular-nums">{(info.fileSize / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex items-baseline justify-between py-1 border-t border-black/[0.06]">
                  <span className="text-[11px] text-[var(--color-fg-muted)]">Subset</span>
                  <span className="font-mono text-[12px] tabular-nums">
                    {outSize !== null ? `${(outSize / 1024).toFixed(1)} KB` : '—'}
                  </span>
                </div>
                {savings !== null && (
                  <div className="flex items-baseline justify-between py-2 border-t border-black/[0.06]">
                    <span className="text-[11px] font-bold text-[var(--color-fg)]">Savings</span>
                    <span className="font-mono text-[16px] font-bold tabular-nums text-[var(--color-cat-font)]">{savings}%</span>
                  </div>
                )}
              </div>

              <button type="button" onClick={handleDownload} disabled={outSize === null}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-font)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                <Download className="h-3.5 w-3.5" /> Download subset TTF
              </button>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
