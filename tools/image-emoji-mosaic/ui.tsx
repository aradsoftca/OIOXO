'use client';

import * as React from 'react';
import { Upload, Download, Copy, Check } from 'lucide-react';

// Curated emoji palette with approximate average RGB. Picked to span the color
// space (reds, oranges, yellows, greens, blues, purples, browns, greys, b/w).
const EMOJI: { e: string; rgb: [number, number, number] }[] = [
  { e: '⬛', rgb: [0, 0, 0] },
  { e: '🖤', rgb: [20, 20, 20] },
  { e: '🐈‍⬛', rgb: [40, 40, 40] },
  { e: '🌑', rgb: [60, 58, 64] },
  { e: '🪨', rgb: [110, 110, 110] },
  { e: '🐘', rgb: [140, 140, 145] },
  { e: '☁️', rgb: [200, 205, 210] },
  { e: '⬜', rgb: [245, 245, 245] },
  { e: '🤍', rgb: [255, 255, 255] },
  { e: '🥚', rgb: [240, 230, 210] },
  { e: '❤️', rgb: [220, 30, 35] },
  { e: '🍎', rgb: [200, 40, 40] },
  { e: '🌹', rgb: [190, 30, 50] },
  { e: '🍓', rgb: [220, 50, 70] },
  { e: '🧧', rgb: [200, 25, 30] },
  { e: '🟥', rgb: [225, 50, 45] },
  { e: '🦊', rgb: [225, 120, 50] },
  { e: '🍊', rgb: [240, 140, 30] },
  { e: '🟧', rgb: [240, 150, 40] },
  { e: '🏀', rgb: [220, 110, 50] },
  { e: '🦁', rgb: [220, 170, 90] },
  { e: '🌝', rgb: [245, 215, 90] },
  { e: '🟨', rgb: [245, 210, 60] },
  { e: '🍋', rgb: [235, 220, 70] },
  { e: '⭐', rgb: [245, 200, 50] },
  { e: '🌻', rgb: [235, 195, 60] },
  { e: '🧀', rgb: [240, 200, 90] },
  { e: '🟩', rgb: [90, 190, 90] },
  { e: '🍏', rgb: [150, 200, 80] },
  { e: '🐸', rgb: [120, 190, 90] },
  { e: '🌿', rgb: [90, 160, 80] },
  { e: '🥬', rgb: [110, 175, 80] },
  { e: '🌲', rgb: [50, 110, 70] },
  { e: '🟦', rgb: [60, 110, 220] },
  { e: '💙', rgb: [50, 120, 230] },
  { e: '🌊', rgb: [60, 140, 200] },
  { e: '🫐', rgb: [70, 90, 170] },
  { e: '🐳', rgb: [90, 150, 210] },
  { e: '🟪', rgb: [150, 90, 200] },
  { e: '💜', rgb: [150, 90, 210] },
  { e: '🍇', rgb: [120, 70, 160] },
  { e: '🔮', rgb: [140, 100, 200] },
  { e: '🌸', rgb: [240, 170, 200] },
  { e: '🐷', rgb: [240, 170, 185] },
  { e: '🌺', rgb: [225, 90, 130] },
  { e: '🟫', rgb: [150, 100, 60] },
  { e: '🐻', rgb: [140, 95, 60] },
  { e: '🍫', rgb: [110, 70, 45] },
  { e: '🪵', rgb: [150, 110, 70] },
  { e: '🦫', rgb: [120, 90, 65] },
  { e: '🏜️', rgb: [205, 175, 120] },
  { e: '🌰', rgb: [130, 90, 55] },
];

type Density = number;

function nearestEmoji(r: number, g: number, b: number): string {
  let best = EMOJI[0].e;
  let bestD = Infinity;
  for (const item of EMOJI) {
    const dr = r - item.rgb[0], dg = g - item.rgb[1], db = b - item.rgb[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) { bestD = d; best = item.e; }
  }
  return best;
}

export default function ImageEmojiMosaicTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null);
  const [columns, setColumns] = React.useState<Density>(48);
  const [grid, setGrid] = React.useState<string[][]>([]);
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

  const generate = React.useCallback(() => {
    if (!bitmap) return;
    const aspect = bitmap.height / bitmap.width;
    const rows = Math.max(1, Math.round(columns * aspect));
    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, columns, rows);
    const data = ctx.getImageData(0, 0, columns, rows).data;
    const out: string[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: string[] = [];
      for (let x = 0; x < columns; x++) {
        const i = (y * columns + x) * 4;
        row.push(nearestEmoji(data[i], data[i + 1], data[i + 2]));
      }
      out.push(row);
    }
    setGrid(out);
  }, [bitmap, columns]);

  React.useEffect(() => { generate(); }, [generate]);

  const text = React.useMemo(() => grid.map((r) => r.join('')).join('\n'), [grid]);

  const copy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadPng = () => {
    if (!grid.length || !file) return;
    const cell = 24;
    const canvas = document.createElement('canvas');
    canvas.width = grid[0].length * cell;
    canvas.height = grid.length * cell;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${cell - 2}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        ctx.fillText(grid[y][x], x * cell + cell / 2, y * cell + cell / 2);
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = file.name.replace(/\.[^.]+$/, '') + '-emoji.png';
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
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
          >
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
              <Upload className="h-5 w-5" />
              Drop an image to rebuild it from emoji
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
          </div>
        ) : (
          <div className="overflow-auto border border-black/[0.08] bg-white p-2">
            <pre className="leading-[1]" style={{ fontSize: '11px', whiteSpace: 'pre', fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>{text}</pre>
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
            <button type="button" onClick={downloadPng}
              className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <Download className="h-3 w-3" /> .png
            </button>
          </div>
        )}

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Density</span>
            <span className="font-mono text-[12px] tabular-nums">{columns} wide</span>
          </div>
          <input type="range" min={16} max={96} step={2} value={columns}
            onChange={(e) => setColumns(parseInt(e.target.value, 10))}
            className="mt-2 w-full" />
          <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            More columns means finer detail but more emoji. Copy works best in chat apps; PNG keeps the look anywhere.
          </div>
        </div>
      </aside>
    </div>
  );
}
