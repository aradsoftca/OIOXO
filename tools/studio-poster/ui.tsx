'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Poster & Flyer Studio — oioxo / newxonvert version
 * Standalone self-contained component using robust standard HTML/CSS.
 */

interface BaseLayer {
  id: string;
  name: string;
  type: 'text' | 'shape' | 'image';
  x: number;
  y: number;
}

interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
}

interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shapeType: 'rect' | 'circle';
  w: number;
  h: number;
  color: string;
  opacity: number;
}

interface ImageLayer extends BaseLayer {
  type: 'image';
  w: number;
  h: number;
  opacity: number;
  img: HTMLImageElement;
}

type Layer = TextLayer | ShapeLayer | ImageLayer;

interface PosterTemplate {
  id: string;
  name: string;
  bgType: 'color' | 'gradient';
  bgColor: string;
  gradColor1: string;
  gradColor2: string;
  layers: Layer[];
}

const INITIAL_TEMPLATES: PosterTemplate[] = [
  {
    id: 'flyer-minimal',
    name: 'Minimal Event Flyer',
    bgType: 'color',
    bgColor: '#fafaf9',
    gradColor1: '#ffffff',
    gradColor2: '#f3f4f6',
    layers: [
      {
        id: 'rect-border',
        name: 'Border Frame',
        type: 'shape',
        shapeType: 'rect',
        x: 50,
        y: 50,
        w: 90,
        h: 92,
        color: '#1c1917',
        opacity: 0.05
      } as ShapeLayer,
      {
        id: 'title-creative',
        name: 'Title Text',
        type: 'text',
        text: 'CREATIVE CONFERNECE',
        x: 50,
        y: 20,
        fontSize: 32,
        color: '#1c1917'
      } as TextLayer,
      {
        id: 'subtitle-creative',
        name: 'Subtitle',
        type: 'text',
        text: 'A masterclass on visual aesthetics & graphic layout grids.',
        x: 50,
        y: 30,
        fontSize: 14,
        color: '#6b7280'
      } as TextLayer,
      {
        id: 'accent-dot',
        name: 'Accent Dot',
        type: 'shape',
        shapeType: 'circle',
        x: 50,
        y: 48,
        w: 10,
        h: 10,
        color: '#f59e0b',
        opacity: 0.95
      } as ShapeLayer,
      {
        id: 'info-line1',
        name: 'Date Venue Details',
        type: 'text',
        text: 'SATURDAY, JUNE 27 • 6:00 PM • GALLERY HALL',
        x: 50,
        y: 70,
        fontSize: 14,
        color: '#1c1917'
      } as TextLayer,
      {
        id: 'footer-note',
        name: 'Footer brand',
        type: 'text',
        text: 'FREE ENTRY • REGISTRATION REQUIRED • XONVERT.COM',
        x: 50,
        y: 88,
        fontSize: 10,
        color: '#9ca3af'
      } as TextLayer
    ]
  },
  {
    id: 'poster-neon',
    name: 'Neon Party Poster',
    bgType: 'gradient',
    bgColor: '#000000',
    gradColor1: '#1e1b4b',
    gradColor2: '#311042',
    layers: [
      {
        id: 'neon-glow-1',
        name: 'Neon Backdrop circle',
        type: 'shape',
        shapeType: 'circle',
        x: 50,
        y: 35,
        w: 60,
        h: 50,
        color: '#ec4899',
        opacity: 0.2
      } as ShapeLayer,
      {
        id: 'neon-title',
        name: 'Neon Title Text',
        type: 'text',
        text: 'NEON BEATS',
        x: 50,
        y: 30,
        fontSize: 50,
        color: '#ffffff'
      } as TextLayer,
      {
        id: 'neon-sub',
        name: 'Neon Subtitle',
        type: 'text',
        text: 'THE ULTIMATE SYNTHWAVE EXPERIENCE',
        x: 50,
        y: 45,
        fontSize: 13,
        color: '#f43f5e'
      } as TextLayer,
      {
        id: 'neon-box',
        name: 'Ticket box',
        type: 'shape',
        shapeType: 'rect',
        x: 50,
        y: 62,
        w: 50,
        h: 12,
        color: '#1e293b',
        opacity: 0.8
      } as ShapeLayer,
      {
        id: 'neon-box-txt',
        name: 'Box details',
        type: 'text',
        text: 'DOORS OPEN 9 PM • TICKETS $20',
        x: 50,
        y: 62,
        fontSize: 12,
        color: '#38bdf8'
      } as TextLayer
    ]
  }
];

