'use client';
import * as React from 'react';
import { Download } from 'lucide-react';
import type { Font } from 'opentype.js';
import { FontDrop } from '@/components/tool/FontDrop';
import { getFontInfo, type FontInfo } from '@/engines/font';

export default function Tool() {
  const [font, setFont] = React.useState<Font | null>(null);
  const [info, setInfo] = React.useState<FontInfo | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [outputName, setOutputName] = React.useState('');

  const handleDownload = () => {
    if (!font) return;
    const buf = font.toArrayBuffer();
    const blob = new Blob([buf], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (outputName || 'font') + '.ttf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // 60s defer — immediate revoke can abort the download on mobile Safari/
    // Firefox when the download dialog opens after the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-4">
      {!font && (
        <FontDrop
          loaded={false}
          onLoad={(f, file) => {
            setFont(f);
            setInfo(getFontInfo(f, file.size));
            setFileName(file.name);
            setOutputName(file.name.replace(/\.[^.]+$/, ''));
          }}
        />
      )}

      {info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">{fileName}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{info.format}</span>
            <button type="button"
              onClick={() => { setFont(null); setInfo(null); setFileName(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >Change font</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Source</div>
              <div className="text-[16px] font-bold text-[var(--color-fg)]">{info.family || '(unnamed)'}</div>
              <div className="text-[12px] text-[var(--color-fg-muted)]">{info.subfamily} · {info.format} · {info.glyphCount} glyphs</div>

              <div className="my-6 flex items-center gap-2 text-[var(--color-fg-muted)]">
                <div className="h-px flex-1 bg-black/[0.08]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Output</span>
                <div className="h-px flex-1 bg-black/[0.08]" />
              </div>

              <div className="text-[16px] font-bold text-[var(--color-fg)]">{outputName || 'font'}.ttf</div>
              <div className="text-[12px] text-[var(--color-fg-muted)]">TrueType · same metrics · same {info.glyphCount} glyphs</div>
            </div>

            <aside className="space-y-3">
              <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output filename</div>
                <input
                  value={outputName} onChange={(e) => setOutputName(e.target.value)}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-font)]"
                />
              </label>

              <button type="button" onClick={handleDownload}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-font)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
                <Download className="h-3.5 w-3.5" /> Download TTF
              </button>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
