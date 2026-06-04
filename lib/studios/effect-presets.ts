export type EffectCategory = 'eq' | 'dynamics' | 'time' | 'modulation' | 'utility' | 'creative';

export interface EffectParam {
  id: string;
  label: string;
  kind: 'number' | 'boolean' | 'enum';
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean | string;
  suffix?: string;
  options?: string[];
}

export interface EffectDef {
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  params: EffectParam[];
}

export const AUDIO_EFFECTS: EffectDef[] = [
  {
    id: 'gain', name: 'Gain', category: 'utility', description: 'Volume in decibels',
    params: [{ id: 'db', label: 'Gain', kind: 'number', min: -24, max: 24, step: 0.5, default: 0, suffix: 'dB' }],
  },
  {
    id: 'normalize', name: 'Normalize', category: 'utility', description: 'Peak-normalize to target',
    params: [{ id: 'target', label: 'Target', kind: 'number', min: -12, max: 0, step: 0.5, default: -3, suffix: 'dB' }],
  },
  {
    id: 'bass-shelf', name: 'Bass Shelf', category: 'eq', description: 'Low-frequency shelving EQ',
    params: [
      { id: 'freq', label: 'Freq', kind: 'number', min: 50, max: 500, step: 10, default: 200, suffix: 'Hz' },
      { id: 'gain', label: 'Boost', kind: 'number', min: -12, max: 12, step: 0.5, default: 0, suffix: 'dB' },
    ],
  },
  {
    id: 'treble-shelf', name: 'Treble Shelf', category: 'eq', description: 'High-frequency shelving EQ',
    params: [
      { id: 'freq', label: 'Freq', kind: 'number', min: 2000, max: 12000, step: 100, default: 6000, suffix: 'Hz' },
      { id: 'gain', label: 'Boost', kind: 'number', min: -12, max: 12, step: 0.5, default: 0, suffix: 'dB' },
    ],
  },
  {
    id: '3band-eq', name: '3-Band EQ', category: 'eq', description: 'Bass / mid / treble',
    params: [
      { id: 'bass', label: 'Bass', kind: 'number', min: -12, max: 12, step: 0.5, default: 0, suffix: 'dB' },
      { id: 'mid', label: 'Mid', kind: 'number', min: -12, max: 12, step: 0.5, default: 0, suffix: 'dB' },
      { id: 'treble', label: 'Treble', kind: 'number', min: -12, max: 12, step: 0.5, default: 0, suffix: 'dB' },
    ],
  },
  {
    id: 'compressor', name: 'Compressor', category: 'dynamics', description: 'Reduces dynamic range',
    params: [
      { id: 'threshold', label: 'Threshold', kind: 'number', min: -40, max: 0, step: 0.5, default: -18, suffix: 'dB' },
      { id: 'ratio', label: 'Ratio', kind: 'number', min: 1, max: 20, step: 0.5, default: 3 },
      { id: 'attack', label: 'Attack', kind: 'number', min: 0, max: 100, step: 1, default: 5, suffix: 'ms' },
      { id: 'release', label: 'Release', kind: 'number', min: 10, max: 1000, step: 10, default: 100, suffix: 'ms' },
    ],
  },
  {
    id: 'limiter', name: 'Brickwall Limiter', category: 'dynamics', description: 'Hard ceiling, broadcast-safe',
    params: [{ id: 'ceiling', label: 'Ceiling', kind: 'number', min: -6, max: 0, step: 0.1, default: -1, suffix: 'dB' }],
  },
  {
    id: 'noise-gate', name: 'Noise Gate', category: 'dynamics', description: 'Mutes below threshold',
    params: [{ id: 'threshold', label: 'Threshold', kind: 'number', min: -60, max: -20, step: 1, default: -40, suffix: 'dB' }],
  },
  {
    id: 'reverb', name: 'Reverb', category: 'time', description: 'Spatial ambience',
    params: [
      { id: 'amount', label: 'Mix', kind: 'number', min: 0, max: 100, step: 1, default: 30, suffix: '%' },
      { id: 'size', label: 'Size', kind: 'enum', options: ['Room', 'Hall', 'Plate', 'Chamber'], default: 'Room' },
    ],
  },
  {
    id: 'delay', name: 'Echo / Delay', category: 'time', description: 'Repeats',
    params: [
      { id: 'time', label: 'Time', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 0.25, suffix: 's' },
      { id: 'feedback', label: 'Feedback', kind: 'number', min: 0, max: 90, step: 5, default: 30, suffix: '%' },
    ],
  },
  {
    id: 'fade-in', name: 'Fade In', category: 'utility', description: 'Smooth start',
    params: [{ id: 'duration', label: 'Duration', kind: 'number', min: 0.01, max: 10, step: 0.05, default: 0.5, suffix: 's' }],
  },
  {
    id: 'fade-out', name: 'Fade Out', category: 'utility', description: 'Smooth end',
    params: [{ id: 'duration', label: 'Duration', kind: 'number', min: 0.01, max: 10, step: 0.05, default: 1, suffix: 's' }],
  },
  {
    id: 'pitch-shift', name: 'Pitch Shift', category: 'modulation', description: 'Up/down by semitones (couples time)',
    params: [{ id: 'semitones', label: 'Semitones', kind: 'number', min: -12, max: 12, step: 1, default: 0, suffix: 'st' }],
  },
  {
    id: 'speed', name: 'Speed', category: 'modulation', description: 'Faster/slower (couples pitch)',
    params: [{ id: 'factor', label: 'Speed', kind: 'number', min: 0.25, max: 4, step: 0.05, default: 1, suffix: '×' }],
  },
  {
    id: 'reverse', name: 'Reverse', category: 'creative', description: 'Plays backwards',
    params: [],
  },
  {
    id: 'de-ess', name: 'De-Esser', category: 'dynamics', description: 'Tames sibilance',
    params: [{ id: 'amount', label: 'Amount', kind: 'number', min: 0, max: 100, step: 5, default: 60, suffix: '%' }],
  },
  {
    id: 'stereo-widener', name: 'Stereo Widener', category: 'creative', description: 'Wider stereo image',
    params: [{ id: 'width', label: 'Width', kind: 'number', min: 0, max: 200, step: 5, default: 100, suffix: '%' }],
  },
];

export interface AppliedEffect {
  uid: string;
  effectId: string;
  params: Record<string, number | boolean | string>;
  bypassed: boolean;
}

export function makeAppliedEffect(effectId: string): AppliedEffect {
  const def = AUDIO_EFFECTS.find(e => e.id === effectId);
  const params: Record<string, number | boolean | string> = {};
  for (const p of def?.params ?? []) params[p.id] = p.default;
  return {
    uid: `fx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    effectId,
    params,
    bypassed: false,
  };
}

export const EFFECT_CATEGORIES: { id: EffectCategory; label: string }[] = [
  { id: 'eq', label: 'EQ' },
  { id: 'dynamics', label: 'Dynamics' },
  { id: 'time', label: 'Time / Space' },
  { id: 'modulation', label: 'Modulation' },
  { id: 'creative', label: 'Creative' },
  { id: 'utility', label: 'Utility' },
];
