/**
 * Music Studio engine — generate a short original track procedurally and render
 * it with the Web Audio API. NO model, NO server, NO samples: chords, bassline,
 * melody and drums are composed from music theory and synthesized with
 * oscillators + noise, then rendered offline to an AudioBuffer you can export.
 *
 * "Make real music" in the loop/beat sense — instant, private, fully on-device.
 */

const NOTE_BASE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export const KEYS = Object.keys(NOTE_BASE);
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] } as const;
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Seeded RNG so "regenerate" is reproducible per seed.
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export interface Genre {
  id: string; name: string; bpm: number; scale: 'major' | 'minor';
  prog: number[];          // chord progression as scale-degree indices (0=I)
  drums: { kick: number[]; snare: number[]; hat: number[] }; // 16-step
  pad: OscillatorType; lead: OscillatorType; bassPat: number[]; // bass hits on 8th-steps (0..7)
  cutoff: number;          // pad/lead lowpass
}

export const GENRES: Genre[] = [
  { id: 'lofi', name: 'Lo-fi', bpm: 78, scale: 'minor', prog: [1, 4, 0, 5], drums: { kick: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] }, pad: 'triangle', lead: 'sine', bassPat: [0, 3, 4, 6], cutoff: 1800 },
  { id: 'house', name: 'House', bpm: 124, scale: 'minor', prog: [5, 3, 0, 4], drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] }, pad: 'sawtooth', lead: 'square', bassPat: [0, 2, 4, 6], cutoff: 2600 },
  { id: 'hiphop', name: 'Hip-hop', bpm: 90, scale: 'minor', prog: [0, 5, 1, 4], drums: { kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0] }, pad: 'triangle', lead: 'square', bassPat: [0, 4], cutoff: 2000 },
  { id: 'ambient', name: 'Ambient', bpm: 70, scale: 'major', prog: [0, 5, 3, 4], drums: { kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pad: 'sawtooth', lead: 'sine', bassPat: [0], cutoff: 1400 },
  { id: 'pop', name: 'Pop', bpm: 110, scale: 'major', prog: [0, 4, 5, 3], drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] }, pad: 'triangle', lead: 'square', bassPat: [0, 2, 4, 6], cutoff: 3000 },
  { id: 'synthwave', name: 'Synthwave', bpm: 100, scale: 'minor', prog: [5, 3, 4, 0], drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }, pad: 'sawtooth', lead: 'sawtooth', bassPat: [0, 1, 2, 3, 4, 5, 6, 7], cutoff: 2400 },
];

export interface SongOptions { genreId: string; key: string; bpm?: number; bars?: number; seed?: number }

interface Note { t: number; dur: number; freq: number; type: OscillatorType; gain: number; role: 'pad' | 'bass' | 'lead' }
interface Hit { t: number; kind: 'kick' | 'snare' | 'hat' }
export interface Song { bpm: number; bars: number; duration: number; cutoff: number; notes: Note[]; hits: Hit[] }

/** scale degree → MIDI note (root at given octave), wrapping octaves. */
function degMidi(rootMidi: number, scale: readonly number[], degree: number): number {
  const oct = Math.floor(degree / scale.length);
  return rootMidi + scale[((degree % scale.length) + scale.length) % scale.length] + oct * 12;
}

