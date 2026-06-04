export async function computeWaveformPeaksInWorker(file: File | Blob, peakCount = 2000): Promise<{ peaks: Float32Array; duration: number; sampleRate: number }> {
  const ab = await file.arrayBuffer();
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(ab.slice(0));
  } finally {
    // Decode-only context — close so we don't burn one of the browser's ~6
    // concurrent AudioContext slots on every waveform we compute. Without
    // this, the studio silently lost audio after the user imported a handful
    // of clips.
    try { await ctx.close(); } catch { /* */ }
  }
  const channel = audioBuf.getChannelData(0);

  if (typeof Worker === 'undefined') {
    return { peaks: computePeaksSync(channel, peakCount), duration: audioBuf.duration, sampleRate: audioBuf.sampleRate };
  }

  const buf = new Float32Array(channel.length);
  buf.set(channel);

  const code = `
    self.onmessage = (e) => {
      const { data, count } = e.data;
      const samplesPer = Math.max(1, Math.floor(data.length / count));
      const peaks = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        let max = 0;
        const start = i * samplesPer;
        const end = Math.min(data.length, start + samplesPer);
        for (let j = start; j < end; j++) {
          const v = Math.abs(data[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }
      self.postMessage(peaks, [peaks.buffer]);
    };
  `;
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  const w = new Worker(url);
  try {
    const peaks: Float32Array = await new Promise((res, rej) => {
      // 60s ceiling: even a 2h audio file's peak compute should finish in
      // ~5s on a slow phone. A worker stuck in an infinite loop (bad input,
      // V8 deopt) would otherwise hang this promise forever.
      const watchdog = setTimeout(() => rej(new Error('Waveform compute timed out')), 60_000);
      w.onmessage = (e) => { clearTimeout(watchdog); res(e.data); };
      w.onerror = (err) => { clearTimeout(watchdog); rej(err); };
      w.postMessage({ data: buf, count: peakCount }, [buf.buffer]);
    });
    return { peaks, duration: audioBuf.duration, sampleRate: audioBuf.sampleRate };
  } finally {
    w.terminate();
    URL.revokeObjectURL(url);
  }
}

function computePeaksSync(channel: Float32Array, count: number): Float32Array {
  const samplesPer = Math.max(1, Math.floor(channel.length / count));
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let max = 0;
    const start = i * samplesPer;
    const end = Math.min(channel.length, start + samplesPer);
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

export async function runImageFilterInWorker(
  src: ImageData,
  filter: 'sharpen' | 'emboss' | 'edge' | 'posterize' | 'noise' | 'pixelate',
  amount: number,
): Promise<ImageData> {
  if (typeof Worker === 'undefined') return runFilterSync(src, filter, amount);

  const code = `
    const KERNELS = {
      sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
      edge: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    };
    function convolve(data, w, h, k) {
      const out = new Uint8ClampedArray(data);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const o = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            let s = 0;
            s += data[o - w * 4 - 4 + c] * k[0] + data[o - w * 4 + c] * k[1] + data[o - w * 4 + 4 + c] * k[2];
            s += data[o - 4 + c] * k[3] + data[o + c] * k[4] + data[o + 4 + c] * k[5];
            s += data[o + w * 4 - 4 + c] * k[6] + data[o + w * 4 + c] * k[7] + data[o + w * 4 + 4 + c] * k[8];
            out[o + c] = Math.max(0, Math.min(255, s));
          }
        }
      }
      return out;
    }
    self.onmessage = (e) => {
      const { buf, w, h, filter, amount } = e.data;
      const data = new Uint8ClampedArray(buf);
      if (filter === 'sharpen' || filter === 'emboss' || filter === 'edge') {
        const k = KERNELS[filter];
        let out = data;
        for (let p = 0; p < amount; p++) out = convolve(out, w, h, k);
        self.postMessage({ buf: out.buffer, w, h }, [out.buffer]);
      } else if (filter === 'posterize') {
        const step = 255 / Math.max(1, amount - 1);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.round(data[i] / step) * step;
          data[i+1] = Math.round(data[i+1] / step) * step;
          data[i+2] = Math.round(data[i+2] / step) * step;
        }
        self.postMessage({ buf: data.buffer, w, h }, [data.buffer]);
      } else if (filter === 'noise') {
        for (let i = 0; i < data.length; i += 4) {
          const n = (Math.random() - 0.5) * amount * 2;
          data[i] = Math.max(0, Math.min(255, data[i] + n));
          data[i+1] = Math.max(0, Math.min(255, data[i+1] + n));
          data[i+2] = Math.max(0, Math.min(255, data[i+2] + n));
        }
        self.postMessage({ buf: data.buffer, w, h }, [data.buffer]);
      } else {
        self.postMessage({ buf: data.buffer, w, h }, [data.buffer]);
      }
    };
  `;
  // Cap convolution iterations — a slider misbinding could pass amount=100
  // and queue 100 full-image convolutions for an export click. Higher than
  // any meaningful filter strength and bounded for a watchdog to catch.
  const safeAmount = Math.min(Math.max(1, amount), 16);
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  const w = new Worker(url);
  try {
    const result: ArrayBuffer = await new Promise((res, rej) => {
      // 60s ceiling — even a 16-iteration sharpen on a 4K image finishes well
      // under that on a slow phone. A worker stuck in a bad state shouldn't
      // hang the studio export forever.
      const watchdog = setTimeout(() => rej(new Error('Filter compute timed out')), 60_000);
      w.onmessage = (e) => { clearTimeout(watchdog); res(e.data.buf); };
      w.onerror = (err) => { clearTimeout(watchdog); rej(err); };
      const transfer = src.data.buffer.slice(0);
      w.postMessage({ buf: transfer, w: src.width, h: src.height, filter, amount: safeAmount }, [transfer]);
    });
    return new ImageData(new Uint8ClampedArray(result), src.width, src.height);
  } finally {
    w.terminate();
    URL.revokeObjectURL(url);
  }
}

function runFilterSync(src: ImageData, filter: 'sharpen' | 'emboss' | 'edge' | 'posterize' | 'noise' | 'pixelate', amount: number): ImageData {
  const data = new Uint8ClampedArray(src.data);
  if (filter === 'posterize') {
    const step = 255 / Math.max(1, amount - 1);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] / step) * step;
      data[i + 1] = Math.round(data[i + 1] / step) * step;
      data[i + 2] = Math.round(data[i + 2] / step) * step;
    }
  } else if (filter === 'noise') {
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount * 2;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
  }
  return new ImageData(data, src.width, src.height);
}
