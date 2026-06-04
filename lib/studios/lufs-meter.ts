export interface LufsReading {
  momentary: number;
  shortTerm: number;
  integrated: number;
  truePeak: number;
}

export class LufsMeter {
  private analyser: AnalyserNode;
  private timeData: Float32Array;
  private blockHistory: number[] = [];
  private blockHistoryLong: number[] = [];
  private integrated: number = -Infinity;
  private integratedSamples: number[] = [];
  private peak: number = -Infinity;
  private channelCount: number;

  constructor(audioContext: BaseAudioContext, source: AudioNode) {
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);
    this.timeData = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.channelCount = (source as any).channelCount ?? 2;
  }

  getNode(): AnalyserNode { return this.analyser; }

  read(): LufsReading {
    this.analyser.getFloatTimeDomainData(this.timeData as any);

    let sumSquares = 0;
    let blockPeak = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i];
      sumSquares += v * v;
      const a = Math.abs(v);
      if (a > blockPeak) blockPeak = a;
    }
    const rms = Math.sqrt(sumSquares / this.timeData.length);
    const blockLufs = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -Infinity;

    this.blockHistory.push(blockLufs);
    if (this.blockHistory.length > 4) this.blockHistory.shift();
    const momentary = isFinite(blockLufs) ? meanLufs(this.blockHistory) : -Infinity;

    this.blockHistoryLong.push(blockLufs);
    if (this.blockHistoryLong.length > 30) this.blockHistoryLong.shift();
    const shortTerm = meanLufs(this.blockHistoryLong);

    if (isFinite(blockLufs) && blockLufs > -70) {
      this.integratedSamples.push(blockLufs);
      // Cap the rolling sample buffer. At 30 fps the previous unbounded
      // version stored 108k samples after an hour and ran an O(n²) reduce +
      // filter on EVERY read — meter CPU climbed linearly with recording
      // length and eventually janked the UI. 20 k samples = ~11 min at
      // 30 fps, plenty for the meter's "long-term average" feel without
      // dragging hour-long sessions to a crawl.
      if (this.integratedSamples.length > 20_000) {
        // Drop the oldest 20% in one shot so we don't reshape on every push.
        this.integratedSamples.splice(0, 4_000);
      }
      const filterThreshold = this.integratedSamples.reduce((s, v) => s + v, 0) / this.integratedSamples.length - 10;
      const gated = this.integratedSamples.filter(v => v >= filterThreshold);
      this.integrated = gated.length > 0 ? gated.reduce((s, v) => s + v, 0) / gated.length : -Infinity;
    }

    const truePeak = blockPeak > 0 ? 20 * Math.log10(blockPeak) : -Infinity;
    if (truePeak > this.peak) this.peak = truePeak;

    return {
      momentary,
      shortTerm,
      integrated: this.integrated,
      truePeak: this.peak,
    };
  }

  resetIntegrated(): void {
    this.integrated = -Infinity;
    this.integratedSamples = [];
    this.peak = -Infinity;
  }

  disconnect(): void {
    try { this.analyser.disconnect(); } catch {}
  }
}

function meanLufs(blocks: number[]): number {
  const valid = blocks.filter(v => isFinite(v));
  if (!valid.length) return -Infinity;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

export function lufsBandColor(db: number, target = -16): string {
  if (!isFinite(db)) return '#3f3f46';
  if (db > target + 4) return '#ef4444';
  if (db > target + 1) return '#f59e0b';
  if (db > target - 3) return '#22c55e';
  if (db > -40) return '#06b6d4';
  return '#3f3f46';
}
