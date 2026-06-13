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
import { KITS, getActiveKit, setActiveKit, kitById, type Kit } from '@/lib/studios/music-kits';
import {
  StudioShell, StudioTopBar, StudioBody, StudioSidebar, StudioPanel,
  StudioButton, StudioSlider, StudioSelect,
  UndoStack, newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename, useShortcuts,
  suggestChordProgression,
  EffectsRack, type AppliedEffect, buildMasterChain,
  audioBufferToMidi, notesToMidiFile, midiToNoteName, type MidiNote,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
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

/** A variable-length piano-roll note (replaces the fixed 8-row step grid for
 *  synth instruments). `pitch` = semitones above the instrument's base octave;
 *  `start`/`length` in steps; `vel` 0..1. */
interface PianoNote { pitch: number; start: number; length: number; vel: number }

interface Pattern {
  id: string;
  name: string;
  steps: number;
  notes: Record<InstId, (number | null)[]>;
  /** Optional per-instrument piano-roll notes. When present for a synth
   *  instrument, playback/export use this instead of the `notes` step grid;
   *  drums always use `notes`. Backward-compatible (old patterns have none). */
  roll?: Partial<Record<InstId, PianoNote[]>>;
  /** Per-step velocity 0..1 (GarageBand "Step Settings" depth). Sparse:
   *  only allocated for instruments the user has shaped; a missing lane or a
   *  missing entry means full velocity (1). Backward-compatible. */
  vel?: Partial<Record<InstId, (number | null)[]>>;
  /** Per-step probability 0..1 that a lit step actually fires on a given loop
   *  pass — the killer "non-repetitive grooves" feature. Sparse like `vel`; a
   *  missing entry means certainty (1). Backward-compatible. */
  chance?: Partial<Record<InstId, (number | null)[]>>;
}

/** Read a sparse per-step value (velocity/chance) with a default. */
const lane01 = (m: Partial<Record<InstId, (number | null)[]>> | undefined, id: InstId, s: number, dflt: number): number => {
  const v = m?.[id]?.[s];
  return v == null ? dflt : v;
};

// Chromatic range for the piano roll, low→high (semitones above base octave).
const ROLL_RANGE = 24; // two octaves

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
  kitId?: string;
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
    kitId: 'classic',
  };
};

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  patterns: d.patterns.map(p => ({
    ...p,
    notes: Object.fromEntries(Object.entries(p.notes).map(([k, v]) => [k, v.slice()])) as any,
    roll: p.roll ? Object.fromEntries(Object.entries(p.roll).map(([k, v]) => [k, (v ?? []).map(n => ({ ...n }))])) as any : undefined,
    vel: p.vel ? Object.fromEntries(Object.entries(p.vel).map(([k, v]) => [k, (v ?? []).slice()])) as any : undefined,
    chance: p.chance ? Object.fromEntries(Object.entries(p.chance).map(([k, v]) => [k, (v ?? []).slice()])) as any : undefined,
  })),
  chain: [...d.chain],
  instruments: d.instruments.map(i => ({ ...i })),
});

const noteToFreq = (semi: number, key: string, octave: number): number => {
  const KEY_OFFSETS: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const offset = KEY_OFFSETS[key] ?? 0;
  const midi = 12 * (octave + 1) + offset + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
};

// All four scheduler primitives read their tone from the ACTIVE kit (passed in
// so the offline render can use a specific kit too), giving BandLab-style
// variety without sample assets. Defaults reproduce the original "Classic" kit.
function scheduleKick(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number, kit: Kit = getActiveKit()) {
  const v = kit.kick;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = v.wave ?? 'sine';
  osc.frequency.setValueAtTime(v.startHz ?? 150, t);
  osc.frequency.exponentialRampToValueAtTime(v.endHz ?? 40, t + (v.decay ?? 0.25) * 0.72);
  g.gain.setValueAtTime(vol * (v.gain ?? 1), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (v.decay ?? 0.25));
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + (v.decay ?? 0.25) + 0.05);
}
function scheduleSnare(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number, kit: Kit = getActiveKit()) {
  const v = kit.snare;
  const bufLen = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const pow = v.noiseDecayPow ?? 2.5;
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, pow);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = v.noiseHp ?? 1200;
  const g = ctx.createGain();
  g.gain.value = vol * (v.gain ?? 1);
  src.connect(hp).connect(g).connect(dest);
  src.start(t);

  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = v.wave ?? 'triangle';
  osc.frequency.setValueAtTime(v.startHz ?? 180, t);
  osc.frequency.exponentialRampToValueAtTime(v.endHz ?? 80, t + (v.decay ?? 0.12) * 0.83);
  og.gain.setValueAtTime(vol * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + (v.decay ?? 0.12));
  osc.connect(og).connect(dest);
  osc.start(t); osc.stop(t + (v.decay ?? 0.12) + 0.05);
}
function scheduleHihat(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number, open = false, kit: Kit = getActiveKit()) {
  const v = kit.hihat;
  const bufLen = Math.floor(ctx.sampleRate * (open ? 0.2 : 0.05));
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const pow = (v.noiseDecayPow ?? 3) * (open ? 0.5 : 1);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, pow);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = v.noiseHp ?? 7000;
  const g = ctx.createGain();
  g.gain.value = vol * 0.6 * (v.gain ?? 1);
  src.connect(hp).connect(g).connect(dest);
  src.start(t);
}
function scheduleClap(ctx: BaseAudioContext, dest: AudioNode, t: number, vol: number, kit: Kit = getActiveKit()) {
  for (let k = 0; k < 4; k++) scheduleHihat(ctx, dest, t + k * 0.01, vol * 0.6, false, kit);
}

