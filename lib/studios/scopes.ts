export function renderHistogram(canvas: HTMLCanvasElement, source: HTMLCanvasElement | ImageData, channel: 'rgb' | 'luma' = 'rgb'): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0b0e';
  ctx.fillRect(0, 0, W, H);

  let data: Uint8ClampedArray;
  if (source instanceof ImageData) data = source.data;
  else {
    const tw = Math.min(source.width, 320), th = Math.round(tw * (source.height / source.width));
    const tmp = document.createElement('canvas');
    tmp.width = tw; tmp.height = th;
    tmp.getContext('2d')!.drawImage(source, 0, 0, tw, th);
    data = tmp.getContext('2d')!.getImageData(0, 0, tw, th).data;
  }

  const hist = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    hist.r[r]++; hist.g[g]++; hist.b[b]++;
    hist.l[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
  }
  const series = channel === 'luma'
    ? [{ data: hist.l, color: 'rgba(255,255,255,.7)' }]
    : [
        { data: hist.r, color: 'rgba(239,68,68,.7)' },
        { data: hist.g, color: 'rgba(34,197,94,.7)' },
        { data: hist.b, color: 'rgba(59,130,246,.7)' },
      ];
  let maxV = 0;
  for (const s of series) for (let i = 0; i < 256; i++) maxV = Math.max(maxV, s.data[i]);
  const stepX = W / 256;
  for (const s of series) {
    ctx.fillStyle = s.color;
    for (let i = 0; i < 256; i++) {
      const h = (s.data[i] / maxV) * H;
      ctx.fillRect(i * stepX, H - h, Math.max(1, stepX), h);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - 1); ctx.lineTo(W, H - 1); ctx.stroke();
}

export function renderWaveformScope(canvas: HTMLCanvasElement, source: HTMLCanvasElement, channel: 'rgb' | 'luma' = 'luma'): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0b0e';
  ctx.fillRect(0, 0, W, H);

  const tw = Math.min(source.width, W);
  const th = Math.min(source.height, 200);
  const tmp = document.createElement('canvas');
  tmp.width = tw; tmp.height = th;
  tmp.getContext('2d')!.drawImage(source, 0, 0, tw, th);
  const data = tmp.getContext('2d')!.getImageData(0, 0, tw, th).data;

  const acc = new Float32Array(tw * 256 * (channel === 'rgb' ? 3 : 1));
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const o = (y * tw + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      if (channel === 'luma') {
        const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        acc[x * 256 + l] += 1;
      } else {
        acc[(0 * tw + x) * 256 + r] += 1;
        acc[(1 * tw + x) * 256 + g] += 1;
        acc[(2 * tw + x) * 256 + b] += 1;
      }
    }
  }

  let maxV = 0;
  for (let i = 0; i < acc.length; i++) maxV = Math.max(maxV, acc[i]);
  const xStep = W / tw;
  const colors = channel === 'luma'
    ? ['rgba(255,255,255,X)']
    : ['rgba(239,68,68,X)', 'rgba(34,197,94,X)', 'rgba(59,130,246,X)'];
  const channels = channel === 'rgb' ? 3 : 1;

  for (let c = 0; c < channels; c++) {
    for (let x = 0; x < tw; x++) {
      for (let l = 0; l < 256; l++) {
        const v = acc[(c * tw + x) * 256 + l];
        if (!v) continue;
        const a = Math.min(0.9, v / Math.max(1, maxV / 8));
        ctx.fillStyle = colors[c].replace('X', a.toFixed(2));
        const y = H - (l / 255) * H;
        ctx.fillRect(x * xStep, y, Math.max(1, xStep), 1);
      }
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  for (const ire of [0, 25, 50, 75, 100]) {
    const y = H - (ire / 100) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(`${ire}`, W - 2, y + 8);
  }
}

export function renderVectorscope(canvas: HTMLCanvasElement, source: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) / 2 - 8;

  ctx.fillStyle = '#0a0b0e';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let r = 0.25; r < 1; r += 0.25) { ctx.beginPath(); ctx.arc(cx, cy, radius * r, 0, Math.PI * 2); ctx.stroke(); }

  const tw = Math.min(source.width, 200);
  const th = Math.round(tw * (source.height / source.width));
  const tmp = document.createElement('canvas');
  tmp.width = tw; tmp.height = th;
  tmp.getContext('2d')!.drawImage(source, 0, 0, tw, th);
  const data = tmp.getContext('2d')!.getImageData(0, 0, tw, th).data;

  ctx.fillStyle = 'rgba(34, 211, 238, .5)';
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const u = -0.169 * r - 0.331 * g + 0.5 * b;
    const v = 0.5 * r - 0.419 * g - 0.081 * b;
    const px = cx + u * radius * 2;
    const py = cy - v * radius * 2;
    ctx.fillRect(px, py, 1, 1);
  }
}
