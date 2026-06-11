'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { removeBackground as removeBgEngine } from '@/engines/image';

/**
 * Avatar & Profile Picture Studio — oioxo / newxonvert version
 * Standalone self-contained component using robust standard HTML/CSS.
 */

const GRADIENT_PRESETS = [
  { c1: '#f43f5e', c2: '#fbbf24' },
  { c1: '#06b6d4', c2: '#3b82f6' },
  { c1: '#4f46e5', c2: '#c084fc' },
  { c1: '#10b981', c2: '#059669' },
  { c1: '#d946ef', c2: '#f43f5e' }
];

export default function AvatarStudioUI() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── State ── */
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [cutoutImage, setCutoutImage] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Styling Settings
  const [bgType, setBgType] = useState<'color' | 'gradient'>('gradient');
  const [bgColor, setBgColor] = useState('#6366f1');
  const [gradStart, setGradStart] = useState('#4f46e5');
  const [gradEnd, setGradEnd] = useState('#c084fc');

  const [ringWidth, setRingWidth] = useState<number>(8);
  const [ringColor, setRingColor] = useState('#ffffff');

  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [exportCircular, setExportCircular] = useState<boolean>(true);

  // Track the cutout blob URL so each new cutout revokes the old one.
  // Without this, every "Remove Background" click leaked one blob URL.
  const cutoutUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (cutoutUrlRef.current) URL.revokeObjectURL(cutoutUrlRef.current); }, []);

  /* ── Handlers ── */
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
        setCutoutImage(null);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeBackground = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(originalImage, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not capture source image')), 'image/png'));
      const resultBlob = await removeBgEngine(blob, { format: 'image/png', quality: 'balanced' });
      if (cutoutUrlRef.current) URL.revokeObjectURL(cutoutUrlRef.current);
      const url = URL.createObjectURL(resultBlob);
      cutoutUrlRef.current = url;
      const img = new Image();
      img.onload = () => {
        setCutoutImage(img);
        setIsProcessing(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (cutoutUrlRef.current === url) cutoutUrlRef.current = null;
        setIsProcessing(false);
      };
      img.src = url;
    } catch {
      // Fallback
      setCutoutImage(originalImage);
      setIsProcessing(false);
    }
  };

  /* ── Canvas Compositing ── */
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const w = 400;
    const h = 400;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    if (exportCircular) {
      ctx.beginPath();
      ctx.arc(200, 200, 200, 0, Math.PI * 2);
      ctx.clip();
    }

    // 1. Draw Backdrop background
    if (bgType === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, gradStart);
      grad.addColorStop(1, gradEnd);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Draw Subject Face
    const subject = cutoutImage || originalImage;
    if (subject) {
      ctx.save();
      const imgRatio = subject.width / subject.height;
      let renderW = w;
      let renderH = h;

      if (imgRatio > 1) {
        renderW = h * imgRatio;
      } else {
        renderH = w / imgRatio;
      }

      renderW *= zoom;
      renderH *= zoom;

      const dx = (w - renderW) / 2 + offsetX;
      const dy = (h - renderH) / 2 + offsetY;

      ctx.drawImage(subject, dx, dy, renderW, renderH);
      ctx.restore();
    }

    // 3. Draw Ring Border
    if (ringWidth > 0) {
      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = ringWidth;
      ctx.beginPath();
      ctx.arc(200, 200, 200 - ringWidth/2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

  }, [originalImage, cutoutImage, bgType, bgColor, gradStart, gradEnd, ringWidth, ringColor, zoom, offsetX, offsetY, exportCircular]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'avatar.png';
    link.href = canvasRef.current.toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ border: '2px dashed #cbd5e1', padding: 24, borderRadius: 12, textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleUpload} style={{ width: '100%' }} />
          <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 6 }}>Select portrait face photo</span>
        </div>

        {originalImage && (
          <button 
            onClick={removeBackground} 
            disabled={isProcessing || !!cutoutImage}
            style={{ padding: '10px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isProcessing ? 'Isolating...' : cutoutImage ? '✓ Face Isolated' : 'Remove Background'}
          </button>
        )}

        {originalImage && (
          <>
            {/* Backdrop controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 'bold' }}>Backdrop style</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {GRADIENT_PRESETS.map((p, idx) => (
                  <button 
                    key={idx}
                    onClick={() => { setBgType('gradient'); setGradStart(p.c1); setGradEnd(p.c2); }} 
                    style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})`, width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer' }} 
                  />
                ))}
              </div>
              
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input type="color" value={gradStart} onChange={e => { setBgType('gradient'); setGradStart(e.target.value); }} style={{ flex: 1, height: 28, cursor: 'pointer' }} />
                <input type="color" value={gradEnd} onChange={e => { setBgType('gradient'); setGradEnd(e.target.value); }} style={{ flex: 1, height: 28, cursor: 'pointer' }} />
              </div>
            </div>

            {/* Adjust Face */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 'bold' }}>Face Framing</span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10 }}>Zoom ({zoom.toFixed(2)}x)</span>
                <input type="range" min="0.5" max="2.0" step="0.05" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10 }}>Center Offset X ({offsetX}px)</span>
                <input type="range" min="-100" max="100" value={offsetX} onChange={e => setOffsetX(parseInt(e.target.value))} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10 }}>Center Offset Y ({offsetY}px)</span>
                <input type="range" min="-100" max="100" value={offsetY} onChange={e => setOffsetY(parseInt(e.target.value))} />
              </div>
            </div>

            {/* Border ring */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 'bold' }}>Border Ring</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="range" min="0" max="20" value={ringWidth} onChange={e => setRingWidth(parseInt(e.target.value))} style={{ flex: 1 }} />
                <input type="color" value={ringColor} onChange={e => setRingColor(e.target.value)} style={{ width: 30, height: 24, cursor: 'pointer', border: '1px solid #cbd5e1' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" id="cr-chk" checked={exportCircular} onChange={e => setExportCircular(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="cr-chk" style={{ fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>Circular Cropped Export</label>
            </div>

            <button onClick={download} style={{ padding: '12px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 10 }}>
              Export Avatar PNG
            </button>
          </>
        )}
      </div>

      <div style={{ 
        background: 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAMUlEQVQ4T2P8z8Dwn5GMwMRABmDiAAGQhJEYZ2FmYMwAMoIYbDQ1wWiqmXg1MxA2AAAGX08B01aJfwAAAABJRU5ErkJggg==)', 
        borderRadius: 12, 
        padding: 24, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: 400,
        position: 'relative'
      }}>
        {originalImage ? (
          <div style={{ position: 'relative' }}>
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: exportCircular ? '50%' : '12px', boxShadow: '0 20px 45px rgba(0,0,0,0.15)' }} />
            {isProcessing && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: 13, borderRadius: exportCircular ? '50%' : '12px' }}>
                Isolating Portrait...
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: '#94a3b8' }}>Upload a portrait to see custom avatar preview</p>
        )}
      </div>
    </div>
  );
}