function scheduleSynth(ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, vol: number, kind: 'bass' | 'lead' | 'pad' | 'pluck', dur: number, kit: Kit = getActiveKit()) {
  const v = kit[kind];
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = v.wave;
  filt.type = 'lowpass'; filt.frequency.value = v.cutoff; if (v.q) filt.Q.value = v.q;
  const shape = v.shape ?? 'sustain';
  if (shape === 'pad') {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + (v.attack ?? 0.15));
    g.gain.setTargetAtTime(0.001, t + dur - 0.1, 0.1);
  } else if (shape === 'pluck') {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.4, dur));
  } else { // sustain
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + (v.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  }
  osc.frequency.value = freq;
  osc.connect(filt).connect(g).connect(dest);
  osc.start(t); osc.stop(t + dur + 0.1);

  // Optional detuned second oscillator for width (synthwave/trap kits).
  if (v.detune) {
    const osc2 = ctx.createOscillator();
    osc2.type = v.wave; osc2.frequency.value = freq; osc2.detune.value = v.detune;
    osc2.connect(filt);
    osc2.start(t); osc2.stop(t + dur + 0.1);
  }
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

  // Step Settings mode (GarageBand depth): in 'notes' you toggle/paint steps;
  // in 'velocity' / 'chance' a lit step becomes a draggable value handle.
  const [stepMode, setStepMode] = React.useState<'notes' | 'velocity' | 'chance'>('notes');

  // ---- Autosave + crash recovery (weaponizes the rival's #1 complaint) -------
  const RECOVERY_KEY = 'xon:audio-music:recovery';
  const [recovery, setRecovery] = React.useState<{ name: string; at: number; state: DocState } | null>(null);

  // On mount, surface a recoverable session if a fresh (<7d) snapshot exists and
  // it isn't just the empty starter doc.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as { name: string; at: number; state: DocState };
      const age = Date.now() - (snap.at ?? 0);
      if (!snap.state || age > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem(RECOVERY_KEY); return; }
      if (snap.state.patterns?.some(p => !patternIsEmpty(p))) setRecovery(snap);
      else localStorage.removeItem(RECOVERY_KEY);
    } catch { /* ignore corrupt snapshot */ }
  }, []);

  // 2s-debounced silent snapshot of the working doc. Never blocks the UI and is
  // throttled so even rapid grid edits write at most once every 2s.
  const recoverySaved = React.useRef(true);
  React.useEffect(() => {
    recoverySaved.current = false;
    const h = window.setTimeout(() => {
      try {
        localStorage.setItem(RECOVERY_KEY, JSON.stringify({ name: doc.name, at: Date.now(), state: doc }));
        recoverySaved.current = true;
      } catch { /* quota / private mode — autosave is best-effort */ }
    }, 2000);
    return () => window.clearTimeout(h);
  }, [doc]);

  const restoreRecovery = () => {
    if (!recovery) return;
    setDoc(recovery.state);
    stack.current.reset(cloneDoc(recovery.state), 'restore');
    force();
    setRecovery(null);
    toastFor('Recovered your unsaved session');
  };
  const dismissRecovery = () => {
    setRecovery(null);
    try { localStorage.removeItem(RECOVERY_KEY); } catch { /* */ }
  };

  // ---- Clipboard paste: drop an audio file straight in (no file dialog) ------
  // Paste an audio clip copied from the OS / another tab and it goes straight
  // into the Audio→MIDI import path. Ignored while typing in a field so it never
  // hijacks Ctrl+V in the project-name input or a dialog.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === 'file' && it.type.startsWith('audio/')) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); void importAudioFile(f); return; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // importAudioFile is stable enough for this lifetime; re-binding each render
    // is unnecessary and would re-register the listener constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importAudioFile = async (file: File) => {
    setRecovery(null); // importing real audio supersedes the recover-last-session offer
    // Importing audio is FREE (like any DAW) — the credit is charged on Export.
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

  // A lightweight, reused AudioContext for one-shot UI feedback: every step
  // toggle plays an immediate "tick" of that instrument so tapping the grid
  // feels instrument-like (the signature micro-interaction). Kept separate from
  // the playback context so previews never disturb a running loop. Created
  // lazily inside a user gesture so it isn't blocked by autoplay policy.
  const previewCtxRef = React.useRef<AudioContext | null>(null);
  const previewStep = React.useCallback((instId: InstId, value: number) => {
    try {
      let ctx = previewCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        ctx = new Ctx();
        previewCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const d = docRef.current;
      const inst = d.instruments.find(i => i.id === instId);
      if (!inst || inst.muted) return;
      const g = ctx.createGain();
      g.gain.value = inst.volume;
      g.connect(ctx.destination);
      scheduleStep(ctx, g, ctx.currentTime + 0.001, inst, value, d.key, 60 / d.bpm / 4);
    } catch { /* preview is best-effort, never throw into the click path */ }
  }, []);

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
    if (previewCtxRef.current) { try { previewCtxRef.current.close(); } catch {} previewCtxRef.current = null; }
  }, []);

  const toastFor = (m: string) => { pushToast(m); };

  const activePattern = doc.patterns.find(p => p.id === doc.activePatternId) ?? doc.patterns[0];

  const setNote = (instId: InstId, step: number, value: number | null) => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    p.notes[instId][step] = value;
    if (value != null) previewStep(instId, value); // audible tick on place
    commit('step', next);
  };

  // Drag-to-paint / drag-to-erase across the grid (the signature gesture).
  // Reads the live doc from docRef (so it stays correct across a fast stroke
  // without re-binding) and commits with a coalesced 'paint' label, so a whole
  // sweep folds into one undo frame.
  const paintNote = React.useCallback((instId: InstId, step: number, value: number | null) => {
    const cur = docRef.current;
    const p0 = cur.patterns.find(x => x.id === cur.activePatternId);
    if (!p0 || p0.notes[instId][step] === value) return; // no-op = no churn
    const next = cloneDoc(cur);
    next.patterns.find(x => x.id === cur.activePatternId)!.notes[instId][step] = value;
    if (value != null) previewStep(instId, value);
    commit('paint', next);
  }, [commit, previewStep]);

  // Per-step velocity (drag up/down on a lit step in Velocity mode). Allocates
  // the sparse lane on first touch only, so old patterns stay unchanged.
  const setVel = React.useCallback((instId: InstId, step: number, vel: number) => {
    const cur = docRef.current;
    const next = cloneDoc(cur);
    const p = next.patterns.find(x => x.id === cur.activePatternId);
    if (!p) return;
    const lane = (p.vel ??= {})[instId] ?? Array.from({ length: p.steps }, () => null);
    lane[step] = Math.max(0.05, Math.min(1, vel));
    p.vel[instId] = lane;
    commit('velocity', next);
  }, [commit]);

  // Per-step chance/probability (drag up/down in Chance mode).
  const setChance = React.useCallback((instId: InstId, step: number, chance: number) => {
    const cur = docRef.current;
    const next = cloneDoc(cur);
    const p = next.patterns.find(x => x.id === cur.activePatternId);
    if (!p) return;
    const lane = (p.chance ??= {})[instId] ?? Array.from({ length: p.steps }, () => null);
    lane[step] = Math.max(0, Math.min(1, chance));
    p.chance[instId] = lane;
    commit('chance', next);
  }, [commit]);

  // Which synth instrument is open in the piano roll (null = grid view only).
  const [rollInst, setRollInst] = React.useState<InstId | null>(null);

  // Replace the active pattern's roll notes for one instrument.
  const setRoll = (instId: InstId, notes: PianoNote[]) => {
    const next = cloneDoc(doc);
    const p = next.patterns.find(x => x.id === doc.activePatternId);
    if (!p) return;
    p.roll = { ...(p.roll ?? {}), [instId]: notes };
    commit('piano roll', next);
  };

  // Keep the module-level active kit in sync with the doc (covers load/undo).
  React.useEffect(() => { setActiveKit(doc.kitId ?? 'classic'); }, [doc.kitId]);

  // Click-to-preview: play a short, recognizable 1-bar groove in the given kit
  // so the user can audition kits without committing — BandLab's loop-browser
  // affordance. Fully on-device; uses a throwaway AudioContext.
  const previewKit = React.useCallback((id: string) => {
    const kit = kitById(id);
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext; // eslint-disable-line @typescript-eslint/no-explicit-any
      const ctx = new Ctx();
      const t0 = ctx.currentTime + 0.04;
      const beat = 0.26; // ~115 BPM sixteenth-ish feel
      // Four-on-the-floor kick + offbeat hats + a couple of snare backbeats.
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * beat;
        if (i % 2 === 0) scheduleKick(ctx, ctx.destination, t, 1, kit);
        scheduleHihat(ctx, ctx.destination, t + beat / 2, 0.5, false, kit);
        if (i === 2 || i === 6) scheduleSnare(ctx, ctx.destination, t, 0.8, kit);
      }
      // A short bass riff so synth kits are audible too.
      const root = noteToFreq(0, doc.key, 2);
      [0, 3, 5, 3].forEach((semi, i) => {
        const f = noteToFreq(semi, doc.key, 2); void root;
        scheduleSynth(ctx, ctx.destination, t0 + i * beat * 2, f, 0.7, 'bass', beat * 1.8, kit);
      });
      // Close the context shortly after the preview ends.
      window.setTimeout(() => { try { ctx.close(); } catch { /* */ } }, 8 * beat * 1000 + 400);
    } catch { /* preview is best-effort */ }
  }, [doc.key]);

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
          const trackGain = c.createGain();
          trackGain.gain.value = inst.volume;
          const panner = c.createStereoPanner();
          panner.pan.value = inst.pan;
          trackGain.connect(panner).connect(master);
          const roll = pattern.roll?.[inst.id];
          if (roll && roll.length) {
            // Piano-roll path: fire every note that STARTS at this step, with
            // its own pitch (chromatic) + length-derived duration + velocity.
            for (const note of roll) {
              if (note.start !== stepIdx) continue;
              const f = noteToFreq(note.pitch, live.key, inst.octave);
              const g = c.createGain(); g.gain.value = note.vel; g.connect(trackGain);
              scheduleSynth(c, g, t, f, inst.volume, inst.id as any, note.length * stepDur);
            }
          } else {
            const n = pattern.notes[inst.id]?.[stepIdx];
            if (n == null) continue;
            // Per-step probability: a step with chance < 1 only fires on some
            // loop passes, so the groove evolves instead of looping robotically.
            const chance = lane01(pattern.chance, inst.id, stepIdx, 1);
            if (chance < 1 && Math.random() > chance) continue;
            // Per-step velocity scales the hit's loudness (ghost notes, accents).
            const vel = lane01(pattern.vel, inst.id, stepIdx, 1);
            const stepInst = vel === 1 ? inst : { ...inst, volume: inst.volume * vel };
            scheduleStep(c, trackGain, t, stepInst, n, live.key, stepDur);
          }
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

  // Render the song to an AudioBuffer through the full master chain. `include`
  // selects which instruments play — pass `() => true` for the full mix, or a
  // single-instrument predicate for a stem. Shared by exportNow + exportStems
  // so a stem is bit-identical to that track's contribution to the mix.
  const renderToBuffer = async (include: (instId: string) => boolean): Promise<AudioBuffer> => {
    const sr = 44100;
    const stepsTotal = doc.chain.reduce((s, pid) => s + (doc.patterns.find(p => p.id === pid)?.steps ?? 16), 0);
    const stepDur = 60 / doc.bpm / 4;
    const totalDur = stepsTotal * stepDur * (exportBars / Math.max(1, doc.chain.length)) + 1;
    const Ctx = (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext) as typeof OfflineAudioContext;
    const offline = new Ctx(2, Math.ceil(totalDur * sr), sr);
    const master = offline.createGain();
    master.gain.value = doc.master;
    const chain = buildMasterChain(offline, doc.masterEffects);
    master.connect(chain.input);
    chain.output.connect(offline.destination);
    const soloed = doc.instruments.some(i => i.solo);
    let tCur = 0;
    for (let rep = 0; rep < Math.max(1, Math.ceil(exportBars / doc.chain.length)); rep++) {
      for (const pid of doc.chain) {
        const pattern = doc.patterns.find(p => p.id === pid);
        if (!pattern) continue;
        for (let s = 0; s < pattern.steps; s++) {
          const swingOff = (s % 2 === 1) ? (doc.swing / 100) * stepDur * 0.5 : 0;
          const t = tCur + swingOff;
          for (const inst of doc.instruments) {
            if (inst.muted || (soloed && !inst.solo) || !include(inst.id)) continue;
            const trackGain = offline.createGain();
            trackGain.gain.value = inst.volume;
            const panner = offline.createStereoPanner();
            panner.pan.value = inst.pan;
            trackGain.connect(panner).connect(master);
            const roll = pattern.roll?.[inst.id];
            if (roll && roll.length) {
              for (const note of roll) {
                if (note.start !== s) continue;
                const f = noteToFreq(note.pitch, doc.key, inst.octave);
                const g = offline.createGain(); g.gain.value = note.vel; g.connect(trackGain);
                scheduleSynth(offline, g, t, f, inst.volume, inst.id as any, note.length * stepDur);
              }
            } else {
              const n = pattern.notes[inst.id]?.[s];
              if (n == null) continue;
              const chance = lane01(pattern.chance, inst.id, s, 1);
              if (chance < 1 && Math.random() > chance) continue;
              const vel = lane01(pattern.vel, inst.id, s, 1);
              const stepInst = vel === 1 ? inst : { ...inst, volume: inst.volume * vel };
              scheduleStep(offline, trackGain, t, stepInst, n, doc.key, stepDur);
            }
          }
          tCur += stepDur;
        }
      }
    }
    const rendered = await offline.startRendering();
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
        case 'speed':       if (Number(p.factor ?? 1) !== 1) normalized = audio.changeTempo(normalized, Number(p.factor)); break;
        case 'reverse':     normalized = audio.reverse(normalized); break;
        default: break;
      }
    }
    const peak = audio.peakAmplitude(normalized);
    if (peak > 1) normalized = audio.gain(normalized, 0.985 / peak);
    return normalized;
  };

  // Per-stem export — render each non-muted instrument on its own and zip the
  // files. BandLab/most browser DAWs CAN'T export stems, so this is a real
  // differentiator. Reuses renderToBuffer so each stem matches the mix exactly.
  const exportStems = async () => {
    const trackHit = checkLever(POLICY_KEY, 'tracks', doc.instruments.length, isPro);
    if (trackHit) { policyGate.fire(trackHit); return; }
    const fmtHit = checkFormat(POLICY_KEY, exportFmt, isPro);
    if (fmtHit) { policyGate.fire(fmtHit); return; }
    if (!(await guard())) return;
    const soloed = doc.instruments.some(i => i.solo);
    const stems = doc.instruments.filter(i => !i.muted && (!soloed || i.solo) && hasAnyNotes(i.id));
    if (!stems.length) { toastFor('No audible tracks to export'); return; }
    setBusy('Rendering stems…'); setProgress(0); setExportDialog(false);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < stems.length; i++) {
        const inst = stems[i];
        setBusy(`Rendering stem ${i + 1}/${stems.length}: ${inst.label}…`);
        setProgress(Math.round((i / stems.length) * 90));
        const buf = await renderToBuffer(id => id === inst.id);
        const blob = exportFmt === 'mp3' ? await audio.encodeMp3(buf, 192) : audio.encodeWav(buf);
        zip.file(`${safeFilename(inst.label)}.${exportFmt}`, blob);
      }
      setProgress(95);
      const out = await zip.generateAsync({ type: 'blob' });
      downloadBlob(out, `${safeFilename(doc.name)}-stems.zip`);
      toastFor(`Exported ${stems.length} stems`);
    } catch (e) {
      toastFor((e as Error).message || 'Stem export failed');
    } finally { setBusy(''); setProgress(0); }
  };

  // True if an instrument has any note in any pattern (so an empty track isn't
  // exported as a silent stem).
  const hasAnyNotes = (instId: InstId): boolean => doc.patterns.some(p =>
    (p.notes[instId] && p.notes[instId]!.some((n: number | null) => n != null)) || (p.roll?.[instId]?.length ?? 0) > 0);

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
      setProgress(40);
      const normalized = await renderToBuffer(() => true); // full mix
      setProgress(85);
      const blob = exportFmt === 'mp3' ? await audio.encodeMp3(normalized, 192) : audio.encodeWav(normalized);
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
        { combo: 'mod+d', description: 'Duplicate pattern' },
        { combo: 'mod+r', description: 'Randomize pattern' },
        { combo: '1', description: 'Select pattern bank 1–8' },
        { combo: 'delete', description: 'Clear pattern' },
      ],
    },
    {
      label: 'Step Settings',
      items: [
        { combo: 'q', description: 'Notes mode (tap / drag-paint)' },
        { combo: 'w', description: 'Velocity mode (drag step up/down)' },
        { combo: 'e', description: 'Chance mode (per-step probability)' },
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
    { combo: 'mod+d', handler: () => duplicatePattern(doc.activePatternId) },
    { combo: 'delete', handler: clearPattern },
    { combo: '+', handler: () => commit('bpm', { ...cloneDoc(doc), bpm: Math.min(240, doc.bpm + 5) }) },
    { combo: '-', handler: () => commit('bpm', { ...cloneDoc(doc), bpm: Math.max(40, doc.bpm - 5) }) },
    // Step Settings mode (keyboard-first power workflow vs mouse-heavy rivals).
    { combo: 'q', handler: () => setStepMode('notes') },
    { combo: 'w', handler: () => setStepMode('velocity') },
    { combo: 'e', handler: () => setStepMode('chance') },
    // Pattern banks 1–8: jump straight to a pattern slot (GarageBand/BandLab).
    ...Array.from({ length: 8 }, (_, i) => ({
      combo: String(i + 1),
      handler: () => {
        const p = docRef.current.patterns[i];
        if (p) commit('select', { ...cloneDoc(docRef.current), activePatternId: p.id });
      },
    })),
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
            {/* On mobile Export is pinned in the always-visible right cluster instead. */}
            <DesktopOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton></DesktopOnly>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
          </>
        }
        right={
          <>
            <StudioButton variant="ghost" size="sm" onClick={undo} disabled={!stack.current.canUndo()}><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={redo} disabled={!stack.current.canRedo()}><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            {/* Keyboard-shortcut help is meaningless on touch; its slot goes to Export. */}
            <DesktopOnly><HelpButton /></DesktopOnly>
            <MobileOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)} title="Export"><Download className="h-3.5 w-3.5" /></StudioButton></MobileOnly>
          </>
        }
      />

      {recovery && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <Save className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="flex-1">
            Recovered an unsaved session{recovery.name ? ` — “${recovery.name}”` : ''}
            <span className="ml-1 text-amber-200/70">({new Date(recovery.at).toLocaleString()})</span>
          </span>
          <button onClick={restoreRecovery} className="rounded bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-300">Restore</button>
          <button onClick={dismissRecovery} className="rounded px-2 py-1 text-[11px] text-amber-200/80 hover:bg-amber-400/10 hover:text-amber-100">Dismiss</button>
        </div>
      )}

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
        <div className="flex items-center gap-1.5" title="Sound kit — re-voices every instrument. Picking one previews it.">
          <span className="text-zinc-500">Kit</span>
          <select
            value={doc.kitId ?? 'classic'}
            onChange={e => { const id = e.target.value; setActiveKit(id); commit('kit', { ...cloneDoc(doc), kitId: id }); previewKit(id); }}
            className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-2 text-xs"
          >
            {KITS.map(k => <option key={k.id} value={k.id} title={k.blurb}>{k.label}</option>)}
          </select>
          <button onClick={() => previewKit(doc.kitId ?? 'classic')} title="Preview kit" className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"><Play className="h-3 w-3" /></button>
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
        <div className="flex items-center gap-1" title="Step Settings: edit notes, drag steps for velocity (accents/ghosts), or chance (probability) for non-repetitive grooves">
          <span className="text-zinc-500">Edit</span>
          {(['notes', 'velocity', 'chance'] as const).map(m => (
            <button
              key={m}
              onClick={() => setStepMode(m)}
              className={cn('rounded px-2 py-1 text-[11px] capitalize transition-colors', stepMode === m ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}
            >{m}</button>
          ))}
        </div>
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
              stepMode={stepMode}
              onSetNote={setNote}
              onPaintNote={paintNote}
              onSetVel={setVel}
              onSetChance={setChance}
              onUpdateInst={updateInstrument}
              rollInst={rollInst}
              onToggleRoll={(id) => setRollInst(r => r === id ? null : id)}
            />
            {rollInst && (() => {
              const inst = doc.instruments.find(i => i.id === rollInst);
              if (!inst) return null;
              return (
                <PianoRoll
                  inst={inst}
                  steps={activePattern.steps}
                  notes={activePattern.roll?.[rollInst] ?? []}
                  currentStep={playing ? currentStep : -1}
                  onChange={(notes) => setRoll(rollInst, notes)}
                />
              );
            })()}
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
                  { label: 'Tap or drag', description: 'Tap a cell to place a note, or drag across the row to paint a whole hi-hat roll in one stroke' },
                  { label: 'Velocity & Chance', description: 'Switch Edit mode and drag steps up/down for accents, ghost notes, and per-step probability so loops never sound robotic' },
                  { label: 'Press ?', description: 'See every keyboard shortcut' },
                ]}
              />
            </div>
          )}
        </div>

        <StudioSidebar width={260} label="Mixer" autoOpen={false}>
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
            <button type="button" onClick={() => void exportStems()}
              className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">
              Or export each track as a separate stem (.zip)
            </button>
            {!isPro && (
              <div className="flex items-center justify-between gap-2 rounded bg-white/5 p-2 text-[11px] text-zinc-400">
                <span>Free exports embed a small “Made with xonvert.com” tag in the file’s metadata.</span>
                <a href="/pricing" className="shrink-0 font-medium text-cyan-300 hover:underline">Upgrade to remove</a>
              </div>
            )}
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
  // A pattern that only has piano-roll notes is NOT empty (so it still recovers
  // and doesn't show the blank-canvas overlay).
  if (pattern.roll && Object.values(pattern.roll).some(notes => (notes?.length ?? 0) > 0)) return false;
  return true;
}