export default function PosterStudioUI() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  /* ── State ── */
  const [layers, setLayers] = useState<Layer[]>(INITIAL_TEMPLATES[0].layers);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Background state
  const [bgType, setBgType] = useState<'color' | 'gradient'>('color');
  const [bgColor, setBgColor] = useState('#fafaf9');
  const [gradColor1, setGradColor1] = useState('#ffffff');
  const [gradColor2, setGradColor2] = useState('#f3f4f6');

  // Dimension presets
  const [canvasWidth, setCanvasWidth] = useState<number>(600);
  const [canvasHeight, setCanvasHeight] = useState<number>(850);

  /* ── Handlers ── */
  const loadTemplate = (tpl: PosterTemplate) => {
    setBgType(tpl.bgType);
    setBgColor(tpl.bgColor);
    setGradColor1(tpl.gradColor1);
    setGradColor2(tpl.gradColor2);
    setLayers(tpl.layers.map(l => ({ ...l })));
    setSelectedLayerId(null);
  };

  const addTextLayer = () => {
    const newId = `text-${Date.now()}`;
    const newLayer: TextLayer = {
      id: newId,
      name: 'Custom Text',
      type: 'text',
      text: 'Click here to edit text content',
      x: 50,
      y: 50,
      fontSize: 20,
      color: '#000000'
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newId);
  };

  const addShapeLayer = (shapeType: 'rect' | 'circle') => {
    const newId = `shape-${Date.now()}`;
    const newLayer: ShapeLayer = {
      id: newId,
      name: `Custom ${shapeType}`,
      type: 'shape',
      shapeType,
      x: 50,
      y: 50,
      w: 30,
      h: 20,
      color: '#3b82f6',
      opacity: 0.7
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newId);
  };

  const addImageLayer = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const id = `image-${Date.now()}`;
      const ar = img.width / img.height || 1;
      const w = 40;
      const h = Math.max(5, Math.min(90, Math.round((w * (canvasWidth / canvasHeight)) / ar)));
      const layer: ImageLayer = { id, name: 'Photo', type: 'image', x: 50, y: 50, w, h, opacity: 1, img };
      setLayers(prev => [...prev, layer]);
      setSelectedLayerId(id);
      URL.revokeObjectURL(url);
    };
    // Without an error path, a corrupt or unsupported image leaked the
    // blob URL until tab close.
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const startDrag = (e: React.PointerEvent, l: Layer) => {
    e.stopPropagation(); setSelectedLayerId(l.id);
    const r = boxRef.current?.getBoundingClientRect(); if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * 100, py = ((e.clientY - r.top) / r.height) * 100;
    dragRef.current = { id: l.id, offX: px - l.x, offY: py - l.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBoxMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const r = boxRef.current?.getBoundingClientRect(); if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * 100, py = ((e.clientY - r.top) / r.height) * 100;
    const { id, offX, offY } = dragRef.current;
    const cl = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
    setLayers(prev => prev.map(l => l.id === id ? { ...l, x: cl(px - offX), y: cl(py - offY) } : l));
  };
  const onBoxUp = () => { dragRef.current = null; };

  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId(null);
    }
  };

  const activeLayer = layers.find(l => l.id === selectedLayerId);

  const updateActiveLayer = (updates: Partial<Layer>) => {
    if (!selectedLayerId) return;
    setLayers(prev => prev.map(l => {
      if (l.id === selectedLayerId) {
        return { ...l, ...updates } as Layer;
      }
      return l;
    }));
  };

  /* ── Canvas Compositing ── */
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const w = canvasWidth;
    const h = canvasHeight;

    canvas.width = w;
    canvas.height = h;

    // Draw Background
    if (bgType === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, gradColor1);
      grad.addColorStop(1, gradColor2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Draw Layers
    layers.forEach((layer) => {
      ctx.save();

      const lX = (layer.x * w) / 100;
      const lY = (layer.y * h) / 100;

      if (layer.type === 'text') {
        const textL = layer as TextLayer;
        ctx.fillStyle = textL.color;
        ctx.font = `bold ${textL.fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textL.text, lX, lY);

      } else if (layer.type === 'shape') {
        const shapeL = layer as ShapeLayer;
        ctx.fillStyle = shapeL.color;
        ctx.globalAlpha = shapeL.opacity;

        const sW = (shapeL.w * w) / 100;
        const sH = (shapeL.h * h) / 100;

        if (shapeL.shapeType === 'rect') {
          ctx.fillRect(lX - sW / 2, lY - sH / 2, sW, sH);
        } else {
          ctx.beginPath();
          ctx.ellipse(lX, lY, sW / 2, sH / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (layer.type === 'image') {
        const imgL = layer as ImageLayer;
        const sW = (imgL.w * w) / 100;
        const sH = (imgL.h * h) / 100;
        ctx.globalAlpha = imgL.opacity;
        ctx.drawImage(imgL.img, lX - sW / 2, lY - sH / 2, sW, sH);
      }

      ctx.restore();
    });

  }, [canvasWidth, canvasHeight, bgType, bgColor, gradColor1, gradColor2, layers]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'poster.png';
    link.href = canvasRef.current.toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Templates strip */}
      <div>
        <h4 style={{ margin: '0 0 10px 0', fontSize: 13, color: '#64748b', textTransform: 'uppercase' }}>Select Template Style</h4>
        <div style={{ display: 'flex', gap: 12 }}>
          {INITIAL_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => loadTemplate(tpl)}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 'bold'
              }}
            >
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        
        {/* ═══════ LEFT PANEL: Controls ═══════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Add Layer Buttons */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>Add Layers</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <button onClick={addTextLayer} style={{ padding: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 'bold' }}>+ Text</button>
              <button onClick={() => addShapeLayer('rect')} style={{ padding: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 'bold' }}>+ Rect</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ padding: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 'bold' }}>+ Photo</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) addImageLayer(f); e.currentTarget.value = ''; }} />
          </div>

          {/* Canvas Backdrop */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>Canvas Color</h4>
            
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setBgType('color')} style={{ flex: 1, padding: 6, fontSize: 10, borderRadius: 4, border: bgType === 'color' ? '2px solid #3b82f6' : '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Solid</button>
              <button onClick={() => setBgType('gradient')} style={{ flex: 1, padding: 6, fontSize: 10, borderRadius: 4, border: bgType === 'gradient' ? '2px solid #3b82f6' : '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Gradient</button>
            </div>

            {bgType === 'color' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 32, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={gradColor1} onChange={e => setGradColor1(e.target.value)} style={{ flex: 1, height: 32, cursor: 'pointer', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                <input type="color" value={gradColor2} onChange={e => setGradColor2(e.target.value)} style={{ flex: 1, height: 32, cursor: 'pointer', borderRadius: 4, border: '1px solid #cbd5e1' }} />
              </div>
            )}
          </div>

          {/* Active Layer Editor */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>Element Adjust</h4>
            {!activeLayer ? (
              <p style={{ fontSize: 11, color: '#64748b', margin: 0, textAlign: 'center', padding: '12px 0' }}>
                Select an element in the poster preview canvas on the right to edit coordinates, labels, and styles.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 'bold', color: '#1e3a8a' }}>Active: {activeLayer.name}</span>
                  <button onClick={() => deleteLayer(activeLayer.id)} style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: 10, cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11 }}>Position X ({activeLayer.x}%)</span>
                  <input type="range" min="0" max="100" value={activeLayer.x} onChange={e => updateActiveLayer({ x: parseInt(e.target.value) })} style={{ width: '100%' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11 }}>Position Y ({activeLayer.y}%)</span>
                  <input type="range" min="0" max="100" value={activeLayer.y} onChange={e => updateActiveLayer({ y: parseInt(e.target.value) })} style={{ width: '100%' }} />
                </div>

                {activeLayer.type === 'text' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11 }}>Content</span>
                      <textarea 
                        value={(activeLayer as TextLayer).text} 
                        onChange={e => updateActiveLayer({ text: e.target.value })} 
                        rows={2} 
                        style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} 
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11 }}>Font Size</span>
                        <input 
                          type="number" 
                          value={(activeLayer as TextLayer).fontSize} 
                          onChange={e => updateActiveLayer({ fontSize: parseInt(e.target.value) || 12 })} 
                          style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, width: '100%' }} 
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11 }}>Color</span>
                        <input 
                          type="color" 
                          value={(activeLayer as TextLayer).color} 
                          onChange={e => updateActiveLayer({ color: e.target.value })} 
                          style={{ width: '100%', height: 32, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 6 }} 
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeLayer.type === 'shape' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11 }}>Width %</span>
                        <input 
                          type="number" 
                          value={(activeLayer as ShapeLayer).w} 
                          onChange={e => updateActiveLayer({ w: parseInt(e.target.value) || 5 })} 
                          style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, width: '100%' }} 
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11 }}>Height %</span>
                        <input 
                          type="number" 
                          value={(activeLayer as ShapeLayer).h} 
                          onChange={e => updateActiveLayer({ h: parseInt(e.target.value) || 5 })} 
                          style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, width: '100%' }} 
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input 
                        type="color" 
                        value={(activeLayer as ShapeLayer).color} 
                        onChange={e => updateActiveLayer({ color: e.target.value })} 
                        style={{ width: 40, height: 32, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 4 }} 
                      />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 10 }}>Opacity ({Math.round((activeLayer as ShapeLayer).opacity * 100)}%)</span>
                        <input 
                          type="range" 
                          min="0.1" 
                          max="1.0" 
                          step="0.1" 
                          value={(activeLayer as ShapeLayer).opacity} 
                          onChange={e => updateActiveLayer({ opacity: parseFloat(e.target.value) })} 
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeLayer.type === 'image' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11 }}>Width %</span>
                        <input type="number" value={(activeLayer as ImageLayer).w} onChange={e => updateActiveLayer({ w: parseInt(e.target.value) || 5 } as Partial<Layer>)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, width: '100%' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11 }}>Height %</span>
                        <input type="number" value={(activeLayer as ImageLayer).h} onChange={e => updateActiveLayer({ h: parseInt(e.target.value) || 5 } as Partial<Layer>)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10 }}>Opacity ({Math.round((activeLayer as ImageLayer).opacity * 100)}%)</span>
                      <input type="range" min="0.1" max="1.0" step="0.1" value={(activeLayer as ImageLayer).opacity} onChange={e => updateActiveLayer({ opacity: parseFloat(e.target.value) } as Partial<Layer>)} />
                    </div>
                  </>
                )}

              </div>
            )}
          </div>

          <button 
            onClick={download} 
            style={{ 
              padding: '12px 16px', 
              background: '#8b5cf6', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 8, 
              fontWeight: 'bold', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 10
            }}
          >
            Export Poster
          </button>
        </div>

        {/* ═══════ RIGHT PANEL: Interactive Canvas Preview ═══════ */}
        <div style={{ 
          background: '#f1f5f9', 
          borderRadius: 12, 
          padding: 24, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: 450,
          position: 'relative'
        }}>
          
          <div
            ref={boxRef}
            style={{
              position: 'relative',
              aspectRatio: `${canvasWidth} / ${canvasHeight}`,
              width: '100%',
              maxWidth: canvasWidth > canvasHeight ? 600 : 400,
              boxShadow: '0 20px 45px rgba(0,0,0,0.12)',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#ffffff'
            }}
          >
            {/* Canvas layer */}
            <canvas 
              ref={canvasRef} 
              style={{ 
                width: '100%', 
                height: '100%', 
                display: 'block',
                pointerEvents: 'none'
              }} 
            />

            {/* Drag + selection overlay */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} onPointerMove={onBoxMove} onPointerUp={onBoxUp} onPointerLeave={onBoxUp}>
              {layers.map((l) => {
                const isSel = selectedLayerId === l.id;
                let oW = 20;
                let oH = 8;
                if (l.type === 'shape' || l.type === 'image') {
                  oW = (l as ShapeLayer | ImageLayer).w;
                  oH = (l as ShapeLayer | ImageLayer).h;
                }

                return (
                  <div
                    key={l.id}
                    onPointerDown={(e) => startDrag(e, l)}
                    style={{
                      left: `${l.x}%`,
                      top: `${l.y}%`,
                      width: `${oW}%`,
                      height: `${oH}%`,
                      position: 'absolute',
                      transform: 'translate(-50%, -50%)',
                      border: isSel ? '2px solid #8b5cf6' : '1px dashed transparent',
                      boxSizing: 'border-box',
                      cursor: 'move',
                      touchAction: 'none'
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
