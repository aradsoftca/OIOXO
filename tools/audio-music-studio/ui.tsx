'use client';

import * as React from 'react';
import {
  Loader2, Download, Play, Pause, Music, Shuffle, Save, Undo2, Redo2,
  Volume2, VolumeX, Plus, Trash2, Copy, X, FileText, Wand2,
  SkipBack, ChevronUp, ChevronDown, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever, checkFormat } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'audio-music-studio';
import * as audio from '@/engines/audio';
import { GENRES, KEYS, generateSong, renderSong } from '@/engines/music/studio';
import {
  StudioShell, StudioTopBar, StudioBody, StudioSidebar, StudioPanel,
  StudioButton, StudioSlider, StudioSelect,
  UndoStack, newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename, useShortcuts,
  suggestChordProgression,
  EffectsRack, type AppliedEffect, buildMasterChain,
  audioBufferToMidi, notesToMidiFile, midiToNoteName, type MidiNote,
  HelpButton, useRegisterShortcuts,
  EmptyState, pushToast,
  SharedDialog,
} from '@/lib/studios';

type InstId = 'kick' | 'snare' | 'hihat' | 'clap' | 'bass' | 'lead' | 'pad' | 'pluck';

interface Instrument {
  id: InstId;
  label: string;
  kind: 'drum' | 'synth';
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  color: string;
  octave: number;
}

interface Pattern {
  id: string;
  name: string;
  steps: number;
  notes: Record<InstId, (number | null)[]>;
}

interface DocState {
  name: string;
  bpm: number;
  swing: number;
  key: string;
  master: number;
  patterns: Pattern[];
  chain: string[];
  activePatternId: string;
  instruments: Instrument[];
  loopChain: boolean;
  masterEffects?: AppliedEffect[];
}

const INSTRUMENTS: Instrument[] = [
  { id: 'kick', label: 'Kick', kind: 'drum', volume: 1.0, pan: 0, muted: false, solo: false, color: '#ef4444', octave: 0 },
  { id: 'snare', label: 'Snare', kind: 'drum', volume: 0.8, pan: 0, muted: false, solo: false, color: '#f59e0b', octave: 0 },
  { id: 'hihat', label: 'Hi-Hat', kind: 'drum', volume: 0.5, pan: 0, muted: false, solo: false, color: '#eab308', octave: 0 },
  { id: 'clap', label: 'Clap', kind: 'drum', volume: 0.6, pan: 0, muted: false, solo: false, color: '#84cc16', octave: 0 },
  { id: 'bass', label: 'Bass', kind: 'synth', volume: 0.9, pan: 0, muted: false, solo: false, color: '#22c55e', octave: 2 },
  { id: 'lead', label: 'Lead', kind: 'synth', volume: 0.7, pan: 0, muted: false, solo: false, color: '#22d3ee', octave: 5 },
  { id: 'pad', label: 'Pad', kind: 'synth', volume: 0.5, pan: 0, muted: false, solo: false, color: '#a855f7', octave: 4 },
  { id: 'pluck', label: 'Pluck', kind: 'synth', volume: 0.7, pan: 0, muted: false, solo: false, color: '#ec4899', octave: 5 },
];

const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROW_PITCHES = [0, 2, 4, 5, 7, 9, 11, 12];

let _id = 0;
const nid = () => `m${++_id}`;

const newPattern = (steps = 16): Pattern => {
  const notes: any = {};
  for (const inst of INSTRUMENTS) {
    notes[inst.id] = Array.from({ length: steps }, () => null);
  }
  return { id: nid(), name: `Pattern ${++_pn}`, steps, notes };
};
let _pn = 0;

const NEW_DOC = (): DocState => {
  const p = newPattern(16);
  return {
    name: 'Untitled',
    bpm: 120,
    swing: 0,
    key: 'C',
    master: 0.8,
    patterns: [p],
    chain: [p.id],
    activePatternId: p.id,
    instruments: INSTRUMENTS.map(i => ({ ...i })),
    loopChain: true,
  };
};

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  patterns: d.patterns.map(p => ({ ...p, notes: Object.fromEntries(Object.entries(p.notes).map(([k, v]) => [k, v.slice()])) as any })),
  chain: [...d.chain],
  instruments: d.instruments.map(i => ({ ...i })),
});

const noteToFreq = (semi: number, key: string, octave: number): number => {
  const KEY_OFFSETS: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const offset = KEY_OFFSETS[key] ?? 0;
  const midi = 12 * (octave + 1) + offset + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
};

function scheduleKick(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.3);
}
function scheduleSnare(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number) {
  const bufLen = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2.5);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1200;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(hp).connect(g).connect(dest);
  src.start(t);

  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
  og.gain.setValueAtTime(vol * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(og).connect(dest);
  osc.start(t); osc.stop(t + 0.15);
}
function scheduleHihat(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number, open = false) {
  const bufLen = Math.floor(ctx.sampleRate * (open ? 0.2 : 0.05));
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, open ? 1.5 : 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.value = vol * 0.6;
  src.connect(hp).connect(g).connect(dest);
  src.start(t);
}
function scheduleClap(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number) {
  for (let k = 0; k < 4; k++) scheduleHihat(ctx, dest, t + k * 0.01, vol * 0.6);
}