type StepMode = 'notes' | 'velocity' | 'chance';

function SequencerGrid({ pattern, instruments, currentStep, stepMode, onSetNote, onPaintNote, onSetVel, onSetChance, onUpdateInst, rollInst, onToggleRoll }: {
  pattern: Pattern;
  instruments: Instrument[];
  currentStep: number;
  stepMode: StepMode;
  onSetNote: (instId: InstId, step: number, value: number | null) => void;
  onPaintNote: (instId: InstId, step: number, value: number | null) => void;
  onSetVel: (instId: InstId, step: number, vel: number) => void;
  onSetChance: (instId: InstId, step: number, chance: number) => void;
  onUpdateInst: (id: InstId, mut: (i: Instrument) => void) => void;
  rollInst?: InstId | null;
  onToggleRoll?: (id: InstId) => void;
}) {
  // Drag-to-paint state. `mode` is decided by the FIRST cell hit on pointerdown:
  // hitting an empty cell paints ON, hitting a lit cell erases — then every cell
  // the pointer sweeps over follows that decision (the hi-hat-roll gesture).
  const paint = React.useRef<{ instId: InstId; value: number | null } | null>(null);
  const endPaint = React.useCallback(() => { paint.current = null; }, []);
  React.useEffect(() => {
    window.addEventListener('pointerup', endPaint);
    window.addEventListener('pointercancel', endPaint);
    return () => { window.removeEventListener('pointerup', endPaint); window.removeEventListener('pointercancel', endPaint); };
  }, [endPaint]);

  const noteEditable = stepMode === 'notes';

  return (
    <div className="space-y-1.5" style={{ touchAction: noteEditable ? 'none' : undefined }}>
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
            {inst.kind === 'synth' && onToggleRoll && (
              <button onClick={() => onToggleRoll(inst.id)} title="Piano roll (melodic notes)" className={cn('rounded px-1 text-[11px]', rollInst === inst.id ? 'bg-cyan-500 text-zinc-900' : 'text-zinc-500 hover:bg-white/5')}>🎹</button>
            )}
          </div>
          <div className="flex flex-1 gap-1">
            {(pattern.roll?.[inst.id]?.length) ? (
              <div className="flex-1 self-center rounded bg-white/5 px-2 py-1 text-[10px] text-zinc-400">Piano roll active ({pattern.roll![inst.id]!.length} notes) — click 🎹 to edit</div>
            ) : pattern.notes[inst.id].map((n, s) => {
              const filled = n != null;
              const isPlaying = s === currentStep;
              const beat4 = s % 4 === 0;
              return (
                <StepCell
                  key={s}
                  filled={filled}
                  value={n ?? 0}
                  vel={lane01(pattern.vel, inst.id, s, 1)}
                  chance={lane01(pattern.chance, inst.id, s, 1)}
                  mode={stepMode}
                  color={inst.color}
                  beat4={beat4}
                  playing={isPlaying}
                  synth={inst.kind === 'synth'}
                  // Notes mode: start a paint stroke whose direction is set by the
                  // first cell, then continue it as the pointer enters siblings.
                  onPaintStart={() => {
                    const target: number | null = filled ? null : 0;
                    paint.current = { instId: inst.id, value: target };
                    onPaintNote(inst.id, s, target);
                  }}
                  onPaintEnter={() => {
                    const p = paint.current;
                    if (p && p.instId === inst.id) onPaintNote(inst.id, s, p.value);
                  }}
                  onCyclePitch={() => { if (synthFilled(inst, filled)) onSetNote(inst.id, s, ((n ?? 0) + 1) % 8); }}
                  // Velocity / Chance mode: drag the lit step up/down to set value.
                  onSetVel={(v) => onSetVel(inst.id, s, v)}
                  onSetChance={(v) => onSetChance(inst.id, s, v)}
                />
              );
            })}
          </div>
        </div>
      ))}
      {stepMode !== 'notes' && (
        <div className="pl-32 pr-4 pt-1 text-[10px] text-zinc-500">
          Drag a lit step <span className="text-zinc-300">up/down</span> to set its {stepMode === 'velocity' ? 'velocity (accent ↔ ghost note)' : 'chance (how often it fires — for grooves that never loop the same)'}.
        </div>
      )}
    </div>
  );
}