export function generateSong(opts: SongOptions): Song {
  const g = GENRES.find((x) => x.id === opts.genreId) ?? GENRES[0];
  const scale = SCALES[g.scale];
  const bpm = opts.bpm ?? g.bpm;
  const bars = opts.bars ?? 8;
  const rand = rng(opts.seed ?? 1);
  const beat = 60 / bpm;
  const barDur = beat * 4;
  const root = 48 + NOTE_BASE[opts.key in NOTE_BASE ? opts.key : 'C']; // C3 area
  const notes: Note[] = [];
  const hits: Hit[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barDur;
    const deg = g.prog[bar % g.prog.length];
    const triad = [deg, deg + 2, deg + 4];

    // Pad / chord — held across the bar, voiced up an octave.
    for (const d of triad) {
      notes.push({ t: t0, dur: barDur * 0.98, freq: midiToFreq(degMidi(root + 12, scale, d)), type: g.pad, gain: 0.12, role: 'pad' });
    }
    // Bass — root of the chord on the genre's 8th-note pattern.
    for (const step of g.bassPat) {
      notes.push({ t: t0 + step * (beat / 2), dur: beat / 2 * 0.9, freq: midiToFreq(degMidi(root - 12, scale, deg)), type: 'triangle', gain: 0.32, role: 'bass' });
    }
    // Lead melody — 4–8 notes from the scale around the chord tones (skip ambient).
    if (g.id !== 'ambient') {
      const count = 4 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i++) {
        const choice = triad[Math.floor(rand() * 3)] + (rand() > 0.6 ? (rand() > 0.5 ? 1 : -1) : 0);
        const st = t0 + (i / count) * barDur;
        notes.push({ t: st, dur: (barDur / count) * 0.85, freq: midiToFreq(degMidi(root + 24, scale, choice)), type: g.lead, gain: 0.14, role: 'lead' });
      }
    }
    // Drums — 16-step grid.
    for (let s = 0; s < 16; s++) {
      const st = t0 + s * (beat / 4);
      if (g.drums.kick[s]) hits.push({ t: st, kind: 'kick' });
      if (g.drums.snare[s]) hits.push({ t: st, kind: 'snare' });
      if (g.drums.hat[s]) hits.push({ t: st, kind: 'hat' });
    }
  }

  return { bpm, bars, duration: bars * barDur + 0.5, cutoff: g.cutoff, notes, hits };
}

/** Render a Song to a stereo AudioBuffer entirely offline. */
export async function renderSong(song: Song, sampleRate = 44100): Promise<AudioBuffer> {
  const oac = new OfflineAudioContext(2, Math.ceil(song.duration * sampleRate), sampleRate);
  const master = oac.createGain(); master.gain.value = 0.9;
  const comp = oac.createDynamicsCompressor();
  master.connect(comp).connect(oac.destination);

  // gentle reverb tail via a synthetic impulse
  const rev = oac.createConvolver();
  const irLen = Math.floor(sampleRate * 1.2);
  const ir = oac.createBuffer(2, irLen, sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.5); }
  rev.buffer = ir;
  const revGain = oac.createGain(); revGain.gain.value = 0.18; rev.connect(revGain).connect(master);

  for (const n of song.notes) {
    const osc = oac.createOscillator(); osc.type = n.type; osc.frequency.value = n.freq;
    if (n.role === 'lead' || n.role === 'pad') { const det = oac.createOscillator(); det.type = n.type; det.frequency.value = n.freq * 1.005; const dg = oac.createGain(); dg.gain.value = n.gain * 0.5; det.connect(dg); routeNote(oac, dg, n, song.cutoff, master, revGain); det.start(n.t); det.stop(n.t + n.dur + 0.05); }
    const g = oac.createGain();
    const atk = n.role === 'pad' ? 0.08 : 0.005, rel = n.role === 'pad' ? 0.4 : 0.12;
    g.gain.setValueAtTime(0.0001, n.t);
    g.gain.linearRampToValueAtTime(n.gain, n.t + atk);
    g.gain.setValueAtTime(n.gain, n.t + n.dur - rel);
    g.gain.exponentialRampToValueAtTime(0.0001, n.t + n.dur);
    osc.connect(g); routeNote(oac, g, n, song.cutoff, master, revGain);
    osc.start(n.t); osc.stop(n.t + n.dur + 0.05);
  }

  for (const h of song.hits) drum(oac, h, master);

  return oac.startRendering();
}

function routeNote(oac: OfflineAudioContext, src: AudioNode, n: Note, cutoff: number, master: GainNode, rev: GainNode) {
  if (n.role === 'bass') { src.connect(master); return; }
  const lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
  src.connect(lp); lp.connect(master);
  if (n.role === 'pad') lp.connect(rev);
}

function drum(oac: OfflineAudioContext, h: Hit, master: GainNode) {
  const t = h.t;
  if (h.kind === 'kick') {
    const o = oac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const g = oac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.3);
  } else {
    const len = h.kind === 'snare' ? 0.2 : 0.05;
    const buf = oac.createBuffer(1, Math.ceil(oac.sampleRate * len), oac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = oac.createBufferSource(); src.buffer = buf;
    const f = oac.createBiquadFilter(); f.type = h.kind === 'snare' ? 'bandpass' : 'highpass'; f.frequency.value = h.kind === 'snare' ? 1800 : 8000;
    const g = oac.createGain(); g.gain.setValueAtTime(h.kind === 'snare' ? 0.5 : 0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + len);
  }
}
