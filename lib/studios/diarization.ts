export interface SpeakerSegment {
  start: number;
  end: number;
  speaker: string;
  energy: number;
  centroid: number;
}

export interface DiarizationOptions {
  windowSec?: number;
  hopSec?: number;
  numSpeakers?: number;
  silenceThresholdDb?: number;
}

export async function diarizeAudio(buffer: AudioBuffer, opts: DiarizationOptions = {}): Promise<SpeakerSegment[]> {
  const winSec = opts.windowSec ?? 1.5;
  const hopSec = opts.hopSec ?? 0.5;
  const numSpeakers = opts.numSpeakers ?? 0;
  const silenceDb = opts.silenceThresholdDb ?? -35;
  const sr = buffer.sampleRate;
  const channel = buffer.getChannelData(0);
  const winSize = Math.floor(winSec * sr);
  const hopSize = Math.floor(hopSec * sr);

  const features: { time: number; end: number; energy: number; centroid: number; voiced: boolean }[] = [];
  for (let s = 0; s + winSize <= channel.length; s += hopSize) {
    let sum = 0;
    for (let i = 0; i < winSize; i++) sum += channel[s + i] * channel[s + i];
    const rms = Math.sqrt(sum / winSize);
    const energyDb = rms > 0 ? 20 * Math.log10(rms) : -100;

    let centroidNum = 0;
    let centroidDen = 0;
    const fftSize = 1024;
    const windowSlice = channel.slice(s, s + Math.min(winSize, fftSize));
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    for (let i = 0; i < windowSlice.length; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSlice.length - 1)));
      real[i] = windowSlice[i] * w;
    }
    fft(real, imag);
    for (let k = 1; k < fftSize / 2; k++) {
      const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      const freq = (k / fftSize) * sr;
      centroidNum += freq * mag;
      centroidDen += mag;
    }
    const centroid = centroidDen > 0 ? centroidNum / centroidDen : 0;

    features.push({
      time: s / sr,
      end: (s + winSize) / sr,
      energy: energyDb,
      centroid,
      voiced: energyDb > silenceDb,
    });
  }

  const voicedFeatures = features.filter(f => f.voiced);
  if (!voicedFeatures.length) return [];

  const k = numSpeakers > 0 ? numSpeakers : guessSpeakerCount(voicedFeatures);
  const centroids = kmeans1d(voicedFeatures.map(f => f.centroid), k);

  const assigned = features.map(f => {
    if (!f.voiced) return null;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const d = Math.abs(f.centroid - centroids[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return { ...f, speaker: String.fromCharCode(65 + best) };
  });

  const segments: SpeakerSegment[] = [];
  let cur: SpeakerSegment | null = null;
  for (let i = 0; i < assigned.length; i++) {
    const f = assigned[i];
    if (!f) {
      if (cur) {
        segments.push(cur);
        cur = null;
      }
      continue;
    }
    if (cur && cur.speaker === f.speaker) {
      cur.end = f.end;
      cur.energy = (cur.energy + f.energy) / 2;
    } else {
      if (cur) segments.push(cur);
      cur = { start: f.time, end: f.end, speaker: f.speaker, energy: f.energy, centroid: f.centroid };
    }
  }
  if (cur) segments.push(cur);

  return segments.filter(s => s.end - s.start >= 0.4);
}

function guessSpeakerCount(features: { centroid: number }[]): number {
  const centroids = features.map(f => f.centroid).sort((a, b) => a - b);
  const sorted = [...centroids];
  const lowQ = sorted[Math.floor(sorted.length * 0.25)];
  const highQ = sorted[Math.floor(sorted.length * 0.75)];
  return highQ - lowQ > 600 ? 3 : highQ - lowQ > 250 ? 2 : 1;
}

function kmeans1d(values: number[], k: number, iterations = 12): number[] {
  if (values.length === 0) return [];
  if (k <= 1) return [values.reduce((s, v) => s + v, 0) / values.length];
  const sorted = [...values].sort((a, b) => a - b);
  const centroids: number[] = [];
  for (let i = 0; i < k; i++) {
    centroids.push(sorted[Math.floor((i + 0.5) * sorted.length / k)]);
  }
  for (let iter = 0; iter < iterations; iter++) {
    const buckets: number[][] = Array.from({ length: k }, () => []);
    for (const v of values) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const d = Math.abs(v - centroids[i]);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      buckets[best].push(v);
    }
    for (let i = 0; i < k; i++) {
      if (buckets[i].length > 0) {
        centroids[i] = buckets[i].reduce((s, v) => s + v, 0) / buckets[i].length;
      }
    }
  }
  return centroids;
}

function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let p = 0; p < len / 2; p++) {
        const tReal = curReal * real[i + p + len / 2] - curImag * imag[i + p + len / 2];
        const tImag = curReal * imag[i + p + len / 2] + curImag * real[i + p + len / 2];
        real[i + p + len / 2] = real[i + p] - tReal;
        imag[i + p + len / 2] = imag[i + p] - tImag;
        real[i + p] += tReal;
        imag[i + p] += tImag;
        const newReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newReal;
      }
    }
  }
}