const synthFilled = (inst: Instrument, filled: boolean) => inst.kind === 'synth' && filled;

function StepCell({ filled, value, vel, chance, mode, color, beat4, playing, synth, onPaintStart, onPaintEnter, onCyclePitch, onSetVel, onSetChance }: {
  filled: boolean; value: number; vel: number; chance: number; mode: StepMode;
  color: string; beat4: boolean; playing: boolean; synth: boolean;
  onPaintStart: () => void; onPaintEnter: () => void; onCyclePitch: () => void;
  onSetVel: (v: number) => void; onSetChance: (v: number) => void;
}) {
  const valueMode = mode !== 'notes';
  // The currently displayed level (velocity or chance) for the value-handle fill.
  const level = mode === 'velocity' ? vel : mode === 'chance' ? chance : 1;

  // Vertical-drag adjust for velocity / chance: capture the pointer, map vertical
  // travel across the cell height to a 0..1 value, live-update on every move.
  const drag = React.useRef<{ startY: number; startVal: number; h: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return; // right-click handled separately (pitch cycle)
    if (valueMode) {
      if (!filled) return; // only lit steps carry a value
      e.preventDefault();
      const h = (e.currentTarget as HTMLElement).getBoundingClientRect().height || 40;
      drag.current = { startY: e.clientY, startVal: level, h };
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
    } else {
      e.preventDefault();
      // Release the implicit touch pointer-capture so pointerenter fires on the
      // sibling cells the finger sweeps over — without this, drag-to-paint only
      // works with a mouse, not on touch.
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
      onPaintStart();
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dyFrac = (d.startY - e.clientY) / d.h; // up = positive
    const next = Math.max(0, Math.min(1, d.startVal + dyFrac));
    if (mode === 'velocity') onSetVel(Math.max(0.05, next));
    else if (mode === 'chance') onSetChance(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current) { try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ } drag.current = null; }
  };
  const onPointerEnter = () => { if (!valueMode) onPaintEnter(); };
  const onContext = (e: React.MouseEvent) => {
    if (!filled || !synth || valueMode) return;
    e.preventDefault();
    onCyclePitch();
  };

  const titleStr = valueMode
    ? (filled ? `${mode === 'velocity' ? 'Velocity' : 'Chance'} ${Math.round(level * 100)}% — drag up/down` : 'Empty step')
    : (synth && filled ? `Note ${value} (right-click to change pitch)` : undefined);

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onContextMenu={onContext}
      className={cn(
        'relative flex-1 aspect-square min-w-[28px] overflow-hidden rounded transition-[box-shadow,transform]',
        filled ? '' : beat4 ? 'bg-white/[.06] hover:bg-white/[.10]' : 'bg-white/[.03] hover:bg-white/[.06]',
        valueMode && filled && 'cursor-ns-resize',
        playing && 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#0a0b0e]',
        playing && filled && 'scale-105',
      )}
      style={{
        // In value mode a lit cell shows a bottom-up fill = its level; in notes
        // mode it's a solid block. Velocity also dims the solid block so accents
        // read at a glance without entering value mode.
        background: filled && !valueMode ? color : undefined,
        // In notes mode, dim a lit block by its velocity so accents/ghost notes
        // read at a glance without switching mode. Value modes draw their own fill.
        opacity: filled ? (valueMode ? 1 : 0.4 + 0.55 * vel) : 1,
      }}
      title={titleStr}
    >
      {filled && valueMode && (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 transition-[height]"
          style={{ height: `${Math.round(level * 100)}%`, background: color, opacity: 0.85 }}
        />
      )}
      {filled && valueMode && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 tabular-nums">{Math.round(level * 100)}</span>
      )}
      {synth && filled && !valueMode && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold text-black/80">{value}</span>}
    </button>
  );
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Piano roll for a synth instrument: ROLL_RANGE pitch rows × pattern steps,
 * variable-length notes. Click an empty cell to add a 1-step note; click a note
 * to delete it; click to the right of a note's start (same row) to extend it.
 */
