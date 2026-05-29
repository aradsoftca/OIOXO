'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react';
import { Upload, Download, Loader2, ScanLine, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { loadOpenCv } from '@/engines/opencv';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'image-doc-scan';

type Pt = { x: number; y: number }; // fractions of the source image (0..1)
type Mode = 'color' | 'gray' | 'bw';

const DEFAULT_CORNERS: Pt[] = [
  { x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 },
];

export default function DocScanTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = React.useState<Pt[]>(DEFAULT_CORNERS);
  const [mode, setMode] = React.useState<Mode>('bw');
  const [busy, setBusy] = React.useState(false);
  const [resultUrl, setResultUrl] = React.useState('');
  const [drag, setDrag] = React.useState(-1);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const resultCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const load = React.useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    setBusy(true); setResultUrl('');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    await new Promise((res) => { image.onload = res; image.onerror = res; });
    setImg(image);
    setCorners(DEFAULT_CORNERS);
    // Best-effort auto edge detection.
    try {
      const cv = await loadOpenCv();
      const detected = detectCorners(cv, image);
      if (detected) setCorners(detected);
    } catch { /* manual corners */ }
    setBusy(false);
  }, [isPro, policyGate]);

  const onMove = (e: React.PointerEvent) => {
    if (drag < 0 || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    setCorners((c) => c.map((p, i) => (i === drag ? { x, y } : p)));
  };

  const scan = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const cv = await loadOpenCv();
      const canvas = warpAndEnhance(cv, img, corners, mode);
      resultCanvasRef.current = canvas;
      canvas.toBlob((blob) => {
        if (!blob) return;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(blob));
        void makeThumb(blob).then((t) => t && setRecent('image-doc-scan', t));
      }, 'image/jpeg', 0.9);
    } catch (e) { console.error('scan failed', e); }
    finally { setBusy(false); }
  };

  const downloadImage = (type: 'image/jpeg' | 'image/png') => {
    const canvas = resultCanvasRef.current; if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `scan.${type === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }, type, 0.92);
  };

  const downloadPdf = async () => {
    const canvas = resultCanvasRef.current; if (!canvas) return;
    const { jsPDF } = await import('jspdf');
    const portrait = canvas.height >= canvas.width;
    const pdf = new jsPDF({ orientation: portrait ? 'portrait' : 'landscape', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const scale = Math.min(pw / canvas.width, ph / canvas.height);
    const w = canvas.width * scale, h = canvas.height * scale;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
    pdf.save('scan.pdf');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {policyGate.element}
      <div className="space-y-3">
        {!img ? (
          <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }} onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[4/3] items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="bg-white/[0.06] p-4"><Upload className="h-6 w-6 text-white/80" /></div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">Drop a photo of a document</div>
                <div className="mt-1 text-[13px] text-white/55">Receipt, page, whiteboard — files stay yours</div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">or click to browse</div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
          </div>
        ) : resultUrl ? (
          <div className="border border-black/[0.08] bg-white">
            <img src={resultUrl} alt="scan" className="mx-auto block max-h-[70vh] w-auto" />
          </div>
        ) : (
          <div ref={stageRef} className="relative select-none border border-black/[0.08] bg-black" onPointerMove={onMove} onPointerUp={() => setDrag(-1)}>
            <img src={img.src} alt="source" className="block w-full" draggable={false} />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')} fill="rgba(80,160,255,0.18)" stroke="#4ea0ff" strokeWidth="0.4" />
            </svg>
            {corners.map((c, i) => (
              <button key={i} type="button"
                onPointerDown={(e) => { setDrag(i); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-white bg-[#4ea0ff] shadow"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} />
            ))}
            {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
          </div>
        )}
        {img && !resultUrl && <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">Drag the four corners to the document edges, then scan.</p>}
      </div>

      <aside className="space-y-4">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Output style</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([['bw', 'B&W'], ['gray', 'Gray'], ['color', 'Color']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={cn('border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition',
                  mode === m ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {img && !resultUrl && (
          <button type="button" onClick={scan} disabled={busy}
            className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition', busy ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-image)] text-white shadow-lg hover:brightness-110')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Scan
          </button>
        )}

        {resultUrl && (
          <>
            <button type="button" onClick={downloadPdf} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110">
              <Download className="h-4 w-4" /> Download PDF
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => downloadImage('image/jpeg')} className="flex items-center justify-center gap-1.5 border border-black/[0.08] py-2.5 text-[12px] font-semibold text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"><Download className="h-3.5 w-3.5" /> JPG</button>
              <button type="button" onClick={() => downloadImage('image/png')} className="flex items-center justify-center gap-1.5 border border-black/[0.08] py-2.5 text-[12px] font-semibold text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"><Download className="h-3.5 w-3.5" /> PNG</button>
            </div>
            <button type="button" onClick={() => setResultUrl('')} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">Re-adjust corners</button>
          </>
        )}

        {img && (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60">
            <FileText className="h-4 w-4" /> New photo
          </button>
        )}
      </aside>
    </div>
  );
}

// ---- OpenCV helpers ----

function orderCorners(pts: Pt[]): Pt[] {
  const sum = (p: Pt) => p.x + p.y;
  const diff = (p: Pt) => p.y - p.x;
  const tl = [...pts].sort((a, b) => sum(a) - sum(b))[0];
  const br = [...pts].sort((a, b) => sum(b) - sum(a))[0];
  const tr = [...pts].sort((a, b) => diff(a) - diff(b))[0];
  const bl = [...pts].sort((a, b) => diff(b) - diff(a))[0];
  return [tl, tr, br, bl];
}

function detectCorners(cv: any, img: HTMLImageElement): Pt[] | null {
  const W = img.naturalWidth, H = img.naturalHeight;
  const scale = 800 / Math.max(W, H);
  const sw = Math.round(W * scale), sh = Math.round(H * scale);
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(img, 0, 0, sw, sh);
  const src = cv.imread(c);
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 60, 180);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    let best: Pt[] | null = null, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const area = Math.abs(cv.contourArea(approx));
        if (area > bestArea && area > sw * sh * 0.15) {
          bestArea = area;
          best = [];
          for (let j = 0; j < 4; j++) best.push({ x: approx.intPtr(j, 0)[0] / sw, y: approx.intPtr(j, 0)[1] / sh });
        }
      }
      approx.delete(); cnt.delete();
    }
    return best ? orderCorners(best) : null;
  } finally {
    src.delete(); gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
  }
}

function warpAndEnhance(cv: any, img: HTMLImageElement, cornersFrac: Pt[], mode: Mode): HTMLCanvasElement {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const src = cv.imread(c);
  const [tl, tr, br, bl] = orderCorners(cornersFrac).map((p) => ({ x: p.x * W, y: p.y * H }));
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

  const out = new cv.Mat();
  if (mode === 'color') {
    warped.copyTo(out);
  } else {
    const gray = new cv.Mat();
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    if (mode === 'gray') {
      gray.copyTo(out);
    } else {
      cv.adaptiveThreshold(gray, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 12);
    }
    gray.delete();
  }
  const result = document.createElement('canvas');
  cv.imshow(result, out);
  src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); warped.delete(); out.delete();
  return result;
}

async function makeThumb(blob: Blob): Promise<string> {
  try {
    const bm = await createImageBitmap(blob);
    const max = 192, scale = Math.min(1, max / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * scale)), h = Math.max(1, Math.round(bm.height * scale));
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
    const ctx = cc.getContext('2d'); if (!ctx) return '';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bm, 0, 0, w, h); bm.close();
    return cc.toDataURL('image/jpeg', 0.6);
  } catch { return ''; }
}
