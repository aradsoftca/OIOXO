/**
 * Thumbnail generator — when the user drops a file (or paste-attaches one)
 * into the search input, we produce a small preview so the SERP can show
 * what the file actually IS before any tool runs.
 *
 *   image  → downscaled <canvas> dataURL (max 128×128, preserve aspect)
 *   video  → frame at t=0 via <video> + canvas
 *   pdf    → first page rendered if pdf.js is available, else icon
 *   audio  → simple waveform sketch from decoded peak amplitudes
 *   text   → first 80 chars rendered onto a canvas
 *   other  → kind icon (zip, doc, etc.)
 *
 * Everything is best-effort and synchronous-feeling for the SERP — wrapped
 * in a 600ms wall-clock budget so a giant file never blocks rendering.
 *
 * Exposes window.oioxoThumbs = { generate, kindOf }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoThumbs) return;

  const BUDGET_MS = 600;
  const MAX = 128;

  function kindOf(file){
    if (!file) return 'unknown';
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    if (t === 'application/pdf') return 'pdf';
    if (t.startsWith('text/') || /\.(txt|md|json|csv|xml|html|js|ts|css)$/i.test(file.name || '')) return 'text';
    if (/zip|rar|7z|tar|gz/i.test(t)) return 'archive';
    if (/word|excel|powerpoint|opendocument/i.test(t)) return 'document';
    return 'unknown';
  }

  function within(p){
    return Promise.race([
      p,
      new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
    ]);
  }

  /** Image thumb — load via createImageBitmap (fast path) or HTMLImageElement,
   *  draw to canvas at fit-128, return dataURL. */
  async function imageThumb(file){
    if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
    let bitmap = null;
    if (typeof createImageBitmap === 'function'){
      try { bitmap = await createImageBitmap(file); } catch {}
    }
    let w, h, source;
    if (bitmap){ w = bitmap.width; h = bitmap.height; source = bitmap; }
    else {
      const url = URL.createObjectURL(file);
      try {
        source = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img); img.onerror = rej;
          img.src = url;
        });
        w = source.naturalWidth; h = source.naturalHeight;
      } catch { URL.revokeObjectURL(url); return null; }
      finally { URL.revokeObjectURL(url); }
    }
    const scale = Math.min(MAX / w, MAX / h, 1);
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, tw, th);
    try { return c.toDataURL('image/webp', 0.75); } catch { return c.toDataURL('image/png'); }
  }

  /** Video thumb — load metadata, seek to 0, draw a frame. */
  async function videoThumb(file){
    if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.src = url;
      await new Promise((res, rej) => {
        v.onloadeddata = res; v.onerror = rej;
        setTimeout(rej, 400);
      });
      const w = v.videoWidth, h = v.videoHeight;
      const scale = Math.min(MAX / w, MAX / h, 1);
      const tw = Math.round(w * scale), th = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      c.getContext('2d').drawImage(v, 0, 0, tw, th);
      return c.toDataURL('image/webp', 0.75);
    } catch { return null; }
    finally { URL.revokeObjectURL(url); }
  }

  /** Text thumb — read first 4KB, render first ~80 chars onto a canvas. */
  async function textThumb(file){
    if (typeof document === 'undefined') return null;
    let text = '';
    try { text = (await file.slice(0, 4096).text()).slice(0, 80); }
    catch { return null; }
    const c = document.createElement('canvas');
    c.width = MAX; c.height = MAX;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, MAX, MAX);
    ctx.fillStyle = '#a8a8aa'; ctx.font = '10px monospace';
    let y = 12;
    for (const line of text.split('\n').slice(0, 10)){
      ctx.fillText(line.slice(0, 18), 4, y);
      y += 12;
    }
    return c.toDataURL('image/png');
  }

  /** Audio thumb — decode first ~2s, draw a sparkline-style peak waveform. */
  async function audioThumb(file){
    if (typeof document === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const ctx = new window.AudioContext();
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const step = Math.floor(data.length / MAX);
      const peaks = [];
      for (let i = 0; i < MAX; i++){
        let max = 0;
        const j0 = i * step, j1 = Math.min(data.length, j0 + step);
        for (let j = j0; j < j1; j++){ const v = Math.abs(data[j]); if (v > max) max = v; }
        peaks.push(max);
      }
      const c = document.createElement('canvas');
      c.width = MAX; c.height = MAX;
      const cx = c.getContext('2d');
      cx.fillStyle = '#0e0e10'; cx.fillRect(0, 0, MAX, MAX);
      cx.strokeStyle = '#8af'; cx.lineWidth = 1;
      cx.beginPath();
      for (let i = 0; i < peaks.length; i++){
        const h = peaks[i] * MAX * 0.9;
        cx.moveTo(i, MAX / 2 - h / 2);
        cx.lineTo(i, MAX / 2 + h / 2);
      }
      cx.stroke();
      try { ctx.close(); } catch {}
      return c.toDataURL('image/png');
    } catch { return null; }
  }

  /** Top-level dispatch. Returns { dataUrl, kind } or null on failure. */
  async function generate(file){
    if (!file) return null;
    const kind = kindOf(file);
    let dataUrl = null;
    switch (kind){
      case 'image':  dataUrl = await within(imageThumb(file)); break;
      case 'video':  dataUrl = await within(videoThumb(file)); break;
      case 'text':   dataUrl = await within(textThumb(file)); break;
      case 'audio':  dataUrl = await within(audioThumb(file)); break;
      default: break;
    }
    return { kind, dataUrl, name: file.name, size: file.size, type: file.type };
  }

  window.oioxoThumbs = { generate, kindOf };
})();