function PianoRoll({ inst, steps, notes, currentStep, onChange }: {
  inst: Instrument; steps: number; notes: PianoNote[]; currentStep: number;
  onChange: (notes: PianoNote[]) => void;
}) {
  // High pitches on top.
  const rows = Array.from({ length: ROLL_RANGE + 1 }, (_, i) => ROLL_RANGE - i);
  const noteAt = (pitch: number, step: number) => notes.find(n => n.pitch === pitch && step >= n.start && step < n.start + n.length);
  const click = (pitch: number, step: number) => {
    const existing = noteAt(pitch, step);
    if (existing) {
      if (step > existing.start) {
        // extend/trim to this step
        onChange(notes.map(n => n === existing ? { ...n, length: step - existing.start + 1 } : n));
      } else {
        onChange(notes.filter(n => n !== existing)); // click the head = delete
      }
      return;
    }
    // is there a note on this row starting to the left we should extend?
    const left = notes.filter(n => n.pitch === pitch && n.start < step).sort((a, b) => b.start - a.start)[0];
    if (left && left.start + left.length === step) { onChange(notes.map(n => n === left ? { ...n, length: n.length + (step - (left.start + left.length) + 1) } : n)); return; }
    onChange([...notes, { pitch, start: step, length: 1, vel: 0.85 }]);
  };
  return (
    <div className="mt-2 rounded border border-white/10 bg-[#0a0b0e] p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-200" style={{ color: inst.color }}>🎹 {inst.label} — piano roll</span>
        <span className="text-[10px] text-zinc-500">click=add · click head=delete · click right=extend</span>
      </div>
      <div className="max-h-64 overflow-auto">
        {rows.map(pitch => {
          const isBlack = NOTE_NAMES[((pitch % 12) + 12) % 12].includes('#');
          return (
            <div key={pitch} className="flex items-stretch gap-px">
              <div className={cn('w-10 shrink-0 px-1 text-[9px] leading-5', isBlack ? 'bg-black/40 text-zinc-500' : 'bg-white/5 text-zinc-400')}>{NOTE_NAMES[((pitch % 12) + 12) % 12]}{Math.floor(pitch / 12) + inst.octave}</div>
              <div className="flex flex-1 gap-px">
                {Array.from({ length: steps }, (_, s) => {
                  const n = noteAt(pitch, s);
                  const head = n && n.start === s;
                  return (
                    <button key={s} onClick={() => click(pitch, s)}
                      className={cn('h-5 flex-1 min-w-[14px] rounded-[2px] transition-colors', s === currentStep && 'ring-1 ring-cyan-400', !n && (s % 4 === 0 ? 'bg-white/[.06] hover:bg-white/[.12]' : 'bg-white/[.02] hover:bg-white/[.08]'))}
                      style={{ background: n ? inst.color : undefined, opacity: n ? (head ? 0.95 : 0.7) : 1 }}
                      title={`${NOTE_NAMES[((pitch % 12) + 12) % 12]} step ${s + 1}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK' }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width="sm">{children}</SharedDialog>;
}
