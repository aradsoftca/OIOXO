'use client';
import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import type { Font } from 'opentype.js';
import { FontDrop } from '@/components/tool/FontDrop';
import { renderToSvg } from '@/engines/font';

const SAMPLES = [
  { label: 'Pangram', text: 'The quick brown fox jumps over the lazy dog' },
  { label: 'Numerals', text: '0123456789 ←→ +-×÷=' },
  { label: 'Alphabet', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz' },
  { label: 'Headline', text: 'Type that ships.' },
  { label: 'Punctuation', text: '. , ; : ! ? ‘’ “” — – -' },
];

export default function Tool() {
  const [font, setFont] = React.useState<Font | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [size, setSize] = React.useState(72);
  const [text, setText] = React.useState(SAMPLES[0].text);
  const [color, setColor] = React.useState('#0f172a');
  const [bg, setBg] = React.useState('#f5f5f0');

  const lines = text.split('\n');
  const svgs = font ? lines.map((line) => renderToSvg(font, line || ' ', size, color)) : [];

  return (
    <div className="space-y-4">
      {!font && (
        <FontDrop
          loaded={!!font}
          fileName={fileName}
          onLoad={(f, file) => { setFont(f); setFileName(file.name); }}
        />
      )}

      {font && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">{fileName}</span>
            <button
              type="button"
              onClick={() => { setFont(null); setFileName(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >Change font</button>
          </div>

          <div
            className="border border-black/[0.08] p-8 overflow-x-auto"
            style={{ background: bg }}
          >
            {svgs.map((svg, i) => (
              <div key={i} dangerouslySetInnerHTML={{ __html: svg }} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Size</span>
                  <span className="font-mono text-[12px] tabular-nums">{size}px</span>
                </div>
                <Slider.Root value={[size]} min={12} max={240} step={1}
                  onValueChange={([v]) => setSize(v)}
                  className="relative mt-1 flex h-5 w-full touch-none items-center">
                  <Slider.Track className="relative h-1.5 grow bg-black/[0.08]"><Slider.Range className="absolute h-full bg-[var(--color-cat-font)]" /></Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-font)]" />
                </Slider.Root>
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer border border-black/[0.08]" />
                <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Text</span>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="ml-3 h-9 w-9 cursor-pointer border border-black/[0.08]" />
                <span className="text-[10px] font-mono text-[var(--color-fg-muted)]">Background</span>
              </div>
            </div>

            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Sample text</div>
              <textarea
                value={text} onChange={(e) => setText(e.target.value)} rows={3}
                className="w-full resize-none bg-transparent border-b border-black/[0.1] py-1 text-[13px] outline-none focus:border-[var(--color-cat-font)]"
              />
              <div className="flex flex-wrap gap-1.5">
                {SAMPLES.map((s) => (
                  <button key={s.label} type="button" onClick={() => setText(s.text)}
                    className="border border-black/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:border-[var(--color-cat-font)] hover:text-[var(--color-cat-font)]">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
