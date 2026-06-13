// Shared audio-effects model + Web Audio graph builder for the Video Studio (and
// reusable by Voice/Music). ONE source of truth so the export mixdown
// (engines/video/compositor.ts mixAudio via OfflineAudioContext) and live preview
// (a realtime AudioContext) apply IDENTICAL processing. Rival bar: CapCut/Premiere
// expose EQ, reverb, filters, compression, pitch — this gives a real effects rack.

export type AudioEffectType =
  | 'eq' | 'lowpass' | 'highpass' | 'reverb' | 'compressor' | 'pitch' | 'echo';

export interface AudioEffect {
  type: AudioEffectType;
  enabled: boolean;
  /** Effect-specific params, all optional with sane defaults below. */
  // eq
  low?: number;   // dB -24..24
  mid?: number;   // dB
  high?: number;  // dB
  // lowpass/highpass
  freq?: number;  // Hz
  q?: number;
  // reverb / echo
  amount?: number;   // 0..1 wet
  time?: number;     // seconds (echo delay / reverb tail)
  feedback?: number; // 0..0.9 (echo)
  // compressor
  threshold?: number; // dB
  ratio?: number;
  knee?: number;      // dB (soft-knee width)
  attack?: number;    // ms
  release?: number;   // ms
  makeup?: number;    // dB
  // pitch (semitones, via playbackRate-style detune on a wrapper — applied upstream)
  semitones?: number;
}

export const AUDIO_EFFECT_DEFAULTS: Record<AudioEffectType, Partial<AudioEffect>> = {
  eq:         { low: 0, mid: 0, high: 0 },
  lowpass:    { freq: 8000, q: 1 },
  highpass:   { freq: 120, q: 1 },
  reverb:     { amount: 0.3, time: 1.5 },
  compressor: { threshold: -24, ratio: 4 },
  pitch:      { semitones: 0 },
  echo:       { time: 0.25, feedback: 0.3, amount: 0.35 },
};

export const AUDIO_EFFECT_LABELS: Record<AudioEffectType, string> = {
  eq: '3-band EQ', lowpass: 'Low-pass', highpass: 'High-pass',
  reverb: 'Reverb', compressor: 'Compressor', pitch: 'Pitch', echo: 'Echo',
};

// Minimal AudioContext surface so this works in both realtime + Offline contexts.
type AnyCtx = BaseAudioContext;

function makeImpulse(ctx: AnyCtx, seconds: number, decay = 2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const imp = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = imp.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return imp;
}

/**
 * Build the effect chain for one clip. Returns { input, output } AudioNodes; the
 * caller connects its source to `input` and `output` to the gain/destination.
 * `pitchSemitones` is returned separately because pitch is applied as detune on
 * the upstream BufferSource, not as an inline node.
 */
export function buildAudioChain(ctx: AnyCtx, effects: AudioEffect[] | undefined): {
  input: AudioNode; output: AudioNode; pitchSemitones: number;
} {
  const passthrough = ctx.createGain();
  if (!effects || !effects.length) return { input: passthrough, output: passthrough, pitchSemitones: 0 };

  let head: AudioNode = passthrough;
  let pitchSemitones = 0;

  for (const fx of effects) {
    if (!fx.enabled) continue;
    const d = { ...AUDIO_EFFECT_DEFAULTS[fx.type], ...fx };
    switch (fx.type) {
      case 'eq': {
        const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 200; lo.gain.value = d.low ?? 0;
        const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1; mid.gain.value = d.mid ?? 0;
        const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4000; hi.gain.value = d.high ?? 0;
        head.connect(lo); lo.connect(mid); mid.connect(hi); head = hi;
        break;
      }
      case 'lowpass': case 'highpass': {
        const f = ctx.createBiquadFilter(); f.type = fx.type; f.frequency.value = d.freq ?? 1000; f.Q.value = d.q ?? 1;
        head.connect(f); head = f;
        break;
      }
      case 'compressor': {
        // Fully parametric (Audition-grade): honour attack/release/knee + a
        // post makeup-gain, instead of hardcoding them. Params arrive in the
        // UI's units (attack/release in ms, makeup in dB) → convert here.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = d.threshold ?? -24;
        comp.ratio.value = d.ratio ?? 4;
        comp.knee.value = d.knee ?? 30;
        comp.attack.value = (d.attack != null ? d.attack / 1000 : 0.003);
        comp.release.value = (d.release != null ? d.release / 1000 : 0.25);
        head.connect(comp); head = comp;
        if (d.makeup) { const g = ctx.createGain(); g.gain.value = Math.pow(10, d.makeup / 20); head.connect(g); head = g; }
        break;
      }
      case 'reverb': {
        const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx, d.time ?? 1.5);
        const wet = ctx.createGain(); wet.gain.value = d.amount ?? 0.3;
        const dry = ctx.createGain(); dry.gain.value = 1 - (d.amount ?? 0.3) * 0.5;
        const merge = ctx.createGain();
        head.connect(dry); dry.connect(merge);
        head.connect(conv); conv.connect(wet); wet.connect(merge);
        head = merge;
        break;
      }
      case 'echo': {
        const delay = ctx.createDelay(5); delay.delayTime.value = d.time ?? 0.25;
        const fb = ctx.createGain(); fb.gain.value = Math.min(0.9, d.feedback ?? 0.3);
        const wet = ctx.createGain(); wet.gain.value = d.amount ?? 0.35;
        const merge = ctx.createGain();
        head.connect(merge);
        head.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(merge);
        head = merge;
        break;
      }
      case 'pitch': {
        pitchSemitones += d.semitones ?? 0; // applied on the source's detune
        break;
      }
    }
  }
  return { input: passthrough, output: head, pitchSemitones };
}
