'use client';

import * as React from 'react';
import { Upload, Download, Loader2, ScanFace } from 'lucide-react';
import type { FaceDetector } from '@mediapipe/tasks-vision';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

// One detector for the page lifetime — the ~11MB runtime loads once, on demand.
let detectorPromise: Promise<FaceDetector> | null = null;
async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(`${BASE}/mediapipe/wasm`);
      const make = (delegate: 'GPU' | 'CPU') => FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${BASE}/mediapipe/blaze_face_short_range.tflite`, delegate },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
      // Prefer the GPU delegate (faster + steadier on big images); fall back to
      // CPU on devices without WebGL2 / GPU support so the tool always works.
      try {
        return await make('GPU');
      } catch {
        return make('CPU');
      }
    })();
  }
  return detectorPromise;
}

export default function Tool() {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [count, setCount] = React.useState<number | null>(null);
  const [outUrl, setOutUrl] = React.useState('');
  const [error, setError] = React.useState('');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const run = async (file: File) => {
    setBusy(true); setError(''); setCount(null); setOutUrl(''); setStatus('Loading detector…');
    try {
      const detector = await getDetector();
      setStatus('Detecting faces…');
      const img = await loadImage(file);
      const res = detector.detect(img);
      const canvas = canvasRef.current!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const stroke = Math.max(2, Math.round(img.naturalWidth / 320));
      for (const d of res.detections) {
        const b = d.boundingBox;
        if (!b) continue;
        ctx.lineWidth = stroke;
        ctx.strokeStyle = '#7c3aed';
        ctx.strokeRect(b.originX, b.originY, b.width, b.height);
        const score = d.categories?.[0]?.score;
        if (score != null) {
          const label = `${Math.round(score * 100)}%`;
          ctx.font = `${stroke * 7}px sans-serif`;
          const w = ctx.measureText(label).width + stroke * 4;
          ctx.fillStyle = '#7c3aed';
          ctx.fillRect(b.originX, Math.max(0, b.originY - stroke * 10), w, stroke * 10);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, b.originX + stroke * 2, Math.max(stroke * 8, b.originY - stroke * 2));
        }
        ctx.fillStyle = '#22d3ee';
        for (const k of d.keypoints ?? []) {
          ctx.beginPath();
          ctx.arc(k.x * img.naturalWidth, k.y * img.naturalHeight, stroke * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      setCount(res.detections.length);
      canvas.toBlob((blob) => { if (blob) setOutUrl(URL.createObjectURL(blob)); }, 'image/png');
      setStatus('');
    } catch (e) {
      setError((e as Error).message || 'Detection failed.');
      detectorPromise = null; // allow retry after a load failure
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] py-10 transition hover:border-[var(--color-cat-image)]">
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); }} />
        {busy ? <Loader2 className="h-7 w-7 animate-spin text-[var(--color-cat-image)]" /> : <Upload className="h-7 w-7 text-[var(--color-fg-muted)]" />}
        <span className="text-[13px] font-semibold text-[var(--color-fg)]">{busy ? (status || 'Working…') : 'Drop or choose a photo'}</span>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">PNG · JPG · WebP — processed entirely on your device</span>
      </label>

      {error && <div className="text-[13px] text-[var(--color-cat-pdf)]">{error}</div>}

      {count != null && (
        <div className="flex items-center gap-2 border border-[var(--color-cat-image)]/30 bg-[var(--color-cat-image)]/[0.06] px-4 py-3 text-[14px] font-semibold text-[var(--color-fg)]">
          <ScanFace className="h-5 w-5 text-[var(--color-cat-image)]" />
          {count === 0 ? 'No faces found.' : `${count} face${count === 1 ? '' : 's'} detected`}
        </div>
      )}

      <div className={count == null ? 'hidden' : 'space-y-3'}>
        <canvas ref={canvasRef} className="max-h-[60vh] w-full border border-black/[0.08] object-contain" />
        {outUrl && (
          <a href={outUrl} download="faces.png"
            className="inline-flex items-center gap-2 bg-[var(--color-fg)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90">
            <Download className="h-4 w-4" /> Download annotated
          </a>
        )}
      </div>

      <p className="text-[11px] text-[var(--color-fg-subtle)]">
        The detector model runs locally in your browser — your photo never leaves your device.
      </p>
    </div>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = URL.createObjectURL(file);
  });
}
