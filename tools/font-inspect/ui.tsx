'use client';
import * as React from 'react';
import type { Font } from 'opentype.js';
import { FontDrop } from '@/components/tool/FontDrop';
import { getFontInfo, listGlyphs, type FontInfo, type GlyphSummary } from '@/engines/font';

function Row({ label, value }: { label: string; value: string | number }) {
  if (value === '' || value === null || value === undefined) return null;
  return (
    <div className="flex items-baseline justify-between border-b border-black/[0.06] py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-mono text-[12px] text-[var(--color-fg)] tabular-nums text-right max-w-[70%] truncate">{String(value)}</span>
    </div>
  );
}

export default function Tool() {
  const [font, setFont] = React.useState<Font | null>(null);
  const [info, setInfo] = React.useState<FontInfo | null>(null);
  const [glyphs, setGlyphs] = React.useState<GlyphSummary[]>([]);
  const [fileName, setFileName] = React.useState('');

  return (
    <div className="space-y-4">
      {!font && (
        <FontDrop
          loaded={false}
          onLoad={(f, file) => {
            setFont(f);
            setInfo(getFontInfo(f, file.size));
            setGlyphs(listGlyphs(f, 256));
            setFileName(file.name);
          }}
        />
      )}

      {info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">{fileName}</span>
            <button type="button"
              onClick={() => { setFont(null); setInfo(null); setGlyphs([]); setFileName(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >Change font</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Identity</div>
              <Row label="Family" value={info.family} />
              <Row label="Style" value={info.subfamily} />
              <Row label="Full Name" value={info.fullName} />
              <Row label="PostScript" value={info.postScriptName} />
              <Row label="Version" value={info.version} />
              <Row label="Format" value={info.format} />
              <Row label="File size" value={`${(info.fileSize / 1024).toFixed(1)} KB`} />
            </div>

            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Metrics & Author</div>
              <Row label="Glyphs" value={info.glyphCount} />
              <Row label="Units / em" value={info.unitsPerEm} />
              <Row label="Ascender" value={info.ascender} />
              <Row label="Descender" value={info.descender} />
              <Row label="Designer" value={info.designer} />
              <Row label="Manufacturer" value={info.manufacturer} />
              <Row label="License" value={info.license} />
              <Row label="Copyright" value={info.copyright} />
            </div>
          </div>

          {glyphs.length > 0 && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-3">
                First {glyphs.length} glyphs
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1">
                {glyphs.map((g) => (
                  <div key={g.index} className="border border-black/[0.06] p-1 text-center"
                    title={`${g.name} · U+${(g.unicode ?? 0).toString(16).toUpperCase().padStart(4, '0')}`}>
                    <div className="text-[20px] leading-none h-7 flex items-center justify-center">{g.char || '·'}</div>
                    <div className="font-mono text-[8px] text-[var(--color-fg-subtle)]">
                      {g.unicode !== null ? `U+${g.unicode.toString(16).toUpperCase().padStart(4, '0')}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
