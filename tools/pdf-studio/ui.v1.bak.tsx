'use client';

import * as React from 'react';
import {
  Loader2, Download, Plus, Trash2, RotateCw, Copy, ChevronLeft, ChevronRight,
  Type, SquareDashed, Image as ImageIcon, Hash, FileText, Highlighter, PenTool, Eraser, Minus, Circle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { downloadBlob } from '@/engines/ffmpeg';
import { rasterizePdf } from '@/engines/pdf/rasterize';
import { buildPdf, type PageRef, type Annotation } from '@/engines/pdf/studio';

type Tool = 'text' | 'rect' | 'highlight' | 'image' | 'draw' | 'line' | 'ellipse' | 'whiteout';
interface RasterPage { canvas: HTMLCanvasElement; w: number; h: number }
const ptsToStr = (pts: number[]) => { let s = ''; for (let k = 0; k < pts.length; k += 2) s += `${(pts[k] * 100).toFixed(2)},${(pts[k + 1] * 100).toFixed(2)} `; return s.trim(); };

let _sid = 0, _pid = 0;

/** Draws a source canvas into a sized display canvas (no toDataURL → no preview watermark). */
function CanvasView({ canvas, maxW, maxH, rotation = 0, className, onClick }: { canvas: HTMLCanvasElement; maxW: number; maxH: number; rotation?: number; className?: string; onClick?: () => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const dst = ref.current; if (!dst) return;
    const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
    dst.width = Math.round(canvas.width * scale); dst.height = Math.round(canvas.height * scale);
    const ctx = dst.getContext('2d')!; ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(canvas, 0, 0, dst.width, dst.height);
  }, [canvas, maxW, maxH]);
  return <canvas ref={ref} onClick={onClick} className={className} style={{ transform: `rotate(${rotation}deg)`, transition: 'transform .15s' }} />;
}

