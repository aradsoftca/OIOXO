/**
 * Procedural sound kits for Music Studio. Instead of shipping megabytes of
 * sample packs (which would violate the no-self-hosted-assets rule and bloat
 * the page), each kit is a small parameter set that re-voices the existing
 * Web-Audio synthesis — giving BandLab-style VARIETY (808 vs acoustic vs lo-fi
 * vs synthwave) at zero asset weight, fully on-device.
 *
 * The scheduler reads the ACTIVE kit's params; switching kits instantly
 * re-voices the whole song. Pure data + a module-level selection so we don't
 * have to thread a kit argument through every scheduler call site.
 */

export interface DrumVoice {
  /** Pitched-body start/end frequency (Hz) and decay seconds. */
  startHz?: number; endHz?: number; decay?: number;
  /** Oscillator wave for the body. */
  wave?: OscillatorType;
  /** Noise highpass cutoff (Hz) for snare/hat character; noise decay shaping. */
  noiseHp?: number; noiseDecayPow?: number;
  /** Overall level trim for this voice within the kit. */
  gain?: number;
}

export interface SynthVoice {
  wave: OscillatorType;
  /** Lowpass cutoff (Hz) + resonance. */
  cutoff: number; q?: number;
  /** Amp envelope (seconds). attack→sustainHold then release to silence. */
  attack?: number;
  /** 'pluck' = fast decay; 'sustain' = hold for the note; 'pad' = slow swell. */
  shape?: 'pluck' | 'sustain' | 'pad';
  /** Detuned second oscillator for width (cents). 0 = off. */
  detune?: number;
}

export interface Kit {
  id: string;
  label: string;
  blurb: string;
  kick: DrumVoice;
  snare: DrumVoice;
  hihat: DrumVoice;
  bass: SynthVoice;
  lead: SynthVoice;
  pad: SynthVoice;
  pluck: SynthVoice;
}

export const KITS: Kit[] = [
  {
    id: 'classic', label: 'Classic', blurb: 'Clean all-rounder — the default voices',
    kick: { startHz: 150, endHz: 40, decay: 0.25, wave: 'sine' },
    snare: { startHz: 180, endHz: 80, decay: 0.12, noiseHp: 1200, noiseDecayPow: 2.5, wave: 'triangle' },
    hihat: { noiseHp: 7000, noiseDecayPow: 3 },
    bass: { wave: 'sawtooth', cutoff: 800, q: 6, shape: 'sustain' },
    lead: { wave: 'square', cutoff: 2400, q: 4, shape: 'sustain' },
    pad: { wave: 'sawtooth', cutoff: 1600, shape: 'pad' },
    pluck: { wave: 'triangle', cutoff: 3200, shape: 'pluck' },
  },
  {
    id: 'trap808', label: '808 Trap', blurb: 'Deep booming 808s, crisp snappy hats',
    kick: { startHz: 120, endHz: 28, decay: 0.6, wave: 'sine', gain: 1.1 },
    snare: { startHz: 200, endHz: 90, decay: 0.1, noiseHp: 1600, noiseDecayPow: 3, wave: 'triangle' },
    hihat: { noiseHp: 9000, noiseDecayPow: 4 },
    bass: { wave: 'sine', cutoff: 400, q: 2, shape: 'sustain' },         // sub 808 bass
    lead: { wave: 'sawtooth', cutoff: 2800, q: 6, shape: 'pluck', detune: 8 },
    pad: { wave: 'sawtooth', cutoff: 1200, shape: 'pad', detune: 6 },
    pluck: { wave: 'square', cutoff: 3600, shape: 'pluck' },
  },
  {
    id: 'lofi', label: 'Lo-Fi', blurb: 'Soft dusty drums, mellow filtered synths',
    kick: { startHz: 110, endHz: 45, decay: 0.22, wave: 'sine', gain: 0.9 },
    snare: { startHz: 150, endHz: 70, decay: 0.14, noiseHp: 800, noiseDecayPow: 2, wave: 'sine' },
    hihat: { noiseHp: 5000, noiseDecayPow: 2.2, gain: 0.8 },
    bass: { wave: 'triangle', cutoff: 600, q: 3, shape: 'sustain' },
    lead: { wave: 'triangle', cutoff: 1400, q: 2, shape: 'sustain' },
    pad: { wave: 'sine', cutoff: 900, shape: 'pad' },
    pluck: { wave: 'sine', cutoff: 2000, shape: 'pluck' },
  },
  {
    id: 'acoustic', label: 'Acoustic', blurb: 'Punchy natural drums, warm tones',
    kick: { startHz: 170, endHz: 55, decay: 0.2, wave: 'triangle' },
    snare: { startHz: 220, endHz: 110, decay: 0.13, noiseHp: 2000, noiseDecayPow: 2.2, wave: 'triangle' },
    hihat: { noiseHp: 8000, noiseDecayPow: 3.5 },
    bass: { wave: 'triangle', cutoff: 900, q: 2, shape: 'sustain' },
    lead: { wave: 'sawtooth', cutoff: 2200, q: 2, shape: 'sustain' },
    pad: { wave: 'triangle', cutoff: 1800, shape: 'pad' },
    pluck: { wave: 'triangle', cutoff: 2800, shape: 'pluck' },
  },
  {
    id: 'synthwave', label: 'Synthwave', blurb: 'Gated reverb drums, wide neon synths',
    kick: { startHz: 160, endHz: 42, decay: 0.3, wave: 'sine' },
    snare: { startHz: 200, endHz: 95, decay: 0.22, noiseHp: 1400, noiseDecayPow: 1.6, wave: 'triangle' },
    hihat: { noiseHp: 7500, noiseDecayPow: 2.4 },
    bass: { wave: 'sawtooth', cutoff: 1000, q: 8, shape: 'sustain', detune: 10 },
    lead: { wave: 'sawtooth', cutoff: 3000, q: 5, shape: 'sustain', detune: 14 },
    pad: { wave: 'sawtooth', cutoff: 2000, shape: 'pad', detune: 18 },
    pluck: { wave: 'square', cutoff: 3400, shape: 'pluck', detune: 8 },
  },
];

let _active: Kit = KITS[0];
export function getActiveKit(): Kit { return _active; }
export function setActiveKit(id: string): Kit {
  _active = KITS.find(k => k.id === id) ?? KITS[0];
  return _active;
}
export function kitById(id: string): Kit { return KITS.find(k => k.id === id) ?? KITS[0]; }
