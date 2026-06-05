'use client';

import * as React from 'react';
import { Upload, Copy, Download, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useImageDrop } from '@/lib/compute/useImageDrop';

type Charset = 'detailed' | 'standard' | 'blocks' | 'minimal';

const CHARSETS: Record<Charset, string> = {
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  standard: '@%#*+=-:. ',
  blocks: '█▓▒░ ',
  minimal: '#. ',
};

export default function ImageAsciiArtTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [charset, setCharset] = React.useState<Charset>('standard');
  const [columns, setColumns] = React.useState(100);
  const [invert, setInvert] = React.useState(false);
  const [colored, setColored] = React.useState(false);
  const [ascii, setAscii] = React.useState('');
  const [colorRows, setColorRows] = React.useState<string[][]>([]);
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { bitmap?.close(); }, [bitmap]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    bitmap?.close();
    const bm = await createImageBitmap(next);
    setBitmap(bm);
    setFile(next);
  };

  const clear = React.useCallback(() => {
    setBitmap((b) => { b?.close(); return null; });
    setFile(null);
    setAscii('');
    setColorRows([]);
  }, []);

  // Clipboard paste (screenshot → ASCII), drag-anywhere hover state, Esc to clear.
  // Paste is ignored while typing so it never steals paste into the output box.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
  });

  const generate = React.useCallback(() => {
    if (!bitmap) return;
    const chars = CHARSETS[charset];
    const aspect = bitmap.height / bitmap.width;
    // Characters are ~2x taller than wide, so compress rows.
    const rows = Math.max(1, Math.round(columns * aspect * 0.5));
    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, columns, rows);
    const data = ctx.getImageData(0, 0, columns, rows).data;

    const lines: string[] = [];
    const colorGrid: string[][] = [];
    for (let y = 0; y < rows; y++) {
      let line = '';
      const colorRow: string[] = [];
      for (let x = 0; x < columns; x++) {
        const i = (y * columns + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (invert) lum = 1 - lum;
        const idx = Math.min(chars.length - 1, Math.floor(lum * (chars.length - 1)));
        line += chars[idx];
        if (colored) colorRow.push(`rgb(${r},${g},${b})`);
      }
      lines.push(line);
      if (colored) colorGrid.push(colorRow);
    }
    setAscii(lines.join('\n'));
    setColorRows(colored ? colorGrid : []);
  }, [bitmap, charset, columns, invert, colored]);

  React.useEffect(() => { generate(); }, [generate]);

  const copy = async () => {
    if (!ascii) return;
    try {
      await navigator.clipboard.writeText(ascii);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* iframe / permission denied — text still selectable on screen */ }
  };

  const downloadTxt = () => {
    if (!ascii || !file) return;
    const blob = new Blob([ascii], { type: 'text/plain' });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = file.name.replace(/\.[^.]+$/, '') + '-ascii.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const downloadPng = () => {
    if (!ascii || !file) return;
    const lines = ascii.split('\n');
    const cw = 7, ch = 12;
    const canvas = document.createElement('canvas');
    canvas.width = (lines[0]?.length ?? 1) * cw;
    canvas.height = lines.length * ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${ch}px "Courier New", monospace`;
    ctx.textBaseline = 'top';
    for (let y = 0; y < lines.length; y++) {
      if (colored && colorRows[y]) {
        for (let x = 0; x < lines[y].length; x++) {
          ctx.fillStyle = colorRows[y][x] ?? '#e5e5e5';
          ctx.fillText(lines[y][x], x * cw, y * ch);
        }
      } else {
        ctx.fillStyle = '#e5e5e5';
        ctx.fillText(lines[y], 0, y * ch);
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = file.name.replace(/\.[^.]+$/, '') + '-ascii.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, 'image/png');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        {!file ? (
          <div
            {...dropZone}
            className={cn(
              'flex aspect-[5/2] items-center justify-center border border-dashed bg-[var(--color-surface-1)] transition-colors',
              dragging ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/[0.06]' : 'border-black/[0.18]',
            )}
          >
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" />
              {dragging ? 'Drop to turn into ASCII art' : 'Drop, paste or click to turn into ASCII art'}
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
          </div>
        ) : (
          <div className="overflow-auto border border-black/[0.08] bg-[#0a0a0a] p-2">
            <pre
              className="font-mono leading-[1] text-[#e5e5e5]"
              style={{ fontSize: '6px', whiteSpace: 'pre' }}
            >{ascii}</pre>
          </div>
        )}
      </div>

      <aside className="space-y-3">
        {file && (
          <div className="flex flex-wrap items-center gap-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <button type="button" onClick={copy}
              className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={downloadTxt}
              className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <Download className="h-3 w-3" /> .txt
            </button>
            <button type="button" onClick={downloadPng}
              className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <Download className="h-3 w-3" /> .png
            </button>
          </div>
        )}

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Character set</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(['detailed', 'standard', 'blocks', 'minimal'] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCharset(c)}
                  className={`border py-2 text-[10px] font-bold uppercase tracking-wider transition ${charset === c ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Width</span>
              <span className="font-mono text-[12px] tabular-nums">{columns} chars</span>
            </div>
            <input type="range" min={40} max={240} step={4} value={columns}
              onChange={(e) => setColumns(parseInt(e.target.value, 10))}
              className="mt-2 w-full" />
          </div>
          <label className="flex items-center justify-between text-[11px] text-[var(--color-fg)]">
            <span className="font-medium">Invert (light background)</span>
            <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="h-4 w-4" />
          </label>
          <label className="flex items-center justify-between text-[11px] text-[var(--color-fg)]">
            <span className="font-medium">Color (PNG only)</span>
            <input type="checkbox" checked={colored} onChange={(e) => setColored(e.target.checked)} className="h-4 w-4" />
          </label>
        </div>
      </aside>
    </div>
  );
}
