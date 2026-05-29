'use client';
import { stampPdfFooter } from '@/engines/pdf';

import * as React from 'react';
import { Upload, Download, Loader2, Pen, Type, Trash2, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { rasterizePdf, type RasterizedPage } from '@/engines/pdf/rasterize';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'pdf-sign';

type Mode = 'draw' | 'type';

export default function SignPdfTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [buffer, setBuffer] = React.useState<ArrayBuffer | null>(null);
  const [pages, setPages] = React.useState<RasterizedPage[]>([]);
  const [pageIdx, setPageIdx] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [sigUrl, setSigUrl] = React.useState('');         // transparent PNG data URL
  const [mode, setMode] = React.useState<Mode>('draw');
  const [typed, setTyped] = React.useState('');
  const [placed, setPlaced] = React.useState(false);
  // signature box position + size as fractions of the page
  const [box, setBox] = React.useState({ fx: 0.1, fy: 0.8, fw: 0.3 });
  const [sigAspect, setSigAspect] = React.useState(0.35); // h/w

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const padRef = React.useRef<HTMLCanvasElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const drawing = React.useRef(false);
  const draggingSig = React.useRef(false);

  const page = pages[pageIdx];

  const loadFile = React.useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'input-size', value: file.size },
    ]);
    if (!ok) return;
    setBusy(true); setPages([]); setPlaced(false);
    try {
      const buf = await file.arrayBuffer();
      setBuffer(buf);
      const rendered = await rasterizePdf(buf.slice(0), { maxEdge: 1400 });
      setPages(rendered);
      setPageIdx(0);
    } catch (e) { console.error('pdf load failed', e); }
    finally { setBusy(false); }
  }, [isPro, policyGate]);

  // ---- signature pad (draw) ----
  const padPos = (e: React.PointerEvent) => {
    const c = padRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const padDown = (e: React.PointerEvent) => {
    drawing.current = true; const ctx = padRef.current!.getContext('2d')!;
    const p = padPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const padMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = padRef.current!.getContext('2d')!;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#0a1633';
    const p = padPos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const padUp = () => { drawing.current = false; };
  const clearPad = () => { const c = padRef.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); };

  const commitDraw = () => {
    const c = padRef.current; if (!c) return;
    // trim to non-transparent bounds for a tight signature
    const trimmed = trimCanvas(c);
    if (!trimmed) return;
    setSigAspect(trimmed.height / trimmed.width);
    setSigUrl(trimmed.toDataURL('image/png'));
    setPlaced(true);
  };

  const commitType = () => {
    if (!typed.trim()) return;
    const c = document.createElement('canvas');
    const fontPx = 120; c.width = Math.max(200, typed.length * fontPx * 0.62); c.height = fontPx * 1.6;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0a1633';
    ctx.font = `italic 600 ${fontPx}px "Segoe Script", "Brush Script MT", cursive`;
    ctx.textBaseline = 'middle';
    ctx.fillText(typed, 10, c.height / 2);
    const trimmed = trimCanvas(c) ?? c;
    setSigAspect(trimmed.height / trimmed.width);
    setSigUrl(trimmed.toDataURL('image/png'));
    setPlaced(true);
  };

  // ---- drag signature on page ----
  const onSigDown = (e: React.PointerEvent) => { draggingSig.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onSigMove = (e: React.PointerEvent) => {
    if (!draggingSig.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    setBox((b) => ({
      ...b,
      fx: Math.max(0, Math.min(1 - b.fw, (e.clientX - r.left) / r.width - b.fw / 2)),
      fy: Math.max(0, Math.min(1 - b.fw * sigAspect * (r.width / r.height), (e.clientY - r.top) / r.height - (b.fw * sigAspect) / 2)),
    }));
  };
  const onSigUp = () => { draggingSig.current = false; };

  const apply = async () => {
    if (!buffer || !sigUrl) return;
    setBusy(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(buffer.slice(0));
      const pngBytes = await (await fetch(sigUrl)).arrayBuffer();
      const png = await doc.embedPng(pngBytes);
      const pdfPages = doc.getPages();
      const target = pdfPages[pageIdx];
      const { width: pw, height: ph } = target.getSize();
      const w = box.fw * pw;
      const h = w * sigAspect;
      const x = box.fx * pw;
      const yTop = box.fy * ph;
      target.drawImage(png, { x, y: ph - yTop - h, width: w, height: h });
      await stampPdfFooter(doc); const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = 'signed.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) { console.error('sign failed', e); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {policyGate.element}
      <div className="space-y-3">
        {!buffer ? (
          <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }} onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[3/4] max-h-[70vh] items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">Drop a PDF to sign</div>
                <div className="mt-1 text-[13px] text-white/55">Stays on your device — never uploaded</div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
            </button>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
          </div>
        ) : (
          <>
            {pages.length > 1 && (
              <div className="flex items-center justify-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
                <button type="button" onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0} className="border border-black/[0.08] p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                Page {pageIdx + 1} / {pages.length}
                <button type="button" onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))} disabled={pageIdx === pages.length - 1} className="border border-black/[0.08] p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
            <div ref={stageRef} className="relative mx-auto border border-black/[0.08] bg-white" style={{ maxWidth: 'min(100%, 640px)' }}
              onPointerMove={onSigMove} onPointerUp={onSigUp}>
              {page && <img src={page.canvas.toDataURL('image/jpeg', 0.85)} alt={`page ${pageIdx + 1}`} className="block w-full select-none" draggable={false} />}
              {placed && sigUrl && (
                <img src={sigUrl} alt="signature" onPointerDown={onSigDown}
                  className="absolute cursor-move touch-none select-none"
                  style={{ left: `${box.fx * 100}%`, top: `${box.fy * 100}%`, width: `${box.fw * 100}%` }} draggable={false} />
              )}
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
            </div>
            {placed && <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">Drag the signature to position it. Adjust size on the right, then download.</p>}
          </>
        )}
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {(['draw', 'type'] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={cn('flex items-center justify-center gap-1.5 border py-2 text-[12px] font-bold uppercase tracking-wider transition',
                  mode === m ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]')}>
                {m === 'draw' ? <Pen className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}{m}
              </button>
            ))}
          </div>

          {mode === 'draw' ? (
            <>
              <canvas ref={padRef} width={600} height={220}
                onPointerDown={padDown} onPointerMove={padMove} onPointerUp={padUp}
                className="w-full touch-none border border-dashed border-black/20 bg-white"
                style={{ aspectRatio: '600/220' }} />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={clearPad} className="flex flex-1 items-center justify-center gap-1.5 border border-black/[0.08] py-2 text-[12px] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
                <button type="button" onClick={commitDraw} className="flex-1 bg-[var(--color-cat-pdf)] py-2 text-[12px] font-bold uppercase tracking-wider text-white hover:brightness-110">Use signature</button>
              </div>
            </>
          ) : (
            <>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your name"
                className="w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[16px] text-[var(--color-fg)] focus:border-[var(--color-cat-pdf)] focus:outline-none"
                style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive' }} />
              <button type="button" onClick={commitType} className="mt-2 w-full bg-[var(--color-cat-pdf)] py-2 text-[12px] font-bold uppercase tracking-wider text-white hover:brightness-110">Use signature</button>
            </>
          )}
        </div>

        {placed && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-baseline justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Signature size</label>
              <span className="font-mono text-[13px] text-[var(--color-fg)]">{Math.round(box.fw * 100)}%</span>
            </div>
            <input type="range" min={8} max={60} value={Math.round(box.fw * 100)} onChange={(e) => setBox((b) => ({ ...b, fw: Number(e.target.value) / 100 }))} className="mt-2 w-full accent-[var(--color-cat-pdf)]" />
          </div>
        )}

        <button type="button" onClick={apply} disabled={!buffer || !placed || busy}
          className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
            buffer && placed && !busy ? 'bg-[var(--color-cat-pdf)] text-white shadow-lg hover:brightness-110' : 'bg-black/[0.06] text-[var(--color-fg-subtle)]')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download signed PDF
        </button>

        {buffer && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <FileText className="h-4 w-4" /> Replace PDF
          </button>
        )}
      </aside>
    </div>
  );
}

/** Crop a canvas to its non-transparent bounding box; returns a new canvas or null if empty. */
function trimCanvas(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = src.getContext('2d')!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        found = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return null;
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(src, minX, minY, w, h, 0, 0, w, h);
  return out;
}
