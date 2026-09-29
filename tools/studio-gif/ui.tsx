'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * GIF Studio — oioxo / newxonvert version
 * Standalone self-contained component using robust standard HTML/CSS.
 */

interface GifFrame {
  id: string;
  src: string;
  file: File;
}

export default function GifStudioUI() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── State ── */
  const [frames, setFrames] = useState<GifFrame[]>([]);
  const [delay, setDelay] = useState<number>(200); // ms per frame
  const [caption, setCaption] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compiledGif, setCompiledGif] = useState<string | null>(null);

  const [previewIdx, setPreviewIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [size, setSize] = useState<number>(400); // configurable output square (was fixed 400)
  const SIZES = [240, 320, 400, 480, 640];

  /* ── Load Dynamic gifshot ── */
  useEffect(() => {
    if ((window as any).gifshot) return;
    const script = document.createElement('script');
    // crossOrigin: under the site's COEP isolation a no-CORS cross-origin script
    // is blocked (ERR_BLOCKED_BY_ORB), so gifshot never loaded and every compile
    // hit "still loading". jsDelivr sends ACAO:*. (cdnjs lists NO files for gifshot: every version 404s.)
    script.crossOrigin = 'anonymous';
    script.src = 'https://cdn.jsdelivr.net/npm/gifshot@0.4.5/dist/gifshot.min.js';
    script.async = true;
    script.onerror = () => { (window as any).__gifshotFailed = true; };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  /* ── Animation loop ── */
  useEffect(() => {
    if (frames.length === 0 || !isPlaying || compiledGif) return;
    const timer = setInterval(() => {
      setPreviewIdx(prev => (prev + 1) % frames.length);
    }, delay);
    return () => clearInterval(timer);
  }, [frames.length, delay, isPlaying, compiledGif]);

  /* ── Canvas Render Preview ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0 || compiledGif) return;

    const ctx = canvas.getContext('2d')!;
    const activeFrame = frames[previewIdx];
    if (!activeFrame) return;

    const img = new Image();
    img.onload = () => {
      const S = size;
      canvas.width = S;
      canvas.height = S;

      const imgRatio = img.width / img.height;
      let renderW = S;
      let renderH = S;

      if (imgRatio > 1) {
        renderW = S * imgRatio;
      } else {
        renderH = S / imgRatio;
      }

      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(img, (S - renderW) / 2, (S - renderH) / 2, renderW, renderH);

      if (caption) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, S / 133);
        ctx.font = `bold ${Math.round(S / 20)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeText(caption.toUpperCase(), S / 2, S - S * 0.075);
        ctx.fillText(caption.toUpperCase(), S / 2, S - S * 0.075);
      }
    };
    img.src = activeFrame.src;
  }, [frames, previewIdx, caption, compiledGif, size]);

  /* ── Handlers ── */
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let loaded = 0;
    const newFrames: GifFrame[] = [];

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        newFrames.push({
          id: `${Date.now()}-${Math.random()}`,
          src: reader.result as string,
          file
        });
        loaded++;

        if (loaded === files.length) {
          setFrames(prev => [...prev, ...newFrames]);
          setCompiledGif(null);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const deleteFrame = (id: string) => {
    setFrames(prev => prev.filter(f => f.id !== id));
    setCompiledGif(null);
  };

  const compile = () => {
    if (frames.length < 2) {
      alert('Upload at least 2 frames.');
      return;
    }
    if (!(window as any).gifshot) {
      alert((window as any).__gifshotFailed
        ? 'The GIF compiler could not be loaded. Check your connection and reload the page.'
        : 'The GIF compiler is still loading — try again in a moment.');
      return;
    }

    setIsCompiling(true);
    const imagesToCompile: string[] = [];
    let processed = 0;

    frames.forEach(frame => {
      const img = new Image();
      img.onload = () => {
        const S = size;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = S;
        offCanvas.height = S;
        const oCtx = offCanvas.getContext('2d')!;

        const imgRatio = img.width / img.height;
        let rW = S;
        let rH = S;

        if (imgRatio > 1) {
          rW = S * imgRatio;
        } else {
          rH = S / imgRatio;
        }

        oCtx.drawImage(img, (S - rW) / 2, (S - rH) / 2, rW, rH);

        if (caption) {
          oCtx.fillStyle = '#ffffff';
          oCtx.strokeStyle = '#000000';
          oCtx.lineWidth = Math.max(2, S / 133);
          oCtx.font = `bold ${Math.round(S / 20)}px sans-serif`;
          oCtx.textAlign = 'center';
          oCtx.strokeText(caption.toUpperCase(), S / 2, S - S * 0.075);
          oCtx.fillText(caption.toUpperCase(), S / 2, S - S * 0.075);
        }

        imagesToCompile.push(offCanvas.toDataURL('image/png'));
        processed++;

        if (processed === frames.length) {
          (window as any).gifshot.createGIF({
            images: imagesToCompile,
            interval: delay / 1000,
            gifWidth: size,
            gifHeight: size
          }, (obj: any) => {
            setIsCompiling(false);
            if (!obj.error) {
              setCompiledGif(obj.image);
            } else {
              alert('Compile failed.');
            }
          });
        }
      };
      img.src = frame.src;
    });
  };

  const download = () => {
    if (!compiledGif) return;
    const link = document.createElement('a');
    link.download = 'animation.gif';
    link.href = compiledGif;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ border: '2px dashed #cbd5e1', padding: 24, borderRadius: 12, textAlign: 'center' }}>
          <input type="file" accept="image/*" multiple onChange={handleUpload} style={{ width: '100%' }} />
          <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 6 }}>Upload multiple images</span>
        </div>

        {frames.length > 0 && (
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, maxHeight: 150, overflowY: 'auto' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: 11, color: '#64748b' }}>Sequence ({frames.length} frames)</h5>
            {frames.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Frame #{i + 1}</span>
                <button onClick={() => deleteFrame(f.id)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
              </div>
            ))}
          </div>
        )}

        {frames.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold' }}>Delay: {delay}ms</label>
              <input type="range" min="50" max="1000" step="50" value={delay} onChange={e => { setDelay(parseInt(e.target.value)); setCompiledGif(null); }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold' }}>Size: {size}×{size}</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SIZES.map(s => (
                  <button key={s} type="button" onClick={() => { setSize(s); setCompiledGif(null); }}
                    style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                      border: size === s ? '2px solid #3b82f6' : '1px solid #cbd5e1', background: size === s ? '#eff6ff' : '#fff' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold' }}>Caption Overlay</label>
              <input type="text" value={caption} onChange={e => { setCaption(e.target.value); setCompiledGif(null); }} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} placeholder="CAPTION TEXT..." />
            </div>

            {!compiledGif ? (
              <button 
                onClick={compile} 
                disabled={isCompiling || frames.length < 2}
                style={{ padding: '10px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
              >
                {isCompiling ? 'Compiling...' : 'Compile GIF'}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={download} style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>Download GIF</button>
                <button onClick={() => setCompiledGif(null)} style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>Edit frames</button>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
        {frames.length > 0 ? (
          <>
            {compiledGif ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={compiledGif} alt="Compiled Result" style={{ maxWidth: '100%', maxHeight: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
            ) : (
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
            )}

            {!compiledGif && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setIsPlaying(!isPlaying)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <span style={{ fontSize: 11, color: '#64748b' }}>Frame #{previewIdx + 1} / {frames.length}</span>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: '#94a3b8' }}>Upload multiple frames to start previewing</p>
        )}
      </div>
    </div>
  );
}
