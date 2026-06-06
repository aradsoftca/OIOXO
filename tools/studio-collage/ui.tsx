'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Collage Studio — oioxo / newxonvert version
 * Standalone self-contained component using robust standard HTML/CSS.
 */

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Template {
  id: string;
  name: string;
  cells: Cell[];
}

interface ImageState {
  file: File | null;
  src: string;
  imgElement: HTMLImageElement | null;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

const LAYOUT_TEMPLATES: Template[] = [
  {
    id: '2-col',
    name: '2 Columns',
    cells: [
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 50, y: 0, w: 50, h: 100 }
    ]
  },
  {
    id: '2-row',
    name: '2 Rows',
    cells: [
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 0, y: 50, w: 100, h: 50 }
    ]
  },
  {
    id: '3-mixed',
    name: '3 Split',
    cells: [
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 50, y: 0, w: 50, h: 50 },
      { x: 50, y: 50, w: 50, h: 50 }
    ]
  },
  {
    id: '4-grid',
    name: '2x2 Grid',
    cells: [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 50, y: 0, w: 50, h: 50 },
      { x: 0, y: 50, w: 50, h: 50 },
      { x: 50, y: 50, w: 50, h: 50 }
    ]
  },
  {
    id: '5-split',
    name: '5 Split',
    cells: [
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 50, y: 0, w: 25, h: 50 },
      { x: 75, y: 0, w: 25, h: 50 },
      { x: 50, y: 50, w: 25, h: 50 },
      { x: 75, y: 50, w: 25, h: 50 }
    ]
  },
  {
    id: 'masonry',
    name: 'Masonry',
    cells: [
      { x: 0, y: 0, w: 33.33, h: 60 },
      { x: 0, y: 60, w: 33.33, h: 40 },
      { x: 33.33, y: 0, w: 33.33, h: 40 },
      { x: 33.33, y: 40, w: 33.33, h: 60 },
      { x: 66.66, y: 0, w: 33.34, h: 50 },
      { x: 66.66, y: 50, w: 33.34, h: 50 }
    ]
  }
];

