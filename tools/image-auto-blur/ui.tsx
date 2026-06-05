'use client';
import * as React from 'react';
import { Loader2, Download, Upload, Shield } from 'lucide-react';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { downloadBlob } from '@/engines/ffmpeg';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
let detectorPromise: Promise<FaceDetector> | null = null;
async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(`${BASE}/mediapipe/wasm`);
      const make = (delegate: 'GPU' | 'CPU') => FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${BASE}/mediapipe/blaze_face_short_range.tflite`, delegate },
        runningMode: 'IMAGE', minDetectionConfidence: 0.5,
      });
      try { return await make('GPU'); } catch { return make('CPU'); }
    })();
  }
  return detectorPromise;
}
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
}

export default function AutoBlurFaces() {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [count, setCount] = React.useState<number | null>(null);
  const [out, setOut] = React.useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = React.useState('');
  const [strength, setStrength] = React.useState(18);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { guard, gate } = useUsageGate('image');

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);

  const run = async (file: File) => {
    if (!(await guard({ bytes: file.size }))) return;
    setBusy(true); setError(''); setOut(null); setCount(null); setStatus('Loading detector…');
    try {
      const detector = await getDetector();
      setStatus('Detecting faces…');
      const img = await loadImage(file);
      const W = img.naturalWidth, H = img.naturalHeight;
      const res = detector.detect(img);
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const blurPx = Math.max(6, Math.round((strength / 100) * Math.max(W, H) * 0.12));
      for (const d of res.detections) {
        const b = d.boundingBox; if (!b) continue;
        const pad = b.width * 0.12;
        const x = Math.max(0, b.originX - pad), y = Math.max(0, b.originY - pad);
        const w = Math.min(W - x, b.width + pad * 2), h = Math.min(H - y, b.height + pad * 2);
        // Blur just the face region by re-drawing it through a blur filter, clipped.
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
        ctx.filter = 'none'; ctx.restore();
      }
      setCount(res.detections.length);
      URL.revokeObjectURL(img.src);
      const blob: Blob = await new Promise((r, j) => canvas.toBlob((b) => b ? r(b) : j(new Error('export failed')), 'image/png'));
      setOut({ url: URL.createObjectURL(blob), blob });
    } catch { setError('Could not process this image. Try a clearer photo.'); }
    finally { setBusy(false); setStatus(''); }
  };

  return (
    <div className="space-y-4">
      {gate}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[12px]">Blur strength
          <input type="range" min={6} max={40} value={strength} onChange={(e) => setStrength(+e.target.value)} />
        </label>
      </div>
      <div onClick={() => inputRef.current?.click()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void run(f); }} onDragOver={(e) => e.preventDefault()}
        className="flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-16 text-center">
        <Shield className="h-7 w-7 text-[var(--color-cat-image)]" />
        <div className="text-[15px] font-semibold">{busy ? status || 'Working…' : 'Drop a photo to blur faces'}</div>
        <div className="text-[12px] text-[var(--color-fg-muted)]">Every detected face is blurred automatically — all on your device.</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ''; }} />
      {busy && <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {status}</div>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      {out && (
        <div className="space-y-2 border border-[var(--color-cat-image)]/40 bg-[var(--color-cat-image)]/5 p-4">
          {count != null && <div className="text-[13px] font-semibold">{count} face{count === 1 ? '' : 's'} blurred.</div>}
          <img src={out.url} alt="blurred" className="max-h-96 w-full object-contain" />
          <button type="button" onClick={() => downloadBlob(out.blob, 'blurred.png')} className="flex w-fit items-center gap-2 bg-[var(--color-cat-image)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download</button>
        </div>
      )}
    </div>
  );
}
