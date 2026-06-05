'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { removeBackground as removeBgEngine } from '@/engines/image';

/**
 * Sticker Studio — oioxo / newxonvert version
 * Standalone self-contained component using robust standard HTML/CSS.
 */

export default function StickerStudioUI() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── State ── */
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [cutoutImage, setCutoutImage] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Sticker settings
  const [borderWidth, setBorderWidth] = useState<number>(10);
  const [borderColor, setBorderColor] = useState<string>('#ffffff');
  const [hasShadow, setHasShadow] = useState<boolean>(true);
  const [bannerText, setBannerText] = useState<string>('');

  // Track the cutout blob URL so each new cutout revokes the old one — the
  // browser doesn't auto-revoke blob URLs when the holding Image element is
  // GC'd, so without this every "Remove Background" click leaked a URL.
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
      // Revoke any previous cutout URL before allocating a new one so
      // re-running this action doesn't pile up leaked blobs.
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

    const subject = cutoutImage || originalImage;
    if (!subject) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const padding = Math.max(borderWidth + 20, 30);
    const w = subject.width + padding * 2;
    const h = subject.height + padding * 2 + (bannerText ? 70 : 0);

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const sx = padding;
    const sy = padding;

    // Buffer outline silhouette canvas
    const buf = document.createElement('canvas');
    buf.width = w;
    buf.height = h;
    const bCtx = buf.getContext('2d')!;

    if (borderWidth > 0) {
      bCtx.save();
      for (let angle = 0; angle < 360; angle += 10) {
        const rad = (angle * Math.PI) / 180;
        bCtx.drawImage(subject, sx + Math.cos(rad) * borderWidth, sy + Math.sin(rad) * borderWidth);
      }
      bCtx.globalCompositeOperation = 'source-in';
      bCtx.fillStyle = borderColor;
      bCtx.fillRect(0, 0, w, h);
      bCtx.restore();
    }

    // Main Draw Outlines with shadow if checked
    ctx.save();
    if (hasShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 6;
    }
    if (borderWidth > 0) {
      ctx.drawImage(buf, 0, 0);
    }
    ctx.restore();

    // Draw main subject
    ctx.drawImage(subject, sx, sy);

    // Draw Ribbon Banner
    if (bannerText) {
      ctx.save();
      const rx = w / 2;
      const ry = sy + subject.height + borderWidth + 15;

      ctx.fillStyle = '#f43f5e';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.font = 'bold 13px sans-serif';
      const textMeasure = ctx.measureText(bannerText.toUpperCase());
      const ribW = Math.max(textMeasure.width + 60, 160);
      const ribH = 30;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx - ribW/2, ry - ribH/2, ribW, ribH, 6);
      } else {
        ctx.rect(rx - ribW/2, ry - ribH/2, ribW, ribH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bannerText.toUpperCase(), rx, ry);
      ctx.restore();
    }

  }, [originalImage, cutoutImage, borderWidth, borderColor, hasShadow, bannerText]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'sticker.png';
    link.href = canvasRef.current.toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ border: '2px dashed #cbd5e1', padding: 24, borderRadius: 12, textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleUpload} style={{ width: '100%' }} />
          <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 6 }}>Select photo</span>
        </div>

        {originalImage && (
          <button 
            onClick={removeBackground} 
            disabled={isProcessing || !!cutoutImage}
            style={{ padding: '10px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isProcessing ? 'Removing...' : cutoutImage ? '✓ Cutout Ready' : 'Remove Background'}
          </button>
        )}

        {originalImage && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold' }}>Border Thickness: {borderWidth}px</label>
              <input type="range" min="0" max="30" value={borderWidth} onChange={e => setBorderWidth(parseInt(e.target.value))} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold' }}>Border Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)} style={{ width: 40, height: 32, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                <input type="text" value={borderColor} onChange={e => setBorderColor(e.target.value)} style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" id="sh-chk" checked={hasShadow} onChange={e => setHasShadow(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="sh-chk" style={{ fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>3D Peel Drop Shadow</label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold' }}>Ribbon Badge Text</label>
              <input type="text" value={bannerText} onChange={e => setBannerText(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} placeholder="STICKER LIFE..." />
            </div>

            <button onClick={download} style={{ padding: '12px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 10 }}>
              Export Sticker PNG
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
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '500px', boxShadow: '0 20px 45px rgba(0,0,0,0.15)' }} />
            {isProcessing && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                Processing Contour...
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: '#94a3b8' }}>Upload a photo to see the vinyl sticker composite</p>
        )}
      </div>
    </div>
  );
}
