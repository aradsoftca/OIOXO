export interface MidiNote {
  midi: number;
  frequency: number;
  startTime: number;
  endTime: number;
  velocity: number;
  noteName: string;
}

export interface AudioToMidiOptions {
  windowSec?: number;
  hopSec?: number;
  threshold?: number;
  minFreq?: number;
  maxFreq?: number;
  minDuration?: number;
  silenceDb?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function freqToMidi(freq: number): number {
  if (freq <= 0) return -1;
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  if (midi < 0) return '';
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

export function yinPitchDetect(samples: Float32Array, sampleRate: number, threshold = 0.15): number {
  const bufferSize = samples.length;
  const yinBufferSize = Math.floor(bufferSize / 2);
  const yinBuffer = new Float32Array(yinBufferSize);

  for (let tau = 1; tau < yinBufferSize; tau++) {
    let sum = 0;
    for (let i = 0; i < yinBufferSize; i++) {
      const diff = samples[i] - samples[i + tau];
      sum += diff * diff;
    }
    yinBuffer[tau] = sum;
  }

  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < yinBufferSize; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] = runningSum > 0 ? (yinBuffer[tau] * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = 2; tau < yinBufferSize; tau++) {
    if (yinBuffer[tau] < threshold) {
      while (tau + 1 < yinBufferSize && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return 0;

  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < yinBufferSize - 1) {
    const s0 = yinBuffer[tauEstimate - 1];
    const s1 = yinBuffer[tauEstimate];
    const s2 = yinBuffer[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) {
      betterTau = tauEstimate + (s2 - s0) / denom;
    }
  }

  if (betterTau <= 0) return 0;
  return sampleRate / betterTau;
}

export async function audioBufferToMidi(buffer: AudioBuffer, opts: AudioToMidiOptions = {}): Promise<MidiNote[]> {
  const winSec = opts.windowSec ?? 0.05;
  const hopSec = opts.hopSec ?? 0.025;
  const threshold = opts.threshold ?? 0.15;
  const minFreq = opts.minFreq ?? 60;
  const maxFreq = opts.maxFreq ?? 1500;
  const minDuration = opts.minDuration ?? 0.08;
  const silenceDb = opts.silenceDb ?? -45;

  const sr = buffer.sampleRate;
  const channel = buffer.getChannelData(0);
  const winSize = Math.floor(winSec * sr);
  const hopSize = Math.floor(hopSec * sr);
  const detections: Array<{ time: number; freq: number; midi: number; energy: number }> = [];

  for (let s = 0; s + winSize <= channel.length; s += hopSize) {
    let sumSq = 0;
    for (let i = 0; i < winSize; i++) sumSq += channel[s + i] * channel[s + i];
    const rms = Math.sqrt(sumSq / winSize);
    const energyDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    if (energyDb < silenceDb) {
      detections.push({ time: s / sr, freq: 0, midi: -1, energy: energyDb });
      continue;
    }
    const slice = channel.slice(s, s + winSize);
    const freq = yinPitchDetect(slice, sr, threshold);
    if (freq < minFreq || freq > maxFreq) {
      detections.push({ time: s / sr, freq: 0, midi: -1, energy: energyDb });
      continue;
    }
    detections.push({ time: s / sr, freq, midi: freqToMidi(freq), energy: energyDb });
  }

  const notes: MidiNote[] = [];
  let currentNote: { midi: number; startTime: number; energy: number; freqAvg: number; count: number } | null = null;

  for (const d of detections) {
    if (d.midi === -1) {
      if (currentNote) {
        const duration = d.time - currentNote.startTime;
        if (duration >= minDuration) {
          notes.push({
            midi: currentNote.midi,
            frequency: currentNote.freqAvg / currentNote.count,
            startTime: currentNote.startTime,
            endTime: d.time,
            velocity: Math.max(20, Math.min(127, Math.round(127 + currentNote.energy / 0.7))),
            noteName: midiToNoteName(currentNote.midi),
          });
        }
        currentNote = null;
      }
      continue;
    }

    if (!currentNote) {
      currentNote = { midi: d.midi, startTime: d.time, energy: d.energy, freqAvg: d.freq, count: 1 };
    } else if (currentNote.midi === d.midi) {
      currentNote.energy = (currentNote.energy + d.energy) / 2;
      currentNote.freqAvg += d.freq;
      currentNote.count++;
    } else {
      const duration = d.time - currentNote.startTime;
      if (duration >= minDuration) {
        notes.push({
          midi: currentNote.midi,
          frequency: currentNote.freqAvg / currentNote.count,
          startTime: currentNote.startTime,
          endTime: d.time,
          velocity: Math.max(20, Math.min(127, Math.round(127 + currentNote.energy / 0.7))),
          noteName: midiToNoteName(currentNote.midi),
        });
      }
      currentNote = { midi: d.midi, startTime: d.time, energy: d.energy, freqAvg: d.freq, count: 1 };
    }
  }

  if (currentNote) {
    const finalTime = detections[detections.length - 1]?.time ?? 0;
    const duration = finalTime - currentNote.startTime;
    if (duration >= minDuration) {
      notes.push({
        midi: currentNote.midi,
        frequency: currentNote.freqAvg / currentNote.count,
        startTime: currentNote.startTime,
        endTime: finalTime,
        velocity: Math.max(20, Math.min(127, Math.round(127 + currentNote.energy / 0.7))),
        noteName: midiToNoteName(currentNote.midi),
      });
    }
  }

  return notes;
}

export function notesToMidiFile(notes: MidiNote[], ticksPerQuarter = 480, bpm = 120): Uint8Array {
  const ticksPerSec = (ticksPerQuarter * bpm) / 60;
  const events: Array<{ tick: number; data: number[] }> = [];

  events.push({ tick: 0, data: [0xFF, 0x51, 0x03, (60000000 / bpm) >> 16 & 0xFF, (60000000 / bpm) >> 8 & 0xFF, (60000000 / bpm) & 0xFF] });

  for (const note of notes) {
    const onTick = Math.round(note.startTime * ticksPerSec);
    const offTick = Math.round(note.endTime * ticksPerSec);
    events.push({ tick: onTick, data: [0x90, note.midi & 0x7F, note.velocity & 0x7F] });
    events.push({ tick: offTick, data: [0x80, note.midi & 0x7F, 0x40] });
  }

  events.sort((a, b) => a.tick - b.tick || (a.data[0] === 0x80 ? -1 : 1));

  const trackData: number[] = [];
  let lastTick = 0;
  for (const e of events) {
    const delta = e.tick - lastTick;
    lastTick = e.tick;
    writeVarLen(trackData, delta);
    trackData.push(...e.data);
  }
  trackData.push(0x00, 0xFF, 0x2F, 0x00);

  const header = [
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (ticksPerQuarter >> 8) & 0xFF, ticksPerQuarter & 0xFF,
  ];
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackData.length >> 24) & 0xFF, (trackData.length >> 16) & 0xFF, (trackData.length >> 8) & 0xFF, trackData.length & 0xFF,
  ];

  return new Uint8Array([...header, ...trackHeader, ...trackData]);
}

function writeVarLen(out: number[], value: number): void {
  let buffer = value & 0x7F;
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7F) | 0x80;
  }
  while (true) {
    out.push(buffer & 0xFF);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
}

export interface PianoStep {
  step: number;
  notes: number[];
}

export function midiNotesToSteps(notes: MidiNote[], stepsPerBar = 16, bpm = 120, bars = 4): PianoStep[] {
  const totalSteps = stepsPerBar * bars;
  const stepDur = 60 / bpm / 4;
  const grid: number[][] = Array.from({ length: totalSteps }, () => []);
  for (const note of notes) {
    const startStep = Math.floor(note.startTime / stepDur);
    if (startStep >= 0 && startStep < totalSteps) {
      grid[startStep].push(note.midi);
    }
  }
  return grid.map((notes, step) => ({ step, notes }));
}