export default function PdfStudioTool() {
  const [sources, setSources] = React.useState<Record<string, ArrayBuffer>>({});
  const [raster, setRaster] = React.useState<Record<string, RasterPage[]>>({});
  const [pages, setPages] = React.useState<PageRef[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [annos, setAnnos] = React.useState<Record<string, Annotation[]>>({});
  const [tool, setTool] = React.useState<Tool>('text');
  const [pageNumbers, setPageNumbers] = React.useState(false);
  const [textColor, setTextColor] = React.useState('#000000');
  const [textSize, setTextSize] = React.useState(16);
  const [penWidth, setPenWidth] = React.useState(3);
  const [livePts, setLivePts] = React.useState<number[]>([]);
  const moving = React.useRef<{ pageId: string; idx: number; offX: number; offY: number } | null>(null);
  const drawing = React.useRef<number[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loadingMsg, setLoadingMsg] = React.useState('');
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const imgRef = React.useRef<HTMLInputElement | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const dragRect = React.useRef<{ nx: number; ny: number } | null>(null);
  const pendingImgPos = React.useRef<{ nx: number; ny: number } | null>(null);
  const { guard, gate } = useUsageGate('pdf');

  const selPage = pages.find((p) => p.id === sel) || null;
  const selRaster = selPage ? raster[selPage.srcId]?.[selPage.srcIndex] : null;

  const addPdf = async (file: File) => {
    if (!(await guard({ bytes: file.size }))) return;
    setBusy(true); setError(''); setLoadingMsg('Reading PDF…');
    try {
      const bytes = await file.arrayBuffer();
      const sid = `s${++_sid}`;
      const rp = await rasterizePdf(bytes.slice(0), { maxEdge: 1000, onProgress: (p) => setLoadingMsg(`Rendering page ${p.page}/${p.pageCount}…`) });
      const pagesR: RasterPage[] = rp.map((r) => ({ canvas: r.canvas, w: r.width, h: r.height }));
      setSources((s) => ({ ...s, [sid]: bytes }));
      setRaster((r) => ({ ...r, [sid]: pagesR }));
      setPages((ps) => {
        const added = pagesR.map((_, i) => ({ id: `p${++_pid}`, srcId: sid, srcIndex: i, rotation: 0 }));
        if (!ps.length && added.length) setSel(added[0].id);
        return [...ps, ...added];
      });
    } catch { setError('Could not open this PDF (it may be password-protected).'); }
    finally { setBusy(false); setLoadingMsg(''); }
  };

  // page ops
  const rotate = (id: string) => setPages((ps) => ps.map((p) => p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p));
  const del = (id: string) => { setPages((ps) => ps.filter((p) => p.id !== id)); setAnnos((a) => { const n = { ...a }; delete n[id]; return n; }); if (sel === id) setSel(null); };
  const dup = (id: string) => setPages((ps) => { const i = ps.findIndex((p) => p.id === id); if (i < 0) return ps; const copy = { ...ps[i], id: `p${++_pid}` }; const n = [...ps]; n.splice(i + 1, 0, copy); return n; });
  const move = (id: string, dir: -1 | 1) => setPages((ps) => { const i = ps.findIndex((p) => p.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= ps.length) return ps; const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  // annotation placement
  const norm = (e: React.PointerEvent) => { const r = editorRef.current!.getBoundingClientRect(); return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height }; };
  const addAnno = (pageId: string, a: Annotation) => setAnnos((m) => ({ ...m, [pageId]: [...(m[pageId] ?? []), a] }));
  const delAnno = (pageId: string, idx: number) => setAnnos((m) => ({ ...m, [pageId]: (m[pageId] ?? []).filter((_, i) => i !== idx) }));

  const onEditorDown = (e: React.PointerEvent) => {
    if (!selPage) return;
    const p = norm(e);
    if (tool === 'text') {
      const text = window.prompt('Text to add:'); if (!text) return;
      addAnno(selPage.id, { kind: 'text', nx: p.nx, ny: p.ny, text, size: textSize, color: textColor });
    } else if (tool === 'rect' || tool === 'highlight' || tool === 'line' || tool === 'ellipse' || tool === 'whiteout') {
      dragRect.current = p;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === 'draw') {
      drawing.current = [p.nx, p.ny]; setLivePts([p.nx, p.ny]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === 'image') {
      pendingImgPos.current = p; imgRef.current?.click();
    }
  };
  const startMove = (e: React.PointerEvent, idx: number, a: Annotation) => {
    if (!selPage || a.kind === 'draw') return; e.stopPropagation();
    const p = norm(e); moving.current = { pageId: selPage.id, idx, offX: p.nx - a.nx, offY: p.ny - a.ny };
  };
  const onEditorMove = (e: React.PointerEvent) => {
    if (drawing.current) { const p = norm(e); drawing.current.push(p.nx, p.ny); setLivePts(drawing.current.slice()); return; }
    if (!moving.current) return;
    const p = norm(e); const { pageId, idx, offX, offY } = moving.current;
    const cl = (v: number) => Math.max(0, Math.min(1, v));
    setAnnos((m) => ({ ...m, [pageId]: (m[pageId] ?? []).map((an, j) => j === idx ? { ...an, nx: cl(p.nx - offX), ny: cl(p.ny - offY) } : an) }));
  };
  const onEditorUp = (e: React.PointerEvent) => {
    if (drawing.current) { if (selPage && drawing.current.length >= 4) addAnno(selPage.id, { kind: 'draw', pts: drawing.current, color: textColor, width: penWidth }); drawing.current = null; setLivePts([]); return; }
    if (moving.current) { moving.current = null; return; }
    if (dragRect.current && selPage && (tool === 'rect' || tool === 'highlight' || tool === 'whiteout' || tool === 'line' || tool === 'ellipse')) {
      const s = dragRect.current; const en = norm(e);
      if (tool === 'line') {
        if (Math.abs(en.nx - s.nx) > 0.01 || Math.abs(en.ny - s.ny) > 0.01) addAnno(selPage.id, { kind: 'line', nx: s.nx, ny: s.ny, nx2: en.nx, ny2: en.ny, color: textColor, width: 2 });
      } else {
        const nx = Math.min(s.nx, en.nx), ny = Math.min(s.ny, en.ny);
        const nw = Math.abs(en.nx - s.nx), nh = Math.abs(en.ny - s.ny);
        if (nw > 0.01 && nh > 0.01) {
          if (tool === 'highlight') addAnno(selPage.id, { kind: 'rect', nx, ny, nw, nh, color: '#ffeb3b', opacity: 0.4 });
          else if (tool === 'whiteout') addAnno(selPage.id, { kind: 'rect', nx, ny, nw, nh, color: '#ffffff', opacity: 1 });
          else if (tool === 'ellipse') addAnno(selPage.id, { kind: 'ellipse', nx, ny, nw, nh, color: textColor, width: 2 });
          else addAnno(selPage.id, { kind: 'rect', nx, ny, nw, nh, color: textColor });
        }
      }
    }
    dragRect.current = null;
  };
  const onImage = async (file: File) => {
    if (!selPage || !pendingImgPos.current) return;
    const p = pendingImgPos.current; const png = /png$/i.test(file.type);
    addAnno(selPage.id, { kind: 'image', nx: p.nx, ny: p.ny, nw: 0.3, nh: 0.3, bytes: await file.arrayBuffer(), png });
  };

  const exportPdf = async () => {
    if (!pages.length) return;
    if (!(await guard())) return;
    setBusy(true); setError(''); setLoadingMsg('Building PDF…');
    try {
      const blob = await buildPdf({ sources, pages, annotations: annos, pageNumbers });
      downloadBlob(blob, 'pdf-studio.pdf');
    } catch (e) { setError((e as Error).message || 'Export failed.'); }
    finally { setBusy(false); setLoadingMsg(''); }
  };

  if (!pages.length) {
    return (
      <div className="space-y-4">
        {gate}
        <div onClick={() => fileRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void addPdf(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-16 text-center">
          <FileText className="h-8 w-8 text-[var(--color-cat-pdf)]" />
          <div className="text-[15px] font-semibold">{busy ? loadingMsg || 'Loading…' : 'Drop a PDF to start editing'}</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">Organize pages, merge files, add text/redaction/images — all on your device.</div>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPdf(f); e.target.value = ''; }} />
        {error && <div className="text-[12px] text-red-600">{error}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gate}
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        {/* pages panel */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            <span>Pages · {pages.length}</span>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-[var(--color-cat-pdf)]"><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-auto p-0.5">
            {pages.map((p, i) => {
              const rp = raster[p.srcId]?.[p.srcIndex];
              return (
                <div key={p.id} className={cn('group relative border bg-white', sel === p.id ? 'border-[var(--color-cat-pdf)] ring-2 ring-[var(--color-cat-pdf)]/30' : 'border-black/[0.1]')}>
                  <div className="grid aspect-[3/4] place-items-center overflow-hidden" onClick={() => setSel(p.id)}>
                    {rp ? <CanvasView canvas={rp.canvas} maxW={120} maxH={160} rotation={p.rotation} className="cursor-pointer" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  <div className="absolute left-1 top-1 bg-black/60 px-1.5 text-[10px] font-bold text-white">{i + 1}</div>
                  <div className="flex items-center justify-center gap-0.5 border-t border-black/[0.06] p-0.5 opacity-0 transition group-hover:opacity-100">
                    <IconBtn title="Move left" onClick={() => move(p.id, -1)}><ChevronLeft className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Rotate" onClick={() => rotate(p.id)}><RotateCw className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Duplicate" onClick={() => dup(p.id)}><Copy className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Delete" onClick={() => del(p.id)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Move right" onClick={() => move(p.id, 1)}><ChevronRight className="h-3.5 w-3.5" /></IconBtn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* editor */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
            {([['text', Type, 'Text'], ['draw', PenTool, 'Draw / Sign'], ['highlight', Highlighter, 'Highlight'], ['line', Minus, 'Line'], ['ellipse', Circle, 'Ellipse'], ['rect', SquareDashed, 'Redact / box'], ['whiteout', Eraser, 'Whiteout'], ['image', ImageIcon, 'Image']] as const).map(([t, Icon, label]) => (
              <button key={t} type="button" title={label} onClick={() => setTool(t)}
                className={cn('flex items-center gap-1.5 border px-2.5 py-1.5 text-[12px] font-semibold transition', tool === t ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)]/10' : 'border-transparent text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} title="Color" className="h-8 w-8" />
            {tool === 'text' && <label className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">Size<input type="range" min={8} max={48} value={textSize} onChange={(e) => setTextSize(+e.target.value)} className="w-20" /></label>}
            {tool === 'draw' && <label className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">Pen<input type="range" min={1} max={10} value={penWidth} onChange={(e) => setPenWidth(+e.target.value)} className="w-16" /></label>}
            {(tool === 'draw' || tool === 'line' || tool === 'ellipse') && (
              <button type="button" onClick={() => selPage && setAnnos((m) => ({ ...m, [selPage.id]: (m[selPage.id] ?? []).filter((a) => a.kind !== 'draw' && a.kind !== 'line' && a.kind !== 'ellipse') }))} className="flex items-center gap-1 border border-black/[0.12] px-2 py-1 text-[11px] hover:bg-[var(--color-surface-2)]"><Eraser className="h-3.5 w-3.5" /> Clear marks</button>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={pageNumbers} onChange={(e) => setPageNumbers(e.target.checked)} /> <Hash className="h-3.5 w-3.5" /> Page numbers</label>
          </div>

          <div className="grid place-items-center overflow-auto border border-black/[0.08] bg-[var(--color-surface-2)] p-3" style={{ minHeight: 320 }}>
            {selRaster ? (
              <div ref={editorRef} className="relative shadow-lg" style={{ touchAction: 'none', cursor: 'crosshair' }}
                onPointerDown={onEditorDown} onPointerMove={onEditorMove} onPointerUp={onEditorUp}>
                <CanvasView canvas={selRaster.canvas} maxW={620} maxH={520} />
                {(annos[selPage!.id] ?? []).map((a, i) => {
                  const common = 'absolute group/anno cursor-move';
                  if (a.kind === 'text') return <span key={i} onPointerDown={(e) => startMove(e, i, a)} onDoubleClick={() => delAnno(selPage!.id, i)} title="Drag to move · double-click to remove" className={`${common} whitespace-nowrap`} style={{ left: `${a.nx * 100}%`, top: `${a.ny * 100}%`, color: a.color, fontSize: a.size, fontWeight: 600, lineHeight: 1 }}>{a.text}</span>;
                  if (a.kind === 'rect') return <div key={i} onPointerDown={(e) => startMove(e, i, a)} onDoubleClick={() => delAnno(selPage!.id, i)} title="Drag to move · double-click to remove" className={common} style={{ left: `${a.nx * 100}%`, top: `${a.ny * 100}%`, width: `${a.nw * 100}%`, height: `${a.nh * 100}%`, background: a.color, opacity: a.opacity ?? 1 }} />;
                  if (a.kind === 'image') return <div key={i} onPointerDown={(e) => startMove(e, i, a)} onDoubleClick={() => delAnno(selPage!.id, i)} title="Drag to move · double-click to remove" className={`${common} border border-dashed border-white/60`} style={{ left: `${a.nx * 100}%`, top: `${a.ny * 100}%`, width: `${a.nw * 100}%`, height: `${a.nh * 100}%`, background: 'rgba(0,0,0,0.15)' }} />;
                  return null;
                })}
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {(annos[selPage!.id] ?? []).map((a, i) => {
                    if (a.kind === 'draw') return <polyline key={`d${i}`} points={ptsToStr(a.pts)} fill="none" stroke={a.color} strokeWidth={a.width} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />;
                    if (a.kind === 'line') return <line key={`l${i}`} x1={a.nx * 100} y1={a.ny * 100} x2={a.nx2 * 100} y2={a.ny2 * 100} stroke={a.color} strokeWidth={a.width} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
                    if (a.kind === 'ellipse') return <ellipse key={`e${i}`} cx={(a.nx + a.nw / 2) * 100} cy={(a.ny + a.nh / 2) * 100} rx={(a.nw / 2) * 100} ry={(a.nh / 2) * 100} fill="none" stroke={a.color} strokeWidth={a.width} vectorEffect="non-scaling-stroke" />;
                    return null;
                  })}
                  {livePts.length > 2 && <polyline points={ptsToStr(livePts)} fill="none" stroke={textColor} strokeWidth={penWidth} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
              </div>
            ) : <div className="text-[13px] text-[var(--color-fg-muted)]">Select a page to edit</div>}
          </div>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">Click to place text · drag for a box (use black to redact) · double-click an item to remove it.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-3">
        {loadingMsg && <span className="text-[12px] text-[var(--color-fg-muted)]"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> {loadingMsg}</span>}
        {error && <span className="text-[12px] text-red-600">{error}</span>}
        <button type="button" onClick={exportPdf} disabled={busy}
          className="ml-auto flex items-center gap-2 bg-[var(--color-cat-pdf)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export PDF
        </button>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPdf(f); e.target.value = ''; }} />
      <input ref={imgRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImage(f); e.target.value = ''; }} />
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className="grid h-6 w-6 place-items-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">{children}</button>;
}
