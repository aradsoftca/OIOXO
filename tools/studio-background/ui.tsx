'use client';

import { useState, useRef, useEffect } from 'react';
import { removeBackground as removeBgEngine } from '@/engines/image';

/**
 * Background Studio — oioxo / newxonvert version
 * Simplified standalone component.
 */

export default function BackgroundStudioUI() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [cutoutImage, setCutoutImage] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [bgType, setBgType] = useState<'transparent' | 'solid'>('transparent');

  // Track the cutout blob URL so each new cutout revokes the old one — see
  // studio-sticker for the same fix. Without this, every "Remove Background"
  // click leaked a blob URL until tab close.
  const cutoutUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (cutoutUrlRef.current) URL.revokeObjectURL(cutoutUrlRef.current); }, []);

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
      
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Could not capture source image')), 'image/png'));
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
      alert('Failed to remove background.');
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    const subject = cutoutImage || originalImage;
    if (!subject) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    canvas.width = subject.width;
    canvas.height = subject.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgType === 'solid') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.drawImage(subject, 0, 0);
  }, [originalImage, cutoutImage, bgType, bgColor]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ border: '2px dashed #cbd5e1', padding: 24, borderRadius: 12, textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleUpload} style={{ width: '100%' }} />
        </div>
        
        {originalImage && (
          <button 
            onClick={removeBackground} 
            disabled={isProcessing || !!cutoutImage}
            style={{ padding: '10px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: isProcessing ? 'wait' : 'pointer' }}
          >
            {isProcessing ? 'Removing...' : 'Remove Background'}
          </button>
        )}

        {originalImage && (
          <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Background</h4>
            <select value={bgType} onChange={e => setBgType(e.target.value as any)} style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
              <option value="transparent">Transparent</option>
              <option value="solid">Solid Color</option>
            </select>
            {bgType === 'solid' && (
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: '100%', height: 32, cursor: 'pointer', border: 'none' }} />
            )}
          </div>
        )}
      </div>

      <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        {originalImage ? (
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '600px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', background: 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAMUlEQVQ4T2P8z8Dwn5GMwMRABmDiAAGQhJEYZ2FmYMwAMoIYbDQ1wWiqmXg1MxA2AAAGX08B01aJfwAAAABJRU5ErkJggg==)' }} />
        ) : (
          <p style={{ color: '#94a3b8' }}>Preview</p>
        )}
      </div>
    </div>
  );
}