function scheduleSynth(ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, vol: number, kind: 'bass' | 'lead' | 'pad' | 'pluck', dur: number) {
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const g = ctx.createGain();
  if (kind === 'bass') {
    osc.type = 'sawtooth';
    filt.type = 'lowpass'; filt.frequency.value = 800; filt.Q.value = 6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  } else if (kind === 'lead') {
    osc.type = 'square';
    filt.type = 'lowpass'; filt.frequency.value = 2400; filt.Q.value = 4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  } else if (kind === 'pad') {
    osc.type = 'sawtooth';
    filt.type = 'lowpass'; filt.frequency.value = 1600;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.15);
    g.gain.setTargetAtTime(0.001, t + dur - 0.1, 0.1);
  } else {
    osc.type = 'triangle';
    filt.type = 'lowpass'; filt.frequency.value = 3200;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.4, dur));
  }
  osc.frequency.value = freq;
  osc.connect(filt).connect(g).connect(dest);
  osc.start(t); osc.stop(t + dur + 0.1);
}

function scheduleStep(ctx: BaseAudioContext, dest: AudioNode, t: number, inst: Instrument, note: number, key: string, stepDur: number) {
  const vol = inst.volume;
  if (inst.id === 'kick') scheduleKick(ctx, dest, t, vol);
  else if (inst.id === 'snare') scheduleSnare(ctx, dest, t, vol);
  else if (inst.id === 'hihat') scheduleHihat(ctx, dest, t, vol, note === 1);
  else if (inst.id === 'clap') scheduleClap(ctx, dest, t, vol);
  else if (inst.id === 'bass' || inst.id === 'lead' || inst.id === 'pad' || inst.id === 'pluck') {
    const semi = ROW_PITCHES[Math.max(0, Math.min(ROW_PITCHES.length - 1, note))];
    const f = noteToFreq(semi, key, inst.octave);
    scheduleSynth(ctx, dest, t, f, vol, inst.id, stepDur * 4);
  }
}

/**
 * Downward noise gate: samples below the threshold are smoothly attenuated.
 * Applied at export (it needs whole-signal level inspection, so it's an
 * offline-only effect — see OFFLINE_ONLY_EFFECTS). `thresholdDb` 0..-60.
 */
function gateBuffer(buf: AudioBuffer, thresholdDb: number): AudioBuffer {
  const thr = Math.pow(10, Math.min(0, thresholdDb) / 20);
  const out = audioCtxBufferLike(buf);
  const atkRel = Math.max(1, Math.floor(buf.sampleRate * 0.005)); // 5ms ramp
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    let env = 0;
    for (let i = 0; i < src.length; i++) {
      const target = Math.abs(src[i]) >= thr ? 1 : 0;
      env += (target - env) / atkRel;
      dst[i] = src[i] * env;
    }
  }
  return out;
}

function audioCtxBufferLike(buf: AudioBuffer): AudioBuffer {
  const Ctx = (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext) as typeof OfflineAudioContext;
  const tmp = new Ctx(buf.numberOfChannels, buf.length, buf.sampleRate);
  return tmp.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
}

