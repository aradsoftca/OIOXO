'use client';

/**
 * QR & Barcode Scanner — oioxo / newxonvert version.
 * Camera + image scanning. Uses the native BarcodeDetector when available
 * (multi-format), and falls back to jsQR loaded from the jsdelivr CDN (QR only)
 * — we host no library. All decoding happens on-device.
 */

import * as React from 'react';
import { Camera, Image as ImageIcon, Copy, ExternalLink, RotateCcw, ScanLine } from 'lucide-react';

/* jsQR fallback, loaded at runtime from the CDN (host nothing) */
const JSQR_URL: string = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';
let jsqrMod: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;
async function loadJsQR() {
  if (!jsqrMod) {
    const m: any = await import(/* webpackIgnore: true */ JSQR_URL);
    jsqrMod = m.default || m;
  }
  return jsqrMod!;
}
function nativeDetector(): any | null {
  const BD = (typeof window !== 'undefined' ? (window as any).BarcodeDetector : null);
  if (!BD) return null;
  try { return new BD(); } catch { return null; }
}

async function decodeCanvas(canvas: HTMLCanvasElement, det: any): Promise<string | null> {
  if (det) {
    try { const codes = await det.detect(canvas); if (codes && codes.length) return codes[0].rawValue as string; } catch { /* fall through */ }
  }
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const jsqr = await loadJsQR();
  const r = jsqr(img.data, img.width, img.height);
  return r ? r.data : null;
}

export default function QRScannerUI() {
  const [result, setResult] = React.useState('');
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const detRef = React.useRef<any>(null);
  const rafRef = React.useRef<number>(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setScanning(false);
  };
  React.useEffect(() => () => stop(), []);

  const isUrl = /^https?:\/\//i.test(result.trim());

  const startCamera = async () => {
    setError(''); setResult('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera not supported on this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; detRef.current = nativeDetector();
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setScanning(true);
      const work = document.createElement('canvas');
      const loop = async () => {
        const v = videoRef.current;
        if (v && v.videoWidth) {
          work.width = v.videoWidth; work.height = v.videoHeight;
          work.getContext('2d')!.drawImage(v, 0, 0);
          try {
            const hit = await decodeCanvas(work, detRef.current);
            if (hit) { setResult(hit); stop(); return; }
          } catch { /* keep scanning */ }
        }
        rafRef.current = requestAnimationFrame(() => { void loop(); });
      };
      void loop();
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'NotAllowedError' ? 'Camera permission was denied.' : err.message || 'Could not access the camera.');
    }
  };

  const scanImage = async (file: File) => {
    setError(''); setResult('');
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('bad image')); img.src = url; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const hit = await decodeCanvas(c, nativeDetector());
      if (hit) setResult(hit); else setError('No QR code or barcode found in that image.');
    } catch { setError('Could not read that image.'); }
  };

  const copy = () => { void navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => { /* iframe / permission denied */ }); };
  const reset = () => { stop(); setResult(''); setError(''); };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <ScanLine className="h-10 w-10 text-white/40" /><div className="text-[14px] text-white/60">Scan with your camera or an image</div>
          </div>
        )}
        {scanning && <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 border-2 border-white/70" />}
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      {result && (
        <div className="space-y-2 border border-[var(--color-cat-generator)] bg-[var(--color-surface-1)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</div>
          <div className="break-all font-mono text-[14px] text-[var(--color-fg)]">{result}</div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={copy} className="flex items-center gap-1.5 border border-black/[0.08] px-3 py-1.5 text-[12px] font-bold uppercase text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}</button>
            {isUrl && <a href={result} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 border border-black/[0.08] px-3 py-1.5 text-[12px] font-bold uppercase text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><ExternalLink className="h-3.5 w-3.5" /> Open</a>}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!scanning ? (
          <button type="button" onClick={startCamera} className="flex flex-1 items-center justify-center gap-2 bg-[var(--color-cat-generator)] py-3 text-[13px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110"><Camera className="h-4 w-4" /> Scan with camera</button>
        ) : (
          <button type="button" onClick={reset} className="flex flex-1 items-center justify-center gap-2 bg-red-600 py-3 text-[13px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"><RotateCcw className="h-4 w-4" /> Stop</button>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 border border-black/[0.08] py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><ImageIcon className="h-4 w-4" /> Scan image</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanImage(f); }} />
      </div>
    </div>
  );
}