export default function CollageStudioUI() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── State ── */
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(LAYOUT_TEMPLATES[3]); // Default 2x2
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [images, setImages] = useState<Record<number, ImageState>>({});
  
  // Settings
  const [gap, setGap] = useState<number>(8);
  const [cornerRadius, setCornerRadius] = useState<number>(6);
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [canvasWidth, setCanvasWidth] = useState<number>(1000);
  const [canvasHeight, setCanvasHeight] = useState<number>(1000);

  const [uploadSlotTarget, setUploadSlotTarget] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // Swap two slots' images (drag one photo onto another). The defining collage
  // interaction rivals have and we lacked.
  const swapSlots = (a: number, b: number) => {
    if (a === b) return;
    setImages(prev => {
      const next = { ...prev };
      const ia = next[a], ib = next[b];
      if (ia) next[b] = ia; else delete next[b];
      if (ib) next[a] = ib; else delete next[a];
      return next;
    });
  };

  /* ── Handlers ── */
  const handleCellUpload = (e: React.ChangeEvent<HTMLInputElement>, slotIdx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadCellFile(file, slotIdx);
  };

  const loadCellFile = (file: File, slotIdx: number) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImages(prev => ({
          ...prev,
          [slotIdx]: {
            file,
            src: reader.result as string,
            imgElement: img,
            zoom: 1.0,
            offsetX: 0,
            offsetY: 0
          }
        }));
        setSelectedCellIndex(slotIdx);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const triggerUploadClick = (slotIdx: number) => {
    setUploadSlotTarget(slotIdx);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const removeImage = (slotIdx: number) => {
    setImages(prev => {
      const updated = { ...prev };
      delete updated[slotIdx];
      return updated;
    });
    if (selectedCellIndex === slotIdx) {
      setSelectedCellIndex(null);
    }
  };

  const drawRoundRect = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    radius: number
  ) => {
    if (radius <= 0) {
      ctx.rect(x, y, width, height);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /* ── Canvas Compositing ── */
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Fill Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw cells
    selectedTemplate.cells.forEach((cell, idx) => {
      const cellLeft = (cell.x * canvasWidth) / 100;
      const cellTop = (cell.y * canvasHeight) / 100;
      const cellWidth = (cell.w * canvasWidth) / 100;
      const cellHeight = (cell.h * canvasHeight) / 100;

      // Spacing math
      const insetLeft = cellLeft + gap / 2;
      const insetTop = cellTop + gap / 2;
      const insetWidth = cellWidth - gap;
      const insetHeight = cellHeight - gap;

      if (insetWidth <= 0 || insetHeight <= 0) return;

      const imgState = images[idx];

      ctx.save();
      drawRoundRect(ctx, insetLeft, insetTop, insetWidth, insetHeight, cornerRadius);
      ctx.clip();

      if (imgState && imgState.imgElement) {
        const img = imgState.imgElement;
        const imgRatio = img.width / img.height;
        const slotRatio = insetWidth / insetHeight;

        let renderW = insetWidth;
        let renderH = insetHeight;

        if (imgRatio > slotRatio) {
          renderW = insetHeight * imgRatio;
        } else {
          renderH = insetWidth / imgRatio;
        }

        renderW *= imgState.zoom;
        renderH *= imgState.zoom;

        const diffX = renderW - insetWidth;
        const diffY = renderH - insetHeight;

        const dx = insetLeft + (insetWidth - renderW) / 2 + (imgState.offsetX / 100) * (diffX > 0 ? diffX : 0);
        const dy = insetTop + (insetHeight - renderH) / 2 + (imgState.offsetY / 100) * (diffY > 0 ? diffY : 0);

        ctx.drawImage(img, dx, dy, renderW, renderH);

      } else {
        // Empty slot background
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(insetLeft, insetTop, insetWidth, insetHeight);

        // Dashed outline
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        drawRoundRect(ctx, insetLeft + 4, insetTop + 4, insetWidth - 8, insetHeight - 8, Math.max(0, cornerRadius - 4));
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.max(12, Math.min(insetWidth / 12, 20))}px sans-serif`;
        ctx.fillText(`+ SLOT ${idx + 1}`, insetLeft + insetWidth / 2, insetTop + insetHeight / 2);
      }

      ctx.restore();
    });

  }, [selectedTemplate, images, gap, cornerRadius, bgColor, canvasWidth, canvasHeight]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'collage.png';
    link.href = canvasRef.current.toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* Dynamic hidden file input */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (uploadSlotTarget !== null) {
            handleCellUpload(e, uploadSlotTarget);
          }
        }}
        className="hidden"
        style={{ display: 'none' }}
      />

      {/* Template selector */}
      <div>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Select Grid Layout</h4>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {LAYOUT_TEMPLATES.map((tpl) => {
            const isSel = selectedTemplate.id === tpl.id;
            return (
              <button
                key={tpl.id}
                onClick={() => {
                  setSelectedTemplate(tpl);
                  setSelectedCellIndex(null);
                }}
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: isSel ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                  background: isSel ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                  minWidth: 90,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <div style={{ width: 60, height: 45, position: 'relative', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  {tpl.cells.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        left: `${c.x}%`,
                        top: `${c.y}%`,
                        width: `${c.w}%`,
                        height: `${c.h}%`,
                        position: 'absolute',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        background: 'rgba(59, 130, 246, 0.08)'
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 10, fontWeight: 'bold', color: '#475569' }}>{tpl.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        
        {/* ═══════ LEFT PANEL: Controls ═══════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Output Presets */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>Collage Size</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button 
                onClick={() => { setCanvasWidth(1000); setCanvasHeight(1000); }} 
                style={{
                  padding: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  borderRadius: 6,
                  border: canvasWidth === 1000 && canvasHeight === 1000 ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                  background: canvasWidth === 1000 && canvasHeight === 1000 ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                Square (1:1)
              </button>
              <button 
                onClick={() => { setCanvasWidth(1280); setCanvasHeight(720); }} 
                style={{
                  padding: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  borderRadius: 6,
                  border: canvasWidth === 1280 && canvasHeight === 720 ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                  background: canvasWidth === 1280 && canvasHeight === 720 ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                HD Landscape (16:9)
              </button>
            </div>
          </div>

          {/* Borders & Spacings */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>Grid Spacing</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Gap ({gap}px)</span>
              </div>
              <input type="range" min="0" max="30" value={gap} onChange={e => setGap(parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Round Corners ({cornerRadius}px)</span>
              </div>
              <input type="range" min="0" max="50" value={cornerRadius} onChange={e => setCornerRadius(parseInt(e.target.value))} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11 }}>Background Color</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 32, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </div>
          </div>

          {/* Active Slot Adjustment */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>Slot Control</h4>
            {selectedCellIndex === null ? (
              <p style={{ fontSize: 11, color: '#64748b', margin: 0, textAlign: 'center', padding: '12px 0' }}>
                Select any slot to upload, scale, or reposition. Tip: drag one photo onto another to swap them.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: '#1e3a8a' }}>Slot {selectedCellIndex + 1} Selected</span>
                  <button onClick={() => setSelectedCellIndex(null)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 10, cursor: 'pointer' }}>Deselect</button>
                </div>

                {images[selectedCellIndex] ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button 
                        onClick={() => triggerUploadClick(selectedCellIndex)}
                        style={{ flex: 1, padding: '6px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Replace Image
                      </button>
                      <button 
                        onClick={() => removeImage(selectedCellIndex)}
                        style={{ padding: '6px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span>Zoom ({images[selectedCellIndex].zoom.toFixed(2)}x)</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="4" 
                        step="0.05"
                        value={images[selectedCellIndex].zoom} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setImages(prev => ({
                            ...prev,
                            [selectedCellIndex]: { ...prev[selectedCellIndex], zoom: val }
                          }));
                        }} 
                        style={{ width: '100%' }} 
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span>Offset X ({images[selectedCellIndex].offsetX}%)</span>
                      </div>
                      <input 
                        type="range" 
                        min="-100" 
                        max="100" 
                        value={images[selectedCellIndex].offsetX} 
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setImages(prev => ({
                            ...prev,
                            [selectedCellIndex]: { ...prev[selectedCellIndex], offsetX: val }
                          }));
                        }} 
                        style={{ width: '100%' }} 
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span>Offset Y ({images[selectedCellIndex].offsetY}%)</span>
                      </div>
                      <input 
                        type="range" 
                        min="-100" 
                        max="100" 
                        value={images[selectedCellIndex].offsetY} 
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setImages(prev => ({
                            ...prev,
                            [selectedCellIndex]: { ...prev[selectedCellIndex], offsetY: val }
                          }));
                        }} 
                        style={{ width: '100%' }} 
                      />
                    </div>
                  </>
                ) : (
                  <button 
                    onClick={() => triggerUploadClick(selectedCellIndex)}
                    style={{ width: '100%', padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}
                  >
                    Upload Image
                  </button>
                )}
              </div>
            )}
          </div>

          <button 
            onClick={download} 
            style={{ 
              padding: '12px 16px', 
              background: '#10b981', 
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
            Export Collage PNG
          </button>
        </div>

        {/* ═══════ RIGHT PANEL: Interactive Canvas Preview ═══════ */}
        {/* Cap the preview so the whole collage (incl. the bottom slots) stays
            in view under the page header instead of running below the fold —
            the preview now fits the visible area and scales down on short
            screens. */}
        <div style={{
          background: '#f1f5f9',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 360,
          position: 'relative'
        }}>

          <div
            style={{
              position: 'relative',
              aspectRatio: `${canvasWidth} / ${canvasHeight}`,
              width: '100%',
              maxWidth: canvasWidth > canvasHeight ? 600 : 450,
              // Keep the whole collage in view on shorter screens instead of
              // pushing the bottom slots below the fold.
              maxHeight: 'calc(100vh - 240px)',
              boxShadow: '0 20px 45px rgba(0,0,0,0.12)',
              borderRadius: 12,
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

            {/* Interactive Grid Overlay layer */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
              {selectedTemplate.cells.map((cell, idx) => {
                const isSel = selectedCellIndex === idx;
                const cellPadding = gap / 2;

                return (
                  <div
                    key={idx}
                    draggable={!!images[idx]}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCellIndex(idx);
                    }}
                    onDragStart={(e) => { setDragFrom(idx); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) { swapSlots(dragFrom, idx); setDragFrom(null); } }}
                    onDragEnd={() => setDragFrom(null)}
                    style={{
                      left: `${cell.x}%`,
                      top: `${cell.y}%`,
                      width: `${cell.w}%`,
                      height: `${cell.h}%`,
                      position: 'absolute',
                      padding: `${cellPadding}px`,
                      boxSizing: 'border-box',
                      cursor: images[idx] ? 'grab' : 'pointer',
                      opacity: dragFrom === idx ? 0.4 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: `${cornerRadius}px`,
                        outline: isSel ? '3px solid #3b82f6' : 'none',
                        outlineOffset: '-3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                        transition: 'background 0.2s',
                        background: isSel ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                      }}
                      onMouseOver={(e) => {
                        if (!isSel) e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                      }}
                      onMouseOut={(e) => {
                        if (!isSel) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {!images[idx] && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                          color: '#94a3b8',
                          fontWeight: 'bold'
                        }}>
                          <span>+ SLOT {idx + 1}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