export default function MusicStudioPro() {
  const { guard, gate } = useUsageGate('audio');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const stack = React.useRef(new UndoStack<DocState>(80));
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  const commit = React.useCallback((label: string, next: DocState) => {
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);

  const undo = () => { const p = stack.current.undo(cloneDoc(doc)); if (p) { setDoc(p); force(); } };
  const redo = () => { const p = stack.current.redo(); if (p) { setDoc(p); force(); } };

  const [playing, setPlaying] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(-1);
  const [busy, setBusy] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [exportDialog, setExportDialog] = React.useState(false);
  const [exportFmt, setExportFmt] = React.useState<'wav' | 'mp3'>('wav');
  const [exportBars, setExportBars] = React.useState(8);
  const [genDialog, setGenDialog] = React.useState(false);
  const [genGenre, setGenGenre] = React.useState(GENRES[0].id);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [audioToMidiDialog, setAudioToMidiDialog] = React.useState(false);
  const [detectedMidi, setDetectedMidi] = React.useState<MidiNote[]>([]);

  const importAudioFile = async (file: File) => {
    if (!(await guard())) return;
    setBusy('Analyzing audio…');
    setProgress(20);
    try {
      const ab = await file.arrayBuffer();
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctx();
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(ab);
      } finally {
        // Decode-only context — close so we don't burn one of the browser's
        // ~6 concurrent AudioContext slots on every "Analyze audio" run.
        try { await ctx.close(); } catch { /* */ }
      }
      setProgress(40);
      const notes = await audioBufferToMidi(buf, { threshold: 0.15, minDuration: 0.08 });
      setProgress(80);
      setDetectedMidi(notes);
      setAudioToMidiDialog(true);
      const uniquePitches = new Set(notes.map(n => n.midi));
      toastFor(`Detected ${notes.length} notes (${uniquePitches.size} pitches)`);
    } catch (e) {
      toastFor((e as Error).message || 'Could not analyze audio');
    } finally { setBusy(''); setProgress(0); }
  };

  const importMidiToPattern = (notes: MidiNote[]) => {
    if (!notes.length) { toastFor('No notes detected'); return; }
    const stepDur = 60 / doc.bpm / 4;
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    if (p.notes.lead) p.notes.lead = Array.from({ length: p.steps }, () => null);
    let minMidi = Math.min(...notes.map(n => n.midi));
    for (const note of notes) {
      const stepIdx = Math.round(note.startTime / stepDur);
      if (stepIdx >= 0 && stepIdx < p.steps) {
        const relMidi = note.midi - minMidi;
        p.notes.lead![stepIdx] = relMidi % 8;
      }
    }
    commit('import midi', next);
    setAudioToMidiDialog(false);
    toastFor(`Imported ${notes.length} notes into Lead lane`);
  };

  const downloadMidiFile = () => {
    if (!detectedMidi.length) return;
    const bytes = notesToMidiFile(detectedMidi, 480, doc.bpm);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
    downloadBlob(blob, `${safeFilename(doc.name)}-detected.mid`);
    toastFor('MIDI file downloaded');
  };

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const playStateRef = React.useRef<{ start: number; chainIdx: number; step: number; nextStepTime: number } | null>(null);
  const tickHandle = React.useRef<number | null>(null);

  // The playback setInterval reads BPM, swing, instruments, chain, and the
  // pattern grid LIVE from this ref. Previously the closure captured `doc` at
  // togglePlay time, so any in-flight BPM change, mute toggle, or note edit
  // had no effect until stop+start.
  const docRef = React.useRef(doc);
  React.useEffect(() => { docRef.current = doc; }, [doc]);

  // Tickhandle + AudioContext cleanup on unmount. Without this, navigating
  // away while playing left the interval running and the context open.
  React.useEffect(() => () => {
    if (tickHandle.current) { clearInterval(tickHandle.current); tickHandle.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
  }, []);

  const toastFor = (m: string) => { pushToast(m); };

  const activePattern = doc.patterns.find(p => p.id === doc.activePatternId) ?? doc.patterns[0];

  const setNote = (instId: InstId, step: number, value: number | null) => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    p.notes[instId][step] = value;
    commit('step', next);
  };

  const togglePlay = () => {
    if (playing) {
      const ctx = audioCtxRef.current;
      if (ctx) try { ctx.close(); } catch {}
      audioCtxRef.current = null;
      if (tickHandle.current) { clearInterval(tickHandle.current); tickHandle.current = null; }
      setPlaying(false);
      setCurrentStep(-1);
      return;
    }
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    // Safari (and increasingly strict Chrome) start AudioContext in suspended
    // state even when constructed in a click handler. Without explicit
    // resume(), scheduled instrument notes play silently.
    if (ctx.state === 'suspended') { void ctx.resume().catch(() => {}); }
    const master = ctx.createGain();
    master.gain.value = doc.master;
    // Mount the SAME master-effect chain the export uses, so reverb / EQ /
    // compressor / delay / widener are audible WHILE composing — preview now
    // matches the exported file (CCW-3). Offline-only effects (normalize /
    // fades / pitch / speed / reverse / gate) can't run in realtime and are
    // applied at export; they're flagged in the rack UI.
    const chain = buildMasterChain(ctx, docRef.current.masterEffects);
    master.connect(chain.input);
    chain.output.connect(ctx.destination);
    const start = ctx.currentTime + 0.1;
    playStateRef.current = { start, chainIdx: 0, step: 0, nextStepTime: start };
    setPlaying(true);
    tickHandle.current = window.setInterval(() => {
      const c = audioCtxRef.current;
      const state = playStateRef.current;
      if (!c || !state) {
        if (tickHandle.current) { clearInterval(tickHandle.current); tickHandle.current = null; }
        return;
      }
      const lookAhead = 0.2;
      // Read live from docRef so edits during playback take effect immediately.
      const live = docRef.current;
      const stepDur = 60 / live.bpm / 4;
      const soloed = live.instruments.some(i => i.solo);
      while (state.nextStepTime < c.currentTime + lookAhead) {
        const chainId = live.chain[state.chainIdx];
        const pattern = live.patterns.find(pp => pp.id === chainId);
        if (!pattern) { state.chainIdx = live.loopChain ? 0 : -1; if (state.chainIdx < 0) break; continue; }
        const swingOffset = (state.step % 2 === 1) ? (live.swing / 100) * stepDur * 0.5 : 0;
        const t = state.nextStepTime + swingOffset;
        const stepIdx = state.step;
        for (const inst of live.instruments) {
          if (inst.muted || (soloed && !inst.solo)) continue;
          const n = pattern.notes[inst.id]?.[stepIdx];
          if (n == null) continue;
          const trackGain = c.createGain();
          trackGain.gain.value = inst.volume;
          const panner = c.createStereoPanner();
          panner.pan.value = inst.pan;
          trackGain.connect(panner).connect(master);
          scheduleStep(c, trackGain, t, inst, n, live.key, stepDur);
        }
        setCurrentStep(stepIdx);
        state.step = (state.step + 1) % pattern.steps;
        if (state.step === 0) {
          state.chainIdx++;
          if (state.chainIdx >= live.chain.length) {
            if (live.loopChain) state.chainIdx = 0;
            else {
              if (tickHandle.current) { clearInterval(tickHandle.current); tickHandle.current = null; }
              try { c.close(); } catch {}
              audioCtxRef.current = null;
              playStateRef.current = null;
              setTimeout(() => { setPlaying(false); setCurrentStep(-1); }, 100);
              return;
            }
          }
        }
        state.nextStepTime += stepDur;
      }
    }, 50);
  };

  const clearPattern = () => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    for (const inst of INSTRUMENTS) p.notes[inst.id] = Array.from({ length: p.steps }, () => null);
    commit('clear', next);
  };

  const humanizePattern = () => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    for (const inst of INSTRUMENTS) {
      const lane = p.notes[inst.id];
      for (let s = 0; s < lane.length; s++) {
        if (lane[s] != null && Math.random() < 0.08) lane[s] = null;
        else if (lane[s] == null && Math.random() < 0.04 && s % 2 === 1) lane[s] = inst.kind === 'synth' ? Math.floor(Math.random() * 8) : 0;
      }
    }
    commit('humanize', next);
    toastFor('Humanized — added subtle variation');
  };

  const fillFromChords = () => {
    const progs = suggestChordProgression(doc.key, 'minor');
    if (!progs.length) return;
    const prog = progs[Math.floor(Math.random() * progs.length)];
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    if (p.notes.pad) p.notes.pad = Array.from({ length: p.steps }, () => null);
    if (p.notes.bass) p.notes.bass = Array.from({ length: p.steps }, () => null);
    const stepsPerChord = Math.floor(p.steps / prog.length);
    for (let i = 0; i < prog.length; i++) {
      const baseStep = i * stepsPerChord;
      if (p.notes.pad) p.notes.pad[baseStep] = i % 4;
      if (p.notes.bass) {
        p.notes.bass[baseStep] = i % 4;
        if (baseStep + stepsPerChord / 2 < p.steps) p.notes.bass[baseStep + Math.floor(stepsPerChord / 2)] = i % 4;
      }
    }
    commit('chord fill', next);
    toastFor(`Pad + bass filled from ${prog.join(' - ')}`);
  };

  const randomPattern = () => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    for (let s = 0; s < p.steps; s++) {
      p.notes.kick[s] = s % 4 === 0 ? 0 : null;
      p.notes.snare[s] = s % 8 === 4 ? 0 : null;
      p.notes.hihat[s] = s % 2 === 0 ? 0 : (Math.random() < 0.3 ? 0 : null);
      p.notes.clap[s] = null;
      p.notes.bass[s] = s % 4 === 0 ? [0, 5, 4, 0, 2, 5, 0, 7][Math.floor(s / 4) % 8] : null;
      p.notes.lead[s] = (Math.random() < 0.18 && s % 2 === 0) ? Math.floor(Math.random() * 8) : null;
      p.notes.pad[s] = (s === 0 || s === 8) ? 0 : null;
      p.notes.pluck[s] = (Math.random() < 0.1) ? Math.floor(Math.random() * 8) : null;
    }
    commit('randomize', next);
  };

  const generateFromGenre = async () => {
    if (!(await guard())) return;
    setBusy('Generating song…');
    setProgress(20);
    setGenDialog(false);
    try {
      const song = generateSong({ genreId: genGenre, key: doc.key, bpm: doc.bpm, bars: 8, seed: Math.floor(Math.random() * 99999) });
      const next = cloneDoc(doc);
      next.bpm = song.bpm;
      const p = next.patterns.find(x => x.id === doc.activePatternId);
      if (p) {
        for (const inst of INSTRUMENTS) p.notes[inst.id] = Array.from({ length: p.steps }, () => null);
        const stepDur = 60 / song.bpm / 4;
        for (const h of song.hits) {
          const s = Math.round(h.t / stepDur) % p.steps;
          if (h.kind === 'kick' && p.notes.kick) p.notes.kick[s] = 0;
          else if (h.kind === 'snare' && p.notes.snare) p.notes.snare[s] = 0;
          else if (h.kind === 'hat' && p.notes.hihat) p.notes.hihat[s] = 0;
        }
        for (const n of song.notes) {
          const s = Math.round(n.t / stepDur) % p.steps;
          const midi = Math.round(12 * Math.log2(Math.max(1, n.freq) / 440) + 69);
          if (n.role === 'bass' && p.notes.bass) p.notes.bass[s] = Math.abs((midi - 36) % 12) % 8;
          else if (n.role === 'lead' && p.notes.lead) p.notes.lead[s] = Math.abs((midi - 60) % 12) % 8;
          else if (n.role === 'pad' && p.notes.pad) p.notes.pad[s] = Math.abs((midi - 60) % 12) % 8;
        }
      }
      commit('generate', next);
      toastFor('Pattern filled from genre');
    } catch (e) {
      toastFor((e as Error).message || 'Generation failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const addPattern = () => {
    const next = cloneDoc(doc);
    const p = newPattern(16);
    next.patterns.push(p);
    next.chain.push(p.id);
    next.activePatternId = p.id;
    commit('add pattern', next);
  };

  const removePattern = (id: string) => {
    if (doc.patterns.length <= 1) return;
    const next = cloneDoc(doc);
    next.patterns = next.patterns.filter(p => p.id !== id);
    next.chain = next.chain.filter(p => p !== id);
    if (next.activePatternId === id) next.activePatternId = next.patterns[0].id;
    commit('remove pattern', next);
  };

  const duplicatePattern = (id: string) => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === id);
    if (!p) return;
    const copy: Pattern = { ...p, id: nid(), name: `${p.name} (copy)`, notes: Object.fromEntries(Object.entries(p.notes).map(([k, v]) => [k, v.slice()])) as any };
    next.patterns.push(copy);
    next.chain.push(copy.id);
    commit('dup pattern', next);
  };

  const updateInstrument = (id: InstId, mut: (i: Instrument) => void) => {
    const next = cloneDoc(doc);
    const inst = next.instruments.find(x => x.id === id);
    if (inst) mut(inst);
    commit('inst', next);
  };

  const exportNow = async () => {
    const trackHit = checkLever(POLICY_KEY, 'tracks', doc.instruments.length, isPro);
    if (trackHit) { policyGate.fire(trackHit); return; }
    // Total bars in the song ≈ chain length × (pattern steps / 16). Compute the
    // longest practical reading: chain length × max-pattern-steps / 16.
    const stepsPerBar = 16;
    const maxStepsInChain = doc.chain.reduce((sum, pid) => {
      const p = doc.patterns.find((pp) => pp.id === pid);
      return sum + (p?.steps ?? 0);
    }, 0);
    const songBars = Math.max(1, Math.ceil(maxStepsInChain / stepsPerBar));
    const barsHit = checkLever(POLICY_KEY, 'input-duration', songBars, isPro);
    if (barsHit) { policyGate.fire(barsHit); return; }
    const fmtHit = checkFormat(POLICY_KEY, exportFmt, isPro);
    if (fmtHit) { policyGate.fire(fmtHit); return; }
    if (!(await guard())) return;
    setBusy('Rendering…');
    setProgress(0);
    setExportDialog(false);
    try {
      const sr = 44100;
      const stepsTotal = doc.chain.reduce((s, pid) => s + (doc.patterns.find(p => p.id === pid)?.steps ?? 16), 0);
      const stepDur = 60 / doc.bpm / 4;
      const totalDur = stepsTotal * stepDur * (exportBars / Math.max(1, doc.chain.length)) + 1;
      const Ctx = (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext) as typeof OfflineAudioContext;
      const offline = new Ctx(2, Math.ceil(totalDur * sr), sr);
      const master = offline.createGain();
      master.gain.value = doc.master;
      // Render through the SAME master chain as live playback (CCW-3) so the
      // file matches what was heard. Node-expressible effects (gain/EQ/comp/
      // limiter/reverb/delay/widener/de-ess) are applied here; length-changing
      // / whole-signal effects are applied as a post-render pass below.
      const chain = buildMasterChain(offline, doc.masterEffects);
      master.connect(chain.input);
      chain.output.connect(offline.destination);
      const soloed = doc.instruments.some(i => i.solo);
      let tCur = 0;
      const chainCount = Math.max(1, Math.floor(exportBars / Math.max(1, doc.chain.length)));
      for (let rep = 0; rep < Math.max(1, Math.ceil(exportBars / doc.chain.length)); rep++) {
        for (const pid of doc.chain) {
          const pattern = doc.patterns.find(p => p.id === pid);
          if (!pattern) continue;
          for (let s = 0; s < pattern.steps; s++) {
            const swingOff = (s % 2 === 1) ? (doc.swing / 100) * stepDur * 0.5 : 0;
            const t = tCur + swingOff;
            for (const inst of doc.instruments) {
              if (inst.muted || (soloed && !inst.solo)) continue;
              const n = pattern.notes[inst.id]?.[s];
              if (n == null) continue;
              const trackGain = offline.createGain();
              trackGain.gain.value = inst.volume;
              const panner = offline.createStereoPanner();
              panner.pan.value = inst.pan;
              trackGain.connect(panner).connect(master);
              scheduleStep(offline, trackGain, t, inst, n, doc.key, stepDur);
            }
            tCur += stepDur;
          }
        }
      }
      setProgress(50);
      // The node chain (gain/EQ/compressor/limiter/reverb/delay/widener/de-ess)
      // is already baked into `rendered`. Now apply only the effects that resize
      // the buffer or need whole-signal analysis, IN RACK ORDER, so the result
      // is deterministic and matches the rack the user built.
      const rendered = await offline.startRendering();
      setProgress(80);
      let normalized = rendered;
      for (const e of doc.masterEffects ?? []) {
        if (e.bypassed) continue;
        const p = e.params;
        switch (e.effectId) {
          case 'normalize':   normalized = audio.normalize(normalized, Number(p.target ?? -3)); break;
          case 'noise-gate':  normalized = gateBuffer(normalized, Number(p.threshold ?? -40)); break;
          case 'fade-in':     normalized = audio.fadeIn(normalized, Number(p.duration ?? 0.5)); break;
          case 'fade-out':    normalized = audio.fadeOut(normalized, Number(p.duration ?? 1)); break;
          case 'pitch-shift': if (Number(p.semitones ?? 0)) normalized = audio.pitchShift(normalized, Number(p.semitones)); break;
          // Speed = pitch-preserving tempo change. The old export used
          // changeSpeed (couples pitch — chipmunk). changeTempo (WSOLA) keeps
          // pitch, matching what a "Speed" knob on a master bus should do.
          case 'speed':       if (Number(p.factor ?? 1) !== 1) normalized = audio.changeTempo(normalized, Number(p.factor)); break;
          case 'reverse':     normalized = audio.reverse(normalized); break;
          default: break; // handled by the node chain
        }
      }
      // Peak-safety: only attenuate if the mix would clip (never boost), so we
      // can't override the user's levels or introduce a difference the preview
      // didn't have — the realtime path is already hard-limited by the device.
      const peak = audio.peakAmplitude(normalized);
      if (peak > 1) normalized = audio.gain(normalized, 0.985 / peak);
      let blob: Blob;
      if (exportFmt === 'mp3') blob = await audio.encodeMp3(normalized, 192);
      else blob = audio.encodeWav(normalized);
      downloadBlob(blob, `${safeFilename(doc.name)}.${exportFmt}`);
      toastFor('Exported');
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const proj = newProject('audio-music', doc.name, doc);
      await saveProject(proj);
      toastFor('Saved');
    } finally { setBusy(''); }
  };

  const openSaved = async () => {
    const list = await listProjects('audio-music');
    setSavedList(list);
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<DocState>(id);
      if (!p) return;
      setDoc(p.state);
      stack.current.reset(cloneDoc(p.state), 'open');
      setOpenDialog(false);
    } finally { setBusy(''); }
  };

  useRegisterShortcuts([
    {
      label: 'Playback',
      items: [
        { combo: ' ', description: 'Play / Stop' },
      ],
    },
    {
      label: 'Patterns',
      items: [
        { combo: 'mod+n', description: 'Add pattern' },
        { combo: 'mod+r', description: 'Randomize pattern' },
        { combo: 'delete', description: 'Clear pattern' },
      ],
    },
    {
      label: 'Tempo',
      items: [
        { combo: '+', description: 'BPM +5' },
        { combo: '-', description: 'BPM -5' },
      ],
    },
    {
      label: 'File',
      items: [
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
        { combo: 'mod+o', description: 'Open library' },
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
      ],
    },
  ]);

  useShortcuts([
    { combo: ' ', handler: togglePlay },
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'mod+n', handler: addPattern },
    { combo: 'mod+r', handler: randomPattern },
    { combo: 'delete', handler: clearPattern },
    { combo: '+', handler: () => commit('bpm', { ...cloneDoc(doc), bpm: Math.min(240, doc.bpm + 5) }) },
    { combo: '-', handler: () => commit('bpm', { ...cloneDoc(doc), bpm: Math.max(40, doc.bpm - 5) }) },
  ]);

  React.useEffect(() => () => {
    if (audioCtxRef.current) try { audioCtxRef.current.close(); } catch {}
  }, []);

  return (
    <StudioShell>
      {policyGate.element}
      <StudioTopBar
        title="Music Studio Pro"
        left={
          <>
            <StudioButton variant="ghost" size="sm" onClick={() => setGenDialog(true)}><Wand2 className="h-3.5 w-3.5" /> Generate</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={randomPattern}><Shuffle className="h-3.5 w-3.5" /> Random</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={humanizePattern} title="Add subtle variation"><Sparkles className="h-3.5 w-3.5" /> Humanize</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={fillFromChords} title="Fill pad+bass from a chord progression in this key"><Sparkles className="h-3.5 w-3.5" /> Chord fill</StudioButton>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Sparkles className="h-3.5 w-3.5" /> Audio→MIDI
              <input type="file" accept="audio/*" className="hidden" onChange={e => e.target.files?.[0] && void importAudioFile(e.target.files[0])} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><FileText className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent}><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            <StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
          </>
        }
        right={
          <>
            <StudioButton variant="ghost" size="sm" onClick={undo} disabled={!stack.current.canUndo()}><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={redo} disabled={!stack.current.canRedo()}><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            <HelpButton />
          </>
        }
      />

      <div className="flex h-12 shrink-0 items-center gap-4 border-b border-white/5 bg-[#0f1115] px-3 text-xs">
        <button onClick={togglePlay} className="rounded bg-cyan-500 p-2 text-zinc-900 hover:bg-cyan-400">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">BPM</span>
          <input type="number" min={40} max={240} value={doc.bpm} onChange={e => commit('bpm', { ...cloneDoc(doc), bpm: Math.max(40, Math.min(240, +e.target.value)) })} className="h-7 w-16 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-right" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Key</span>
          <select value={doc.key} onChange={e => commit('key', { ...cloneDoc(doc), key: e.target.value })} className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-2 text-xs">
            {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Swing</span>
          <input type="range" min={0} max={70} value={doc.swing} onChange={e => commit('swing', { ...cloneDoc(doc), swing: +e.target.value })} className="w-20" />
          <span className="tabular-nums text-zinc-300">{doc.swing}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Master</span>
          <input type="range" min={0} max={100} value={Math.round(doc.master * 100)} onChange={e => commit('master', { ...cloneDoc(doc), master: +e.target.value / 100 })} className="w-20" />
        </div>
        <label className="flex items-center gap-1.5 text-zinc-300">
          <input type="checkbox" checked={doc.loopChain} onChange={e => commit('loop', { ...cloneDoc(doc), loopChain: e.target.checked })} /> Loop chain
        </label>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-zinc-500">Pattern</span>
          {doc.patterns.map(p => (
            <button key={p.id} onClick={() => commit('select', { ...cloneDoc(doc), activePatternId: p.id })} className={cn('rounded px-2 py-1 text-xs', doc.activePatternId === p.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{p.name}</button>
          ))}
          <button onClick={addPattern} className="rounded p-1 text-zinc-400 hover:bg-white/5"><Plus className="h-3 w-3" /></button>
          <button onClick={() => duplicatePattern(doc.activePatternId)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><Copy className="h-3 w-3" /></button>
          <button onClick={() => removePattern(doc.activePatternId)} disabled={doc.patterns.length <= 1} className="rounded p-1 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>

      <StudioBody>
        <div className="relative flex flex-1 min-w-0 flex-col bg-[#0a0b0e]">
          <div className="flex-1 overflow-auto p-3">
            <SequencerGrid
              pattern={activePattern}
              instruments={doc.instruments}
              currentStep={playing ? currentStep : -1}
              onSetNote={setNote}
              onUpdateInst={updateInstrument}
            />
          </div>
          {patternIsEmpty(activePattern) && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b0e]/95 backdrop-blur-sm">
              <EmptyState
                icon={<Music className="h-7 w-7" />}
                title="Compose your first track"
                description="Start from a genre template, roll the dice, or just tap the grid to place notes."
                actions={[
                  { label: 'Generate from genre', description: '8 styles — picks key, tempo, and pattern', icon: <Wand2 className="h-4 w-4" />, onClick: () => setGenDialog(true), primary: true },
                  { label: 'Randomize', description: 'Surprise me — drums + bass groove', icon: <Shuffle className="h-4 w-4" />, onClick: randomPattern },
                  { label: 'Open from Library', description: 'Continue an existing project', icon: <FileText className="h-4 w-4" />, onClick: openSaved },
                ]}
                hints={[
                  { label: 'Tap any cell', description: 'Click the grid to add a note; right-click synth notes to change pitch' },
                  { label: 'Master effect rack', description: 'EQ, compression, reverb, limiter on the master chain' },
                  { label: 'Press ?', description: 'See every keyboard shortcut' },
                ]}
              />
            </div>
          )}
        </div>

        <StudioSidebar width={260}>
          <EffectsRack
            value={doc.masterEffects ?? []}
            onChange={(next) => commit('master fx', { ...cloneDoc(doc), masterEffects: next })}
            title="Master chain"
          />
          <StudioPanel title="Mix">
            {doc.instruments.map(inst => (
              <div key={inst.id} className="mb-2 rounded border border-white/5 bg-white/[.02] p-2">
                <div className="flex items-center gap-1 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: inst.color }} />
                  <span className="flex-1 font-medium text-zinc-300">{inst.label}</span>
                  <button onClick={() => updateInstrument(inst.id, i => { i.muted = !i.muted; })} className={cn('rounded p-1', inst.muted ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-500 hover:bg-white/5')}>{inst.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
                  <button onClick={() => updateInstrument(inst.id, i => { i.solo = !i.solo; })} className={cn('rounded px-1.5 text-[10px] font-bold', inst.solo ? 'bg-yellow-500 text-zinc-900' : 'text-zinc-500 hover:bg-white/5')}>S</button>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={inst.volume} onChange={e => updateInstrument(inst.id, i => { i.volume = +e.target.value; })} className="mt-1 h-1 w-full" />
              </div>
            ))}
          </StudioPanel>
        </StudioSidebar>
      </StudioBody>

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/5 bg-[#0f1115] px-3 text-[11px] text-zinc-400">
        <span>{doc.patterns.length} patterns</span>
        <span>{doc.chain.length} in chain</span>
        <span className="ml-auto">{doc.bpm} BPM · {doc.key}</span>
      </div>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
          {progress > 0 && <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>}
      {gate}

      {exportDialog && (
        <Dialog title="Export Track" onCancel={() => setExportDialog(false)} onConfirm={exportNow} confirmLabel="Render">
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-zinc-400">Format</div>
              <div className="flex gap-1">
                {(['wav', 'mp3'] as const).map(f => (
                  <button key={f} onClick={() => setExportFmt(f)} className={cn('flex-1 rounded px-3 py-1.5 text-xs uppercase', exportFmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-zinc-400">Length (bars)</div>
              <input type="range" min={4} max={64} value={exportBars} onChange={e => setExportBars(+e.target.value)} className="w-full" />
              <div className="text-right text-xs text-zinc-300 tabular-nums">{exportBars} bars · ~{Math.round((exportBars * 4 * (60 / doc.bpm)))}s</div>
            </div>
          </div>
        </Dialog>
      )}
      {genDialog && (
        <Dialog title="Generate from genre" onCancel={() => setGenDialog(false)} onConfirm={generateFromGenre} confirmLabel="Generate">
          <div>
            <div className="mb-1 text-xs text-zinc-400">Genre</div>
            <div className="grid grid-cols-2 gap-1">
              {GENRES.map(g => (
                <button key={g.id} onClick={() => setGenGenre(g.id)} className={cn('rounded px-2 py-1.5 text-xs', genGenre === g.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{g.name}</button>
              ))}
            </div>
          </div>
          <div className="rounded bg-amber-500/10 p-2 text-xs text-amber-200">Fills the active pattern with a starting point in the current key. You can edit any step.</div>
        </Dialog>
      )}
      {audioToMidiDialog && (
        <Dialog title={`Detected ${detectedMidi.length} notes`} onCancel={() => setAudioToMidiDialog(false)} onConfirm={() => importMidiToPattern(detectedMidi)} confirmLabel="Import to Lead lane">
          <div className="space-y-3 text-xs">
            <div className="rounded bg-cyan-500/10 p-2 text-cyan-200">
              Pitches: {[...new Set(detectedMidi.map(n => midiToNoteName(n.midi)))].slice(0, 12).join(', ')}{[...new Set(detectedMidi.map(n => n.midi))].length > 12 ? '…' : ''}
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-white/10 bg-[#0a0b0e] p-2">
              <table className="w-full text-[10px] text-zinc-300">
                <thead className="text-zinc-500">
                  <tr><th className="text-left">Time</th><th className="text-left">Pitch</th><th className="text-left">Velocity</th></tr>
                </thead>
                <tbody>
                  {detectedMidi.slice(0, 32).map((n, i) => (
                    <tr key={i}><td>{n.startTime.toFixed(2)}s</td><td>{n.noteName}</td><td>{n.velocity}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={downloadMidiFile} className="w-full rounded bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10">Download as .mid file</button>
          </div>
        </Dialog>
      )}
      {openDialog && (
        <Dialog title="Library" onCancel={() => setOpenDialog(false)} onConfirm={() => setOpenDialog(false)} confirmLabel="Close">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {savedList.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects</div>}
            {savedList.map(p => (
              <button key={p.id} onClick={() => loadFromLibrary(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
                <Music className="h-3.5 w-3.5 text-zinc-400" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </StudioShell>
  );
}

function patternIsEmpty(pattern: Pattern): boolean {
  for (const lane of Object.values(pattern.notes)) {
    for (const n of lane) if (n != null) return false;
  }
  return true;
}

function SequencerGrid({ pattern, instruments, currentStep, onSetNote, onUpdateInst }: {
  pattern: Pattern;
  instruments: Instrument[];
  currentStep: number;
  onSetNote: (instId: InstId, step: number, value: number | null) => void;
  onUpdateInst: (id: InstId, mut: (i: Instrument) => void) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 pl-32 pr-4 text-[10px] text-zinc-500">
        {Array.from({ length: pattern.steps }, (_, i) => (
          <div key={i} className={cn('flex-1 text-center', i === currentStep && 'text-cyan-300 font-bold', i % 4 === 0 && 'text-zinc-300')}>{i + 1}</div>
        ))}
      </div>
      {instruments.map(inst => (
        <div key={inst.id} className="flex items-center gap-2">
          <div className="flex w-32 items-center gap-1.5">
            <button onClick={() => onUpdateInst(inst.id, i => { i.muted = !i.muted; })} className={cn('rounded p-1', inst.muted ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-500 hover:bg-white/5')}>{inst.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: inst.color }} />
            <span className="flex-1 text-xs font-medium text-zinc-200 truncate">{inst.label}</span>
            {inst.kind === 'synth' && (
              <div className="flex flex-col">
                <button onClick={() => onUpdateInst(inst.id, i => { i.octave = Math.min(7, i.octave + 1); })} className="text-zinc-500 hover:text-zinc-300"><ChevronUp className="h-2.5 w-2.5" /></button>
                <button onClick={() => onUpdateInst(inst.id, i => { i.octave = Math.max(0, i.octave - 1); })} className="text-zinc-500 hover:text-zinc-300"><ChevronDown className="h-2.5 w-2.5" /></button>
              </div>
            )}
            {inst.kind === 'synth' && <span className="text-[9px] text-zinc-500">O{inst.octave}</span>}
          </div>
          <div className="flex flex-1 gap-1">
            {pattern.notes[inst.id].map((n, s) => {
              const filled = n != null;
              const isPlaying = s === currentStep;
              const beat4 = s % 4 === 0;
              return (
                <StepCell
                  key={s}
                  filled={filled}
                  value={n ?? 0}
                  color={inst.color}
                  beat4={beat4}
                  playing={isPlaying}
                  synth={inst.kind === 'synth'}
                  onClick={() => onSetNote(inst.id, s, filled ? null : (inst.kind === 'synth' ? 0 : 0))}
                  onChange={(v) => onSetNote(inst.id, s, v)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepCell({ filled, value, color, beat4, playing, synth, onClick, onChange }: {
  filled: boolean; value: number; color: string; beat4: boolean; playing: boolean; synth: boolean;
  onClick: () => void; onChange: (v: number) => void;
}) {
  const onContext = (e: React.MouseEvent) => {
    if (!filled || !synth) return;
    e.preventDefault();
    onChange((value + 1) % 8);
  };
  return (
    <button
      onClick={onClick}
      onContextMenu={onContext}
      className={cn(
        'relative flex-1 aspect-square min-w-[28px] rounded transition-all',
        filled ? '' : beat4 ? 'bg-white/[.06] hover:bg-white/[.10]' : 'bg-white/[.03] hover:bg-white/[.06]',
        playing && 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#0a0b0e]',
      )}
      style={{ background: filled ? color : undefined, opacity: filled ? 0.85 : 1 }}
      title={synth && filled ? `Note ${value} (right-click to change)` : undefined}
    >
      {synth && filled && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-black/80">{value}</span>}
    </button>
  );
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK' }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width="sm">{children}</SharedDialog>;
}
