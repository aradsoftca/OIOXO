'use client';

import * as React from 'react';
import {
  Loader2, Download, Plus, Trash2, Copy, Scissors, Mic, Square, Play, Pause,
  Volume2, VolumeX, AudioLines, Upload, Save, Undo2, Redo2, ZoomIn, ZoomOut,
  Magnet, X, Sparkles, Type as TypeIcon, Wand2, SkipBack, SkipForward,
  Lock, Unlock, FileText, RotateCcw, ClipboardPaste,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever, checkFormat } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'audio-voice-studio';
import * as audio from '@/engines/audio';
import { speakToBuffer, VOICE_STYLES, TTS_LANGUAGES, type VoiceStyle } from '@/engines/tts/studio';
import {
  StudioShell, StudioTopBar, StudioBody, StudioSidebar, StudioPanel,
  StudioButton, StudioSlider, StudioSelect,
  UndoStack, newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename,
  useShortcuts,
  findSilences, broadcastChain, deEss as deEssBuffer,
  EffectsRack, AUDIO_EFFECTS, makeAppliedEffect, type AppliedEffect,
  LufsMeter, LufsMeterDisplay, SpectrogramView,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
  EmptyState, pushToast,
  SharedDialog,
} from '@/lib/studios';

interface Track {
  id: string; label: string; muted: boolean; solo: boolean; locked: boolean; volume: number; pan: number;
}

interface Clip {
  id: string;
  trackId: string;
  bufferKey: string;
  start: number;
  trimStart: number;
  trimEnd: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  pitch: number;
  speed: number;
  bassDb: number;
  trebleDb: number;
  reverb: number;
  echo: number;
  normalized: boolean;
  reversed: boolean;
  name: string;
  effects?: AppliedEffect[];
}

interface DocState {
  name: string;
  tracks: Track[];
  clips: Clip[];
  selectedId: string | null;
  playhead: number;
  master: { volume: number; normalize: boolean };
}

let _id = 0;
const nid = () => `v${++_id}`;

const NEW_DOC = (): DocState => ({
  name: 'Untitled',
  tracks: [
    { id: nid(), label: 'V1', muted: false, solo: false, locked: false, volume: 1, pan: 0 },
    { id: nid(), label: 'V2', muted: false, solo: false, locked: false, volume: 1, pan: 0 },
    { id: nid(), label: 'V3', muted: false, solo: false, locked: false, volume: 1, pan: 0 },
    { id: nid(), label: 'Music', muted: false, solo: false, locked: false, volume: 0.5, pan: 0 },
  ],
  clips: [],
  selectedId: null,
  playhead: 0,
  master: { volume: 1, normalize: false },
});

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  tracks: d.tracks.map(t => ({ ...t })),
  clips: d.clips.map(c => ({ ...c })),
  master: { ...d.master },
});

// ── Crash-recovery snapshot ──────────────────────────────────────────────
// Mirrors the image-studio recovery pattern: a 2s-debounced snapshot of the
// working doc to localStorage. Audio sample buffers can't be serialized (and
// would blow the quota), so we persist the full project STRUCTURE — track
// layout, every clip's geometry + FX + effect chain, transcripts — minus the
// raw PCM. On reload we re-hydrate arrangement, undo stack and playhead; the
// user re-drops the source files (their names are kept on each clip so the
// banner can say exactly what to re-import). Weaponizes Descript's #1
// complaint: "reopened months later as a raw recording, all cuts/effects gone".
const RECOVERY_KEY = 'xv:audio-voice-studio:recovery';
const RECOVERY_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

interface RecoverySnapshot {
  t: number;
  doc: DocState;
  sources: string[]; // distinct source file names referenced by clips
  transcripts: Record<string, { start: number; end: number; text: string }[]>;
}

const serializeRecovery = (
  doc: DocState,
  buffers: Map<string, { name: string }>,
  transcripts: Record<string, { start: number; end: number; text: string }[]>,
): RecoverySnapshot => {
  const sources = Array.from(new Set(doc.clips.map(c => buffers.get(c.bufferKey)?.name).filter((n): n is string => !!n)));
  return { t: Date.now(), doc: cloneDoc(doc), sources, transcripts };
};

const readRecovery = (): RecoverySnapshot | null => {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RecoverySnapshot;
    if (!snap || typeof snap.t !== 'number' || Date.now() - snap.t > RECOVERY_MAX_AGE) return null;
    if (!snap.doc?.clips?.length) return null; // nothing worth restoring
    return snap;
  } catch { return null; }
};

const clearRecovery = () => { try { localStorage.removeItem(RECOVERY_KEY); } catch { /* quota / private mode */ } };

const clipDuration = (c: Clip): number => Math.max(0.05, (c.trimEnd - c.trimStart) / Math.max(0.5, c.speed));
const clipEnd = (c: Clip) => c.start + clipDuration(c);

const fmtT = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

function computeWaveformPeaks(buf: AudioBuffer, count = 400): Float32Array {
  const ch = buf.getChannelData(0);
  const samplesPer = Math.max(1, Math.floor(ch.length / count));
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let max = 0;
    const start = i * samplesPer;
    const end = Math.min(ch.length, start + samplesPer);
    for (let j = start; j < end; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

const applyEffectChain = (buf: AudioBuffer, chain: AppliedEffect[]): AudioBuffer => {
  let out = buf;
  for (const e of chain) {
    if (e.bypassed) continue;
    const p = e.params;
    switch (e.effectId) {
      case 'gain':         out = audio.gain(out, dbToGain(Number(p.db ?? 0))); break;
      case 'normalize':    out = audio.normalize(out, Number(p.target ?? -3)); break;
      case 'bass-shelf':   out = audio.bassBoost(out, Number(p.gain ?? 0)); break;
      case 'treble-shelf': out = audio.trebleBoost(out, Number(p.gain ?? 0)); break;
      case '3band-eq':
        if (Number(p.bass ?? 0)) out = audio.bassBoost(out, Number(p.bass));
        if (Number(p.treble ?? 0)) out = audio.trebleBoost(out, Number(p.treble));
        break;
      case 'compressor':
        // Real compressor with attack/release — was a static peak-based gain cut.
        out = audio.compress(out, Number(p.threshold ?? -18), Number(p.ratio ?? 3), Number(p.attack ?? 5), Number(p.release ?? 100));
        break;
      case 'limiter':      out = audio.normalize(out, Number(p.ceiling ?? -1)); break;
      case 'noise-gate':   out = audio.gate(out, Number(p.threshold ?? -40)); break;
      case 'reverb':       out = audio.reverb(out, Math.min(0.7, Number(p.amount ?? 30) / 100)); break;
      case 'delay':        out = audio.echo(out, Number(p.time ?? 0.25), Math.min(0.7, Number(p.feedback ?? 30) / 100)); break;
      case 'fade-in':      out = audio.fadeIn(out, Number(p.duration ?? 0.5)); break;
      case 'fade-out':     out = audio.fadeOut(out, Number(p.duration ?? 1)); break;
      case 'pitch-shift':  if (Number(p.semitones ?? 0)) out = audio.pitchShift(out, Number(p.semitones)); break;
      // Speed = pitch-preserving tempo (there's a separate Pitch knob); was
      // changeSpeed which coupled pitch (chipmunk at 150%).
      case 'speed':        if (Number(p.factor ?? 1) !== 1) out = audio.changeTempo(out, Number(p.factor)); break;
      case 'reverse':      out = audio.reverse(out); break;
      case 'de-ess':       out = deEssBuffer(out, { freq: 6500, amount: Number(p.amount ?? 60) / 100 }); break;
      case 'stereo-widener': out = audio.stereoWidth(out, Number(p.width ?? 100) / 100); break;
    }
  }
  return out;
};

const applyChain = (b: AudioBuffer, c: Clip): AudioBuffer => {
  let out = audio.trim(b, c.trimStart, c.trimEnd);
  if (c.reversed) out = audio.reverse(out);
  // Speed and Pitch are SEPARATE clip controls, so Speed must preserve pitch
  // (changeTempo/WSOLA) — changeSpeed coupled them, making 1.5× a chipmunk.
  if (c.speed !== 1) out = audio.changeTempo(out, c.speed);
  if (c.pitch !== 0) out = audio.pitchShift(out, c.pitch);
  if (c.bassDb !== 0) out = audio.bassBoost(out, c.bassDb);
  if (c.trebleDb !== 0) out = audio.trebleBoost(out, c.trebleDb);
  if (c.echo > 0) out = audio.echo(out, 0.25, Math.max(0, Math.min(0.6, c.echo)));
  if (c.reverb > 0) out = audio.reverb(out, Math.max(0, Math.min(0.7, c.reverb)));
  if (c.gainDb !== 0) out = audio.gain(out, Math.pow(10, c.gainDb / 20));
  if (c.fadeIn > 0) out = audio.fadeIn(out, c.fadeIn);
  if (c.fadeOut > 0) out = audio.fadeOut(out, c.fadeOut);
  if (c.normalized) out = audio.normalize(out, -3);
  if (c.effects?.length) out = applyEffectChain(out, c.effects);
  return out;
};

export default function VoiceStudioPro() {
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

  const buffers = React.useRef<Map<string, { buffer: AudioBuffer; peaks: Float32Array; name: string }>>(new Map());
  const [tick, setTick] = React.useState(0);
  const [zoom, setZoom] = React.useState(80);
  const [snap, setSnap] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [toast, setToast] = React.useState('');
  const [playing, setPlaying] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordTime, setRecordTime] = React.useState(0);
  const [exportFmt, setExportFmt] = React.useState<'wav' | 'mp3'>('wav');
  const [exportDialog, setExportDialog] = React.useState(false);
  const [ttsDialog, setTtsDialog] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [ttsText, setTtsText] = React.useState('Hello, type your script here.');
  const [ttsLang, setTtsLang] = React.useState('en');
  const [ttsStyle, setTtsStyle] = React.useState<VoiceStyle>(VOICE_STYLES[0]);
  // On-device transcript per clip id (Whisper) → transcript panel + SRT export.
  const [transcripts, setTranscripts] = React.useState<Record<string, { start: number; end: number; text: string }[]>>({});
  // Descript-style word-level transcript: per-clip word timings (clip-local
  // seconds), for edit-audio-by-deleting-words. NEEDS BROWSER QA.
  const [words, setWords] = React.useState<Record<string, { text: string; start: number; end: number }[]>>({});
  // Crash-recovery banner — populated on mount if a fresh snapshot exists.
  const [recovery, setRecovery] = React.useState<RecoverySnapshot | null>(null);
  // Ripple mode: ON = delete/move closes the gap downstream across ALL tracks
  // in sync (Descript/Audacity-4 bar). A small toolbar toggle + Ctrl+Delete.
  const [ripple, setRipple] = React.useState(true);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recChunks = React.useRef<Blob[]>([]);
  const recStream = React.useRef<MediaStream | null>(null);
  const recTimer = React.useRef<number | null>(null);
  const playSources = React.useRef<AudioBufferSourceNode[]>([]);
  const playStartedAt = React.useRef(0);
  // Single AudioContext reused across all start/stop cycles. Browsers cap the
  // number of concurrent AudioContexts (~6 on Chrome). Without reuse, the
  // tool stopped producing sound after a few play→stop iterations.
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const playStartedFrom = React.useRef(0);
  const lufsMeterRef = React.useRef<LufsMeter | null>(null);

  // Close the shared AudioContext when the studio unmounts. Browsers cap
  // concurrent contexts (~6 on Chrome); without this, navigating between
  // audio tools several times eventually broke playback for the whole tab.
  // Also stop any in-progress recording/timer so an unmount during
  // recording doesn't leave a polling setInterval running.
  React.useEffect(() => () => {
    try { void audioCtxRef.current?.close(); } catch { /* already closed */ }
    audioCtxRef.current = null;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    try { recorderRef.current?.stop(); } catch { /* */ }
    recStream.current?.getTracks().forEach(t => { try { t.stop(); } catch { /* */ } });
  }, []);

  const toastFor = (m: string) => { pushToast(m); };

  // On mount, surface a recovery banner if a fresh (<7d) snapshot exists and
  // has real content. Don't auto-apply — the user opts in via Restore.
  React.useEffect(() => {
    const snap = readRecovery();
    if (snap) setRecovery(snap);
  }, []);

  // Continuous, invisible autosave — 2s-debounced snapshot of the working doc
  // to localStorage. Skip the empty initial doc so we never overwrite a real
  // recovery snapshot with nothing, and skip while a banner is still showing
  // (we haven't restored/dismissed yet — don't clobber it).
  React.useEffect(() => {
    if (recovery) return;
    if (!doc.clips.length) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(RECOVERY_KEY, JSON.stringify(serializeRecovery(doc, buffers.current, transcripts)));
      } catch { /* quota exceeded / private mode — autosave is best-effort */ }
    }, 2000);
    return () => window.clearTimeout(id);
  }, [doc, transcripts, recovery]);

  // Re-hydrate from a recovery snapshot: restore the arrangement, transcripts,
  // name and playhead, and reset the undo stack to this point. Source audio is
  // gone from memory, so clips that referenced files render as silent
  // placeholders until re-imported — the banner tells the user exactly which.
  const restoreSession = () => {
    if (!recovery) return;
    const restored = cloneDoc(recovery.doc);
    setDoc(restored);
    setTranscripts(recovery.transcripts || {});
    stack.current.reset(cloneDoc(restored), 'restore');
    setTick(t => t + 1);
    setRecovery(null);
    toastFor(recovery.sources.length ? `Session restored — re-import ${recovery.sources.length} audio file${recovery.sources.length > 1 ? 's' : ''}` : 'Session restored');
  };
  const dismissRecovery = () => { setRecovery(null); clearRecovery(); };

  const totalDuration = React.useMemo(() => {
    let max = 0;
    for (const c of doc.clips) max = Math.max(max, clipEnd(c));
    return Math.max(20, max + 5);
  }, [doc.clips, tick]);

  // Pick a track that doesn't already have a clip occupying the playhead. If
  // every track is busy at the playhead, fall back to the first (caller will
  // either appended to the end of that track). Lets imports/recordings/TTS
  // automatically layer onto V2, V3, Music as the user fills the timeline,
  // instead of all stacking on V1.
  const pickFreeTrackId = (next: DocState, atTime: number): string => {
    const free = next.tracks.find(t => !next.clips.some(c => c.trackId === t.id && atTime >= c.start && atTime < clipEnd(c)));
    return (free ?? next.tracks[0]).id;
  };

  const importFile = async (file: File) => {
    // Importing audio is FREE (like any DAW) — the credit is charged on Export
    // and on the heavy AI ops (denoise / stem-separation / transcribe).
    setBusy('Decoding…');
    try {
      const ab = await file.arrayBuffer();
      const buf = await audio.decode(ab);
      const peaks = computeWaveformPeaks(buf);
      const key = nid();
      buffers.current.set(key, { buffer: buf, peaks, name: file.name });
      const next = cloneDoc(doc);
      const trackId = pickFreeTrackId(next, next.playhead);
      const trackClips = next.clips.filter(c => c.trackId === trackId);
      const start = trackClips.length ? Math.max(...trackClips.map(clipEnd)) : next.playhead;
      const clip: Clip = {
        id: nid(), trackId, bufferKey: key, start, trimStart: 0, trimEnd: buf.duration,
        gainDb: 0, fadeIn: 0, fadeOut: 0, pitch: 0, speed: 1,
        bassDb: 0, trebleDb: 0, reverb: 0, echo: 0,
        normalized: false, reversed: false, name: file.name.replace(/\.[^.]+$/, ''),
      };
      next.clips.push(clip);
      next.selectedId = clip.id;
      commit('import', next);
      setTick(t => t + 1);
    } catch (e) {
      toastFor((e as Error).message || 'Could not decode file');
    } finally { setBusy(''); }
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) if (f.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|flac|aac|webm)$/i.test(f.name)) await importFile(f);
  };

  // Keep a stable ref so the global paste listener (mounted once) always calls
  // the latest importFiles closure without re-binding on every doc change.
  const importFilesRef = React.useRef(importFiles);
  importFilesRef.current = importFiles;

  // Clipboard PASTE: drop an audio file copied from the OS file manager (or a
  // clip from another tab) straight onto the timeline — matches the
  // image-studio paste affordance. Ignored while typing in a field/dialog.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
      }
      const audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|flac|aac|webm)$/i.test(f.name));
      if (!audioFiles.length) return;
      e.preventDefault();
      void importFilesRef.current(audioFiles);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const startRecording = async () => {
    if (!(await guard())) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      recStream.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: getMimeType() });
      recorderRef.current = mr;
      recChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) recChunks.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(recChunks.current, { type: mr.mimeType });
        const ab = await blob.arrayBuffer();
        const buf = await audio.decode(ab);
        const peaks = computeWaveformPeaks(buf);
        const key = nid();
        buffers.current.set(key, { buffer: buf, peaks, name: `Recording ${new Date().toLocaleTimeString()}` });
        const next = cloneDoc(doc);
        const trackId = pickFreeTrackId(next, next.playhead);
        const trackClips = next.clips.filter(c => c.trackId === trackId);
        const start = trackClips.length ? Math.max(...trackClips.map(clipEnd)) : next.playhead;
        next.clips.push({
          id: nid(), trackId, bufferKey: key, start, trimStart: 0, trimEnd: buf.duration,
          gainDb: 0, fadeIn: 0.05, fadeOut: 0.05, pitch: 0, speed: 1,
          bassDb: 0, trebleDb: 0, reverb: 0, echo: 0, normalized: false, reversed: false,
          name: 'Recording',
        });
        commit('recording', next);
        setTick(t => t + 1);
      };
      mr.start(100);
      setRecording(true);
      setRecordTime(0);
      recTimer.current = window.setInterval(() => setRecordTime(t => t + 0.1), 100);
    } catch (e) {
      toastFor('Mic access denied');
    }
  };
  const stopRecording = () => {
    recorderRef.current?.stop();
    recStream.current?.getTracks().forEach(t => t.stop());
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    setRecording(false);
  };

  const generateTts = async () => {
    if (!ttsText.trim()) return;
    if (!(await guard())) return;
    setBusy('Synthesizing…');
    setProgress(0);
    setTtsDialog(false);
    try {
      const buf = await speakToBuffer(ttsText.slice(0, 2000), ttsLang, ttsStyle, (p, r) => {
        setBusy(p); setProgress(Math.round(r * 100));
      });
      const peaks = computeWaveformPeaks(buf);
      const key = nid();
      buffers.current.set(key, { buffer: buf, peaks, name: 'TTS' });
      const next = cloneDoc(doc);
      const trackId = pickFreeTrackId(next, next.playhead);
      const trackClips = next.clips.filter(c => c.trackId === trackId);
      const start = trackClips.length ? Math.max(...trackClips.map(clipEnd)) : next.playhead;
      next.clips.push({
        id: nid(), trackId, bufferKey: key, start, trimStart: 0, trimEnd: buf.duration,
        gainDb: 0, fadeIn: 0.02, fadeOut: 0.02, pitch: 0, speed: 1,
        bassDb: 0, trebleDb: 0, reverb: 0, echo: 0, normalized: true, reversed: false,
        name: 'TTS clip',
      });
      commit('tts', next);
      setTick(t => t + 1);
    } catch (e) {
      toastFor((e as Error).message || 'TTS failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const stopPlayback = () => {
    for (const s of playSources.current) try { s.stop(); } catch {}
    playSources.current = [];
    setPlaying(false);
  };

  const startPlayback = async () => {
    if (playing) { stopPlayback(); return; }
    // Reuse a single AudioContext across plays (avoid hitting the browser's
    // ~6-context cap). Create lazily on first play so the user gesture is
    // present.
    if (!audioCtxRef.current) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    // Safari and increasingly-strict Chrome start AudioContext in `suspended`
    // state even when constructed inside a click handler. Without explicitly
    // resuming it, scheduled BufferSources play silently.
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
    const now = ctx.currentTime + 0.05;
    playSources.current = [];
    playStartedAt.current = now;
    playStartedFrom.current = doc.playhead;
    const masterNode = ctx.createGain();
    masterNode.gain.value = doc.master.volume;
    masterNode.connect(ctx.destination);
    try {
      lufsMeterRef.current = new LufsMeter(ctx, masterNode);
    } catch {}

    const soloed = doc.tracks.some(t => t.solo);
    for (const c of doc.clips) {
      const track = doc.tracks.find(t => t.id === c.trackId);
      if (!track || track.muted || (soloed && !track.solo)) continue;
      const ce = clipEnd(c);
      if (ce <= doc.playhead) continue;
      const entry = buffers.current.get(c.bufferKey);
      if (!entry) continue;
      const processed = applyChain(entry.buffer, c);
      const src = ctx.createBufferSource();
      src.buffer = processed;
      const trackGain = ctx.createGain();
      trackGain.gain.value = track.volume;
      const pannerNode = ctx.createStereoPanner();
      pannerNode.pan.value = track.pan;
      src.connect(trackGain).connect(pannerNode).connect(masterNode);
      const localOffset = Math.max(0, doc.playhead - c.start);
      src.start(now + Math.max(0, c.start - doc.playhead), localOffset);
      playSources.current.push(src);
    }
    setPlaying(true);
  };

  React.useEffect(() => {
    if (!playing) return;
    const start = performance.now() / 1000;
    let raf = 0;
    const tickFn = () => {
      const now = performance.now() / 1000;
      const t = playStartedFrom.current + (now - start);
      if (t >= totalDuration - 5) {
        stopPlayback();
        setDoc(d => ({ ...d, playhead: 0 }));
        return;
      }
      setDoc(d => ({ ...d, playhead: t }));
      raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalDuration]);

  const seek = (t: number) => {
    stopPlayback();
    setDoc(d => ({ ...d, playhead: Math.max(0, t) }));
  };

  const updateClip = (id: string, mut: (c: Clip) => void, label = 'edit') => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id);
    if (!c) return;
    mut(c);
    if (c.start < 0) c.start = 0;
    commit(label, next);
  };

  const deleteClip = (id: string) => {
    const next = cloneDoc(doc);
    next.clips = next.clips.filter(c => c.id !== id);
    if (next.selectedId === id) next.selectedId = null;
    commit('delete', next);
  };

  // Ripple delete (Ctrl+Delete / Ctrl+Backspace): remove the clip AND close the
  // gap across ALL tracks — everything starting at/after the deleted clip's
  // start shuffles left by its duration, keeping multitrack sync (the
  // Descript/Audacity-4 bar). Distinct from plain delete, which leaves a gap.
  const rippleDeleteClip = (id: string) => {
    const target = doc.clips.find(c => c.id === id);
    if (!target) return;
    const gap = clipDuration(target);
    const cutAt = target.start;
    const next = cloneDoc(doc);
    next.clips = next.clips
      .filter(c => c.id !== id)
      .map(c => (c.start >= cutAt ? { ...c, start: Math.max(0, c.start - gap) } : c));
    if (next.selectedId === id) next.selectedId = null;
    commit('ripple delete', next);
    toastFor(`Rippled out ${gap.toFixed(2)}s — gap closed across all tracks`);
  };

  const duplicateClip = (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) return;
    const next = cloneDoc(doc);
    next.clips.push({ ...c, id: nid(), start: clipEnd(c) });
    commit('duplicate', next);
  };

  const removeSilencesFromClip = (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    const trimmed = audio.trim(entry.buffer, c.trimStart, c.trimEnd);
    const ranges = findSilences(trimmed, { thresholdDb: -38, minDurationSec: 0.35 });
    if (!ranges.length) { toastFor('No silences found'); return; }
    const next = cloneDoc(doc);
    next.clips = next.clips.filter(x => x.id !== id);
    let curStart = c.start;
    let lastEnd = 0;
    const speed = c.speed;
    const wantedSegments: { srcStart: number; srcEnd: number }[] = [];
    for (const r of ranges) {
      if (r.start - lastEnd > 0.05) wantedSegments.push({ srcStart: c.trimStart + lastEnd * speed, srcEnd: c.trimStart + r.start * speed });
      lastEnd = r.end;
    }
    const dur = c.trimEnd - c.trimStart;
    if (dur - lastEnd * speed > 0.05) wantedSegments.push({ srcStart: c.trimStart + lastEnd * speed, srcEnd: c.trimEnd });
    let savedCount = 0;
    for (const seg of wantedSegments) {
      const len = (seg.srcEnd - seg.srcStart) / speed;
      next.clips.push({ ...c, id: nid(), start: curStart, trimStart: seg.srcStart, trimEnd: seg.srcEnd });
      curStart += len;
      savedCount++;
    }
    const removed = ranges.reduce((s, r) => s + (r.end - r.start), 0);
    next.selectedId = null;
    commit('remove silences', next);
    toastFor(`Removed ${removed.toFixed(1)}s of silence (${savedCount} segments)`);
  };

  const applyBroadcastPreset = (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    const chain = broadcastChain(entry.buffer, { normalizeLUFS: -16 });
    const next = cloneDoc(doc);
    const cc = next.clips.find(x => x.id === id);
    if (!cc) return;
    cc.gainDb = chain.targetGainDb;
    cc.bassDb = 1.5;
    cc.trebleDb = 2;
    cc.normalized = true;
    cc.fadeIn = Math.max(cc.fadeIn, 0.03);
    cc.fadeOut = Math.max(cc.fadeOut, 0.05);
    commit('broadcast preset', next);
    toastFor(`Broadcast preset applied (+${chain.targetGainDb.toFixed(1)}dB)`);
  };

  const applyDeEss = (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    setBusy('De-essing…');
    try {
      const processed = deEssBuffer(entry.buffer, { freq: 6500, amount: 0.7 });
      const key = nid();
      const peaks = computeWaveformPeaks(processed);
      buffers.current.set(key, { buffer: processed, peaks, name: entry.name + ' (de-ess)' });
      const next = cloneDoc(doc);
      const cc = next.clips.find(x => x.id === id);
      if (cc) cc.bufferKey = key;
      commit('de-ess', next);
      toastFor('De-essed');
    } finally { setBusy(''); }
  };

  // One-click on-device voice enhance (RNNoise). The engine shipped in the repo
  // but was never wired into a studio. Free + private; matches Adobe Podcast
  // Enhance / Audacity noise-reduction but nothing leaves the device.
  const denoiseClip = async (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    if (!(await guard())) return;
    setBusy('Enhancing voice…'); setProgress(0);
    try {
      const { denoise } = await import('@/engines/audio/denoise');
      const processed = await denoise(entry.buffer, {
        strength: 1,
        onProgress: (p) => { setBusy(p.phase || 'Enhancing voice…'); setProgress(Math.round((p.ratio || 0) * 100)); },
      });
      const key = nid();
      const peaks = computeWaveformPeaks(processed);
      buffers.current.set(key, { buffer: processed, peaks, name: entry.name + ' (enhanced)' });
      const next = cloneDoc(doc);
      const cc = next.clips.find(x => x.id === id);
      if (cc) cc.bufferKey = key;
      commit('enhance voice', next);
      toastFor('Voice enhanced — nothing left your device');
    } catch (e) {
      toastFor((e as Error).message || 'Enhance failed');
    } finally { setBusy(''); setProgress(0); }
  };

  // Split a clip into VOCALS + MUSIC on-device (Spleeter 2-stems). Replaces the
  // selected clip's audio with the vocal stem and drops the accompaniment as a
  // new clip on a free track at the same start, so they stay in sync. Free +
  // private — this is lalal.ai's whole product, on-device.
  const splitVocalsFromClip = async (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    if (!(await guard())) return;
    setBusy('Separating vocals…'); setProgress(0);
    try {
      const { separateStem } = await import('@/lib/studios/stem-separation');
      const vocals = await separateStem(entry.buffer, 'vocals', (p) => {
        setBusy(p.phase || 'Separating vocals…'); setProgress(Math.round((p.ratio || 0) * 50));
      });
      const musicBuf = await separateStem(entry.buffer, 'accompaniment', (p) => {
        setBusy(p.phase || 'Separating music…'); setProgress(50 + Math.round((p.ratio || 0) * 50));
      });
      const vKey = nid(), mKey = nid();
      buffers.current.set(vKey, { buffer: vocals, peaks: computeWaveformPeaks(vocals), name: entry.name + ' (vocals)' });
      buffers.current.set(mKey, { buffer: musicBuf, peaks: computeWaveformPeaks(musicBuf), name: entry.name + ' (music)' });
      const next = cloneDoc(doc);
      const cc = next.clips.find(x => x.id === id);
      if (!cc) return;
      cc.bufferKey = vKey;
      cc.name = (cc.name || entry.name) + ' (vocals)';
      // Accompaniment as a sibling clip on a free track, same start/trim → in
      // sync. Copy the clip's geometry but reset per-clip FX to neutral.
      const trackId = pickFreeTrackId(next, cc.start);
      const music: Clip = {
        id: nid(), trackId, bufferKey: mKey, start: cc.start,
        trimStart: cc.trimStart, trimEnd: cc.trimEnd,
        gainDb: 0, fadeIn: 0, fadeOut: 0, pitch: 0, speed: cc.speed,
        bassDb: 0, trebleDb: 0, reverb: 0, echo: 0,
        normalized: false, reversed: false, name: (entry.name || 'clip') + ' (music)',
      };
      next.clips.push(music);
      next.selectedId = cc.id;
      commit('split vocals / music', next);
      toastFor('Split into vocals + music — on-device');
    } catch (e) {
      toastFor((e as Error).message || 'Separation failed');
    } finally { setBusy(''); setProgress(0); }
  };

  // Transcribe a clip ON-DEVICE (Whisper) → store timed lines, offset to the
  // clip's timeline position. Engine was in the repo but never imported here.
  const transcribeClip = async (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    if (!(await guard())) return;
    setBusy('Transcribing on your device…');
    setProgress(0);
    try {
      const { transcribe } = await import('@/engines/transcribe');
      const wav = audio.encodeWav(entry.buffer);
      const res = await transcribe(wav, {
        size: 'base',
        onProgress: (p) => { setBusy(p.phase || 'Transcribing…'); setProgress(Math.round((p.ratio || 0) * 100)); },
      });
      const lines = res.chunks.map(ch => ({ start: c.start + ch.start, end: c.start + ch.end, text: (ch.text || '').trim() })).filter(l => l.text);
      setTranscripts(t => ({ ...t, [id]: lines }));
      toastFor(`Transcribed ${lines.length} lines — nothing left your device`);
    } catch (e) {
      toastFor((e as Error).message || 'Transcribe failed');
    } finally { setBusy(''); setProgress(0); }
  };

  // Descript-style: transcribe the clip into editable WORDS (clip-local times),
  // so deleting a word splices that audio out. On-device Whisper word-timestamps.
  const transcribeWords = async (id: string) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) { toastFor('Select a clip first'); return; }
    const entry = buffers.current.get(c.bufferKey);
    if (!entry) return;
    if (!(await guard())) return;
    setBusy('Transcribing words on your device…');
    setProgress(0);
    try {
      const { transcribe } = await import('@/engines/transcribe');
      // Transcribe the AUDIBLE part of the clip (respect its trim) so word times
      // line up with what's actually in the clip.
      const trimmed = audio.trim(entry.buffer, c.trimStart, c.trimEnd);
      const wav = audio.encodeWav(trimmed);
      const res = await transcribe(wav, {
        size: 'base', wordTimestamps: true,
        onProgress: (p) => { setBusy(p.phase || 'Transcribing…'); setProgress(Math.round((p.ratio || 0) * 100)); },
      });
      // chunks are per-word when wordTimestamps:true; times are clip-local.
      const ws = res.chunks.map(ch => ({ text: (ch.text || '').trim(), start: ch.start, end: ch.end })).filter(w => w.text);
      setWords(w => ({ ...w, [id]: ws }));
      toastFor(ws.length ? `${ws.length} words — delete any to cut that audio` : 'No speech detected');
    } catch (e) {
      toastFor((e as Error).message || 'Transcribe failed');
    } finally { setBusy(''); setProgress(0); }
  };

  // Delete a transcribed word → splice its audio range out of the clip, rebuilt
  // as back-to-back sub-clips (same proven mechanic as removeSilencesFromClip).
  const deleteWord = (id: string, wordIdx: number) => {
    const c = doc.clips.find(x => x.id === id);
    const ws = words[id];
    if (!c || !ws || !ws[wordIdx]) return;
    const w = ws[wordIdx];
    const speed = c.speed;
    const dur = c.trimEnd - c.trimStart;
    // Keep everything EXCEPT [w.start, w.end] (clip-local, pre-speed seconds).
    const segs: { srcStart: number; srcEnd: number }[] = [];
    if (w.start > 0.02) segs.push({ srcStart: c.trimStart, srcEnd: c.trimStart + w.start * speed });
    if (dur - w.end * speed > 0.02) segs.push({ srcStart: c.trimStart + w.end * speed, srcEnd: c.trimEnd });
    const next = cloneDoc(doc);
    next.clips = next.clips.filter(x => x.id !== id);
    let curStart = c.start;
    for (const seg of segs) {
      const len = (seg.srcEnd - seg.srcStart) / speed;
      next.clips.push({ ...c, id: nid(), start: curStart, trimStart: seg.srcStart, trimEnd: seg.srcEnd });
      curStart += len;
    }
    commit('delete word', next);
    // Drop the word from the displayed transcript (keep the rest, shift nothing —
    // remaining words' times no longer map perfectly after a cut, so re-transcribe
    // for further precise edits; we just remove the chip here).
    setWords(state => ({ ...state, [id]: ws.filter((_, i) => i !== wordIdx) }));
    toastFor(`Removed “${w.text}”`);
  };

  const downloadSrt = async () => {
    const all = Object.values(transcripts).flat().sort((a, b) => a.start - b.start);
    if (!all.length) { toastFor('Transcribe a clip first'); return; }
    const { chunksToSrt } = await import('@/engines/transcribe');
    const blob = new Blob([chunksToSrt(all)], { type: 'application/x-subrip' });
    downloadBlob(blob, `${safeFilename(doc.name)}.srt`);
  };

  const splitClip = (id: string, t: number) => {
    const c = doc.clips.find(x => x.id === id);
    if (!c) return;
    const local = t - c.start;
    if (local <= 0.05 || local >= clipDuration(c) - 0.05) return;
    const next = cloneDoc(doc);
    const a = next.clips.find(x => x.id === id);
    if (!a) return;
    const midSrc = a.trimStart + local * a.speed;
    next.clips.push({ ...a, id: nid(), start: a.start + local, trimStart: midSrc });
    a.trimEnd = midSrc;
    commit('split', next);
  };

  const exportNow = async () => {
    const durHit = checkLever(POLICY_KEY, 'input-duration', totalDuration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    const trackHit = checkLever(POLICY_KEY, 'tracks', doc.tracks.length, isPro);
    if (trackHit) { policyGate.fire(trackHit); return; }
    const fmtHit = checkFormat(POLICY_KEY, exportFmt, isPro);
    if (fmtHit) { policyGate.fire(fmtHit); return; }
    if (!(await guard())) return;
    if (!doc.clips.length) { toastFor('Add at least one clip'); return; }
    setBusy('Rendering mix…');
    setProgress(0);
    setExportDialog(false);
    try {
      const sr = 48000;
      const ch = 2;
      const Ctx = (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext) as typeof OfflineAudioContext;
      const offline = new Ctx(ch, Math.ceil(totalDuration * sr), sr);
      const master = offline.createGain();
      master.gain.value = doc.master.volume;
      master.connect(offline.destination);

      const soloed = doc.tracks.some(t => t.solo);
      let count = 0;
      for (const c of doc.clips) {
        const track = doc.tracks.find(t => t.id === c.trackId);
        if (!track || track.muted || (soloed && !track.solo)) continue;
        const entry = buffers.current.get(c.bufferKey);
        if (!entry) continue;
        const processed = applyChain(entry.buffer, c);
        const src = offline.createBufferSource();
        src.buffer = processed;
        const trackGain = offline.createGain();
        trackGain.gain.value = track.volume;
        const panner = offline.createStereoPanner();
        panner.pan.value = track.pan;
        src.connect(trackGain).connect(panner).connect(master);
        src.start(c.start);
        count++;
      }
      if (!count) throw new Error('No audible clips');
      const rendered = await offline.startRendering();
      let final = rendered;
      // Real BS.1770 loudness normalization to −16 LUFS (true-peak limited),
      // matching the LUFS meter shown in the UI — was peak normalization, which
      // is not loudness and made the "−16 LUFS" claim a lie.
      if (doc.master.normalize) final = audio.loudnessNormalize(final, -16, -1);
      let blob: Blob;
      if (exportFmt === 'mp3') blob = await audio.encodeMp3(final, 192);
      else blob = audio.encodeWav(final);
      downloadBlob(blob, `${safeFilename(doc.name)}.${exportFmt}`);
      toastFor('Exported');
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const proj = newProject('audio-voice', doc.name, { doc });
      await saveProject(proj);
      toastFor('Saved (re-import audio to reopen)');
    } finally { setBusy(''); }
  };

  const openSaved = async () => {
    const list = await listProjects('audio-voice');
    setSavedList(list);
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<{ doc: DocState }>(id);
      if (!p) return;
      setDoc(p.state.doc);
      stack.current.reset(cloneDoc(p.state.doc), 'open');
      toastFor('Re-import audio files');
      setOpenDialog(false);
    } finally { setBusy(''); }
  };

  useRegisterShortcuts([
    {
      label: 'Playback',
      items: [
        { combo: ' ', description: 'Play / Stop' },
        { combo: 'home', description: 'Jump to start' },
        { combo: 'left', description: 'Seek back 0.5s' },
        { combo: 'right', description: 'Seek forward 0.5s' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { combo: 's', description: 'Split clip at playhead' },
        { combo: '/', description: 'Split clip at playhead' },
        { combo: 'mod+d', description: 'Duplicate clip' },
        { combo: 'delete', description: 'Delete clip (leaves a gap)' },
        { combo: 'mod+delete', description: 'Ripple delete — close gap across all tracks' },
        { combo: 'alt', description: 'Hold while dragging to bypass snapping' },
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
      ],
    },
    {
      label: 'Recording',
      items: [
        { combo: 'r', description: 'Start / Stop recording' },
      ],
    },
    {
      label: 'File',
      items: [
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
        { combo: 'mod+o', description: 'Open library' },
      ],
    },
    {
      label: 'View',
      items: [
        { combo: '+', description: 'Zoom in timeline' },
        { combo: '-', description: 'Zoom out timeline' },
      ],
    },
  ]);

  useShortcuts([
    { combo: ' ', handler: () => { void startPlayback(); } },
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'r', handler: () => { recording ? stopRecording() : void startRecording(); } },
    { combo: 's', handler: () => doc.selectedId && splitClip(doc.selectedId, doc.playhead) },
    { combo: '/', handler: () => doc.selectedId && splitClip(doc.selectedId, doc.playhead) },
    { combo: 'delete', handler: () => doc.selectedId && deleteClip(doc.selectedId) },
    { combo: 'backspace', handler: () => doc.selectedId && deleteClip(doc.selectedId) },
    { combo: 'mod+delete', handler: () => doc.selectedId && rippleDeleteClip(doc.selectedId) },
    { combo: 'mod+backspace', handler: () => doc.selectedId && rippleDeleteClip(doc.selectedId) },
    { combo: 'mod+d', handler: () => doc.selectedId && duplicateClip(doc.selectedId) },
    { combo: 'home', handler: () => seek(0) },
    { combo: 'left', handler: () => seek(doc.playhead - 0.5) },
    { combo: 'right', handler: () => seek(doc.playhead + 0.5) },
    { combo: '+', handler: () => setZoom(z => Math.min(400, z * 1.25)) },
    { combo: '-', handler: () => setZoom(z => Math.max(20, z / 1.25)) },
  ]);

  const selectedClip = doc.clips.find(c => c.id === doc.selectedId) ?? null;

  return (
    <StudioShell>
      {policyGate.element}
      <StudioTopBar
        title="Voice Studio Pro"
        left={
          <>
            <label title="Import audio — or just paste a copied audio file (Ctrl/⌘+V)" className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Import
              <ClipboardPaste className="h-3 w-3 text-zinc-500" />
              <input type="file" accept="audio/*" multiple className="hidden" onChange={e => e.target.files && importFiles(e.target.files)} />
            </label>
            <button onClick={() => recording ? stopRecording() : void startRecording()} className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', recording ? 'bg-rose-500 text-white animate-pulse' : 'text-rose-300 hover:bg-rose-500/10')}>
              {recording ? <><Square className="h-3 w-3" /> {fmtT(recordTime)}</> : <><Mic className="h-3.5 w-3.5" /> Record</>}
            </button>
            <StudioButton variant="ghost" size="sm" onClick={() => setTtsDialog(true)}><Wand2 className="h-3.5 w-3.5" /> TTS</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => doc.selectedId ? void transcribeClip(doc.selectedId) : toastFor('Select a clip first')} title="Transcribe the selected clip on your device"><FileText className="h-3.5 w-3.5" /> Transcribe</StudioButton>
            {Object.keys(transcripts).length > 0 && <StudioButton variant="ghost" size="sm" onClick={() => void downloadSrt()} title="Export transcript as SRT subtitles">SRT</StudioButton>}
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

      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/5 bg-[#0f1115] px-3 text-xs">
        <button onClick={() => seek(0)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><SkipBack className="h-4 w-4" /></button>
        <button onClick={() => void startPlayback()} className="rounded bg-cyan-500 p-1.5 text-zinc-900 hover:bg-cyan-400">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        <button onClick={() => seek(totalDuration - 5)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><SkipForward className="h-4 w-4" /></button>
        <span className="ml-3 tabular-nums text-zinc-300">{fmtT(doc.playhead)} / {fmtT(totalDuration - 5)}</span>
        <button onClick={() => doc.selectedId && splitClip(doc.selectedId, doc.playhead)} disabled={!doc.selectedId} title="Split clip at playhead (S or /)" className="ml-3 flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5 disabled:opacity-40"><Scissors className="h-3 w-3" /> Split</button>
        <button onClick={() => doc.selectedId && duplicateClip(doc.selectedId)} disabled={!doc.selectedId} title="Duplicate clip (Ctrl/⌘+D)" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5 disabled:opacity-40"><Copy className="h-3 w-3" /> Duplicate</button>
        <button onClick={() => doc.selectedId && rippleDeleteClip(doc.selectedId)} disabled={!doc.selectedId} title="Ripple delete — remove clip and close the gap across all tracks (Ctrl/⌘+Delete)" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5 disabled:opacity-40"><Scissors className="h-3 w-3 rotate-90" /> Ripple</button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setSnap(s => !s)} title="Snap to clip edges & playhead — hold Alt while dragging to bypass" className={cn('flex items-center gap-1 rounded px-2 py-1', snap ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-400 hover:bg-white/5')}><Magnet className="h-3 w-3" /> Snap</button>
          <button onClick={() => setZoom(z => Math.max(20, z / 1.25))} className="rounded p-1 text-zinc-400 hover:bg-white/5"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="text-[10px] tabular-nums text-zinc-500">{Math.round(zoom)}px/s</span>
          <button onClick={() => setZoom(z => Math.min(400, z * 1.25))} className="rounded p-1 text-zinc-400 hover:bg-white/5"><ZoomIn className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {recovery && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="font-medium">Recovered an unsaved session</span>
          <span className="text-amber-200/80">
            {recovery.doc.clips.length} clip{recovery.doc.clips.length > 1 ? 's' : ''} · {new Date(recovery.t).toLocaleString()}
            {recovery.sources.length > 0 && <> · re-import: {recovery.sources.slice(0, 3).join(', ')}{recovery.sources.length > 3 ? `, +${recovery.sources.length - 3}` : ''}</>}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={restoreSession} className="rounded bg-amber-400 px-2.5 py-1 font-medium text-amber-950 hover:bg-amber-300">Restore</button>
            <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200 hover:bg-amber-400/15">Dismiss</button>
          </div>
        </div>
      )}

      <StudioBody>
        {doc.clips.length === 0 ? (
          <div className="relative flex-1">
            <EmptyState
              icon={<AudioLines className="h-7 w-7" />}
              title="Start your voice production"
              description="Record straight from your mic, drop in audio files, or generate speech from text — all stays on your device."
              actions={[
                { label: 'Record from microphone', description: 'Press R anytime, or click the Record button', icon: <Mic className="h-4 w-4" />, onClick: () => void startRecording(), primary: true },
                { label: 'Generate from text (TTS)', description: 'Type a script and pick a voice', icon: <Wand2 className="h-4 w-4" />, onClick: () => setTtsDialog(true) },
                { label: 'Import audio file', description: 'WAV, MP3, M4A, OGG, FLAC', icon: <Upload className="h-4 w-4" />, onClick: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*'; i.multiple = true; i.onchange = () => i.files && importFiles(i.files); i.click(); } },
              ]}
              hints={[
                { label: 'Multi-clip timeline', description: 'Trim, split, fade, layer effects per clip' },
                { label: 'Paste audio (Ctrl/⌘+V)', description: 'Drop a copied audio file straight onto the timeline' },
                { label: 'Smart actions', description: 'Auto-remove silences, broadcast mastering, de-essing in one click' },
                { label: 'Auto-saved', description: 'Your work is recovered after a refresh or crash' },
                { label: 'Press ?', description: 'See every keyboard shortcut' },
              ]}
            />
          </div>
        ) : (
        <Timeline
          doc={doc}
          buffers={buffers.current}
          zoom={zoom}
          snap={snap}
          onSeek={seek}
          onSelect={(id) => setDoc(d => ({ ...d, selectedId: id }))}
          onMoveClip={(id, start) => updateClip(id, c => { c.start = start; }, 'move')}
          onTrimClip={(id, edge, t) => updateClip(id, c => {
            if (edge === 'l') { const delta = t - c.start; const newSrc = c.trimStart + delta * c.speed; if (newSrc < c.trimEnd - 0.05 && t < clipEnd(c) - 0.05) { c.start = t; c.trimStart = newSrc; } }
            else { const newEnd = c.trimStart + (t - c.start) * c.speed; if (newEnd > c.trimStart + 0.05) c.trimEnd = newEnd; }
          }, 'trim')}
          onTrackToggle={(id, key) => {
            const next = cloneDoc(doc);
            const t = next.tracks.find(x => x.id === id);
            if (t) { if (key === 'muted') t.muted = !t.muted; if (key === 'solo') t.solo = !t.solo; if (key === 'locked') t.locked = !t.locked; }
            commit(key, next);
          }}
          onTrackVolume={(id, vol) => {
            const next = cloneDoc(doc);
            const t = next.tracks.find(x => x.id === id);
            if (t) t.volume = vol;
            commit('track vol', next);
          }}
          onTrackPan={(id, pan) => {
            const next = cloneDoc(doc);
            const t = next.tracks.find(x => x.id === id);
            if (t) t.pan = pan;
            commit('track pan', next);
          }}
        />
        )}

        <StudioSidebar width={280}>
          {selectedClip ? (
            <>
              <StudioPanel title="Smart actions">
                <div className="space-y-1.5">
                  <StudioButton size="sm" variant="soft" onClick={() => removeSilencesFromClip(selectedClip.id)}><Sparkles className="h-3 w-3" /> Remove silences</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => applyBroadcastPreset(selectedClip.id)}><Sparkles className="h-3 w-3" /> Broadcast preset</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => applyDeEss(selectedClip.id)}><Sparkles className="h-3 w-3" /> De-ess (reduce sibilance)</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => void denoiseClip(selectedClip.id)}><Sparkles className="h-3 w-3" /> Enhance voice (remove noise)</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => void splitVocalsFromClip(selectedClip.id)}><Sparkles className="h-3 w-3" /> Split vocals / music</StudioButton>
                </div>
              </StudioPanel>
              <StudioPanel title="Transcript — edit by word">
                <div className="space-y-2">
                  <StudioButton size="sm" variant="soft" onClick={() => void transcribeWords(selectedClip.id)}><FileText className="h-3 w-3" /> Transcribe (words)</StudioButton>
                  {(words[selectedClip.id]?.length ?? 0) > 0 && (
                    <>
                      <div className="text-[10px] text-zinc-500">Click a word to delete it — that audio is cut. Re-transcribe for further precise edits.</div>
                      <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                        {words[selectedClip.id].map((w, i) => (
                          <button key={i} onClick={() => deleteWord(selectedClip.id, i)} title="Click to delete this word + its audio"
                            className="rounded bg-white/5 px-1.5 py-0.5 text-[12px] text-zinc-200 hover:bg-rose-500/30 hover:text-rose-100 hover:line-through">
                            {w.text}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </StudioPanel>
              <ClipInspector clip={selectedClip} buffer={buffers.current.get(selectedClip.bufferKey) ?? null} onChange={(mut) => updateClip(selectedClip.id, mut, 'props')} />
              <EffectsRack
                value={selectedClip.effects ?? []}
                onChange={(next) => updateClip(selectedClip.id, c => { c.effects = next; }, 'effect chain')}
                title="Effect chain"
              />
            </>
          ) : (
            <StudioPanel title="Inspector">
              <div className="text-xs text-zinc-500">Select a clip to edit its effects.</div>
            </StudioPanel>
          )}
          <StudioPanel title="Master">
            <StudioSlider label="Volume" value={Math.round(doc.master.volume * 100)} min={0} max={200} onChange={v => commit('master vol', { ...cloneDoc(doc), master: { ...doc.master, volume: v / 100 } })} suffix="%" />
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={doc.master.normalize} onChange={e => commit('master norm', { ...cloneDoc(doc), master: { ...doc.master, normalize: e.target.checked } })} /> Normalize to −16 LUFS on export
            </label>
          </StudioPanel>
          {playing && (
            <StudioPanel title="LUFS / True Peak" defaultOpen>
              <LufsMeterDisplay meterRef={lufsMeterRef} targetLufs={-16} title="" />
            </StudioPanel>
          )}
          {selectedClip && (
            <StudioPanel title="Spectrogram" defaultOpen={false}>
              <SpectrogramView audioBuffer={buffers.current.get(selectedClip.bufferKey)?.buffer ?? null} width={260} height={80} />
            </StudioPanel>
          )}
        </StudioSidebar>
      </StudioBody>

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/5 bg-[#0f1115] px-3 text-[11px] text-zinc-400">
        <span>{doc.clips.length} clips · {doc.tracks.length} tracks</span>
        {selectedClip && <span className="text-cyan-300 truncate">{selectedClip.name}</span>}
        <span className="ml-auto">{fmtT(totalDuration - 5)} total</span>
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
        <Dialog title="Export Audio" onCancel={() => setExportDialog(false)} onConfirm={exportNow} confirmLabel="Render">
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-zinc-400">Format</div>
              <div className="flex gap-1">
                {(['wav', 'mp3'] as const).map(f => (
                  <button key={f} onClick={() => setExportFmt(f)} className={cn('flex-1 rounded px-3 py-1.5 text-xs uppercase', exportFmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
                ))}
              </div>
            </div>
            <div className="text-xs text-zinc-500">Rendered at 48kHz stereo.</div>
          </div>
        </Dialog>
      )}
      {ttsDialog && (
        <Dialog title="Text to Speech" onCancel={() => setTtsDialog(false)} onConfirm={generateTts} confirmLabel="Generate" wide>
          <div className="space-y-3">
            <textarea value={ttsText} onChange={e => setTtsText(e.target.value)} rows={5} className="w-full rounded border border-white/10 bg-[#0a0b0e] p-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50" placeholder="Type or paste up to 2000 chars" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-xs text-zinc-400">Language</div>
                <select value={ttsLang} onChange={e => setTtsLang(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs">
                  {TTS_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-zinc-400">Voice</div>
                <select value={ttsStyle.id} onChange={e => setTtsStyle(VOICE_STYLES.find(v => v.id === e.target.value) ?? VOICE_STYLES[0])} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs">
                  {VOICE_STYLES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Dialog>
      )}
      {openDialog && (
        <Dialog title="Library" onCancel={() => setOpenDialog(false)} onConfirm={() => setOpenDialog(false)} confirmLabel="Close">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {savedList.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects</div>}
            {savedList.map(p => (
              <button key={p.id} onClick={() => loadFromLibrary(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
                <AudioLines className="h-3.5 w-3.5 text-zinc-400" />
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

function Timeline({ doc, buffers, zoom, snap, onSeek, onSelect, onMoveClip, onTrimClip, onTrackToggle, onTrackVolume, onTrackPan }: {
  doc: DocState;
  buffers: Map<string, { buffer: AudioBuffer; peaks: Float32Array; name: string }>;
  zoom: number; snap: boolean;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onMoveClip: (id: string, start: number) => void;
  onTrimClip: (id: string, edge: 'l' | 'r', t: number) => void;
  onTrackToggle: (id: string, key: 'muted' | 'solo' | 'locked') => void;
  onTrackVolume: (id: string, v: number) => void;
  onTrackPan: (id: string, p: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<null | { type: 'move' | 'trim-l' | 'trim-r'; id: string; ox: number; ov: number }>(null);
  const trackH = 84;
  const totalSeconds = React.useMemo(() => Math.max(20, Math.ceil(Math.max(...doc.clips.map(clipEnd), 0)) + 5), [doc.clips]);
  const tlW = totalSeconds * zoom;
  const tlH = doc.tracks.length * trackH;
  const xToT = (x: number) => x / zoom;
  const tToX = (t: number) => t * zoom;

  // Live drag feedback: a magenta snap-line at the snapped time + a floating
  // time tooltip that tracks the dragged edge. Drawn only during a drag.
  const [guide, setGuide] = React.useState<null | { t: number; snapped: boolean; label: string }>(null);
  // Hold Alt/Option to temporarily bypass snapping (table-stakes hold-key).
  const altRef = React.useRef(false);
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Alt') altRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') altRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Returns the snapped time AND whether a snap actually occurred, so the
  // timeline can render the magenta guide only when we've locked onto an edge.
  const snapResult = (t: number, exclude?: string): { t: number; snapped: boolean } => {
    if (!snap || altRef.current) return { t: Math.max(0, t), snapped: false };
    const snaps: number[] = [0, doc.playhead];
    for (const c of doc.clips) { if (exclude && c.id === exclude) continue; snaps.push(c.start, clipEnd(c)); }
    let best = t, bestD = 0.2, hit = false;
    for (const s of snaps) { const d = Math.abs(s - t); if (d < bestD) { bestD = d; best = s; hit = true; } }
    return { t: Math.max(0, best), snapped: hit };
  };
  const snappedT = (t: number, exclude?: string) => snapResult(t, exclude).t;

  const onScrub: React.MouseEventHandler = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onSeek(xToT(e.clientX - r.left + ref.current.scrollLeft));
  };

  const onPointerDownClip = (e: React.PointerEvent, c: Clip, mode: 'move' | 'trim-l' | 'trim-r') => {
    e.stopPropagation();
    onSelect(c.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      type: mode, id: c.id, ox: e.clientX,
      ov: mode === 'trim-r' ? clipEnd(c) : c.start,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.ox) / zoom;
    const res = snapResult(d.ov + dx, d.id);
    if (d.type === 'move') onMoveClip(d.id, res.t);
    else if (d.type === 'trim-l') onTrimClip(d.id, 'l', res.t);
    else if (d.type === 'trim-r') onTrimClip(d.id, 'r', res.t);
    setGuide({ t: res.t, snapped: res.snapped, label: fmtT(res.t) });
  };
  const onPointerUp = () => { drag.current = null; setGuide(null); };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-44 shrink-0 border-r border-white/5 bg-[#0f1115]">
        <div className="h-6 border-b border-white/5" />
        {doc.tracks.map(t => (
          <div key={t.id} style={{ height: trackH }} className="flex flex-col gap-1 border-b border-white/5 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button onClick={() => onTrackToggle(t.id, 'muted')} className={cn('rounded p-1', t.muted ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-500 hover:bg-white/5')}>{t.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
              <button onClick={() => onTrackToggle(t.id, 'solo')} className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', t.solo ? 'bg-yellow-500 text-zinc-900' : 'text-zinc-500 hover:bg-white/5')}>S</button>
              <button onClick={() => onTrackToggle(t.id, 'locked')} className={cn('rounded p-1', t.locked ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500 hover:bg-white/5')}>{t.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}</button>
              <span className="text-[11px] font-medium text-zinc-300">{t.label}</span>
            </div>
            <input type="range" min={0} max={2} step={0.01} value={t.volume} onChange={e => onTrackVolume(t.id, +e.target.value)} className="h-1" />
            <input type="range" min={-1} max={1} step={0.05} value={t.pan} onChange={e => onTrackPan(t.id, +e.target.value)} className="h-1" />
          </div>
        ))}
      </div>
      <div ref={ref} className="relative flex-1 overflow-auto bg-[#0a0b0e]" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="relative" style={{ width: tlW, height: tlH + 24 }}>
          <div className="sticky top-0 z-10 flex h-6 border-b border-white/10 bg-[#0f1115]" onMouseDown={onScrub} onClick={onScrub}>
            {Array.from({ length: totalSeconds + 1 }, (_, t) => (
              <div key={t} className="absolute top-0 h-full" style={{ left: tToX(t) }}>
                <div className={cn('w-px', t % 5 === 0 ? 'h-full bg-white/20' : 'h-1/2 bg-white/10')} />
                {t % 5 === 0 && <div className="absolute left-1 top-0 text-[9px] tabular-nums text-zinc-500">{fmtT(t)}</div>}
              </div>
            ))}
          </div>
          <div className="relative">
            {doc.tracks.map((t, i) => (
              <div key={t.id} style={{ position: 'absolute', left: 0, top: i * trackH, width: tlW, height: trackH }} className="border-b border-white/5 bg-[#0c0d10]" onClick={() => onSelect(null)} />
            ))}
            {doc.clips.map(c => {
              const ti = doc.tracks.findIndex(t => t.id === c.trackId);
              if (ti < 0) return null;
              const x = tToX(c.start);
              const w = Math.max(8, tToX(clipDuration(c)));
              const isSel = doc.selectedId === c.id;
              const entry = buffers.get(c.bufferKey);
              return (
                <div
                  key={c.id}
                  title={`${c.name} · ${clipDuration(c).toFixed(2)}s — drag to move, drag edges to trim`}
                  style={{ position: 'absolute', left: x, top: ti * trackH + 4, width: w, height: trackH - 8 }}
                  className={cn('group flex cursor-grab overflow-hidden rounded border bg-gradient-to-br from-emerald-500/30 to-teal-600/30 transition-shadow', isSel ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-emerald-500/40 hover:border-emerald-300/60 hover:shadow-[0_0_0_1px_rgba(110,231,183,.4)]')}
                  onPointerDown={(e) => onPointerDownClip(e, c, 'move')}
                >
                  {/* Trim handles: subtle by default, brighten on hover so the
                      affordance appears under the cursor (Audacity-4 bar). */}
                  <div title="Trim start" onPointerDown={(e) => onPointerDownClip(e, c, 'trim-l')} className="w-1.5 cursor-ew-resize bg-white/20 transition-colors group-hover:bg-white/40 hover:!bg-cyan-300" />
                  <div className="relative flex-1 overflow-hidden">
                    <WaveformView peaks={entry?.peaks} />
                    <div className="absolute left-1 top-0.5 text-[10px] font-medium text-white drop-shadow truncate w-full pr-2">{c.name}</div>
                    <div className="absolute bottom-0.5 right-1 rounded bg-black/40 px-1 text-[9px] tabular-nums text-white/80 opacity-0 transition-opacity group-hover:opacity-100">{clipDuration(c).toFixed(2)}s</div>
                  </div>
                  <div title="Trim end" onPointerDown={(e) => onPointerDownClip(e, c, 'trim-r')} className="w-1.5 cursor-ew-resize bg-white/20 transition-colors group-hover:bg-white/40 hover:!bg-cyan-300" />
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: tToX(doc.playhead), top: 0, height: tlH, width: 2, background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,.6)' }}>
              <div className="absolute -left-1.5 -top-1 h-3 w-4 rounded-sm bg-cyan-400" />
            </div>
            {/* Live drag guide: a crisp magenta snap-line when locked onto an
                edge (dimmer when free), plus a floating time readout — the
                feedback every desktop DAW gives and the web rivals skip. */}
            {guide && (
              <div
                style={{ position: 'absolute', left: tToX(guide.t), top: 0, height: tlH, width: guide.snapped ? 2 : 1 }}
                className={cn('pointer-events-none z-20', guide.snapped ? 'bg-fuchsia-400' : 'bg-white/30')}
              >
                {guide.snapped && <div className="absolute inset-0 -mx-px bg-fuchsia-400/40 blur-[2px]" />}
                <div className={cn('absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums shadow', guide.snapped ? 'bg-fuchsia-500 text-white' : 'bg-black/80 text-zinc-100')}>
                  {guide.label}{guide.snapped ? ' ⛓' : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WaveformView({ peaks }: { peaks?: Float32Array }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c || !peaks) return;
    const parent = c.parentElement;
    if (!parent) return;
    const w = parent.clientWidth, h = parent.clientHeight;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    const step = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const ph = Math.max(1, peaks[i] * h * 0.7);
      ctx.fillRect(i * step, (h - ph) / 2, Math.max(1, step), ph);
    }
  }, [peaks]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

function ClipInspector({ clip, buffer, onChange }: { clip: Clip; buffer: { buffer: AudioBuffer; name: string } | null; onChange: (mut: (c: Clip) => void) => void }) {
  return (
    <>
      <StudioPanel title="Clip">
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">{buffer?.name}</div>
          <StudioSlider label="Gain" value={clip.gainDb} min={-20} max={20} step={0.5} onChange={v => onChange(c => { c.gainDb = v; })} suffix="dB" />
          <StudioSlider label="Speed" value={Math.round(clip.speed * 100)} min={50} max={200} onChange={v => onChange(c => { c.speed = v / 100; })} suffix="%" />
          <StudioSlider label="Pitch" value={clip.pitch} min={-12} max={12} step={1} onChange={v => onChange(c => { c.pitch = v; })} suffix=" st" />
          <StudioSlider label="Fade in" value={clip.fadeIn} min={0} max={5} step={0.05} onChange={v => onChange(c => { c.fadeIn = v; })} suffix="s" />
          <StudioSlider label="Fade out" value={clip.fadeOut} min={0} max={5} step={0.05} onChange={v => onChange(c => { c.fadeOut = v; })} suffix="s" />
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={clip.normalized} onChange={e => onChange(c => { c.normalized = e.target.checked; })} /> Normalize
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={clip.reversed} onChange={e => onChange(c => { c.reversed = e.target.checked; })} /> Reverse
          </label>
        </div>
      </StudioPanel>
      <StudioPanel title="EQ">
        <div className="space-y-3">
          <StudioSlider label="Bass" value={clip.bassDb} min={-12} max={12} step={0.5} onChange={v => onChange(c => { c.bassDb = v; })} suffix="dB" color="#f59e0b" />
          <StudioSlider label="Treble" value={clip.trebleDb} min={-12} max={12} step={0.5} onChange={v => onChange(c => { c.trebleDb = v; })} suffix="dB" color="#22d3ee" />
        </div>
      </StudioPanel>
      <StudioPanel title="FX">
        <div className="space-y-3">
          <StudioSlider label="Reverb" value={Math.round(clip.reverb * 100)} min={0} max={100} onChange={v => onChange(c => { c.reverb = v / 100; })} suffix="%" color="#a855f7" />
          <StudioSlider label="Echo" value={Math.round(clip.echo * 100)} min={0} max={100} onChange={v => onChange(c => { c.echo = v / 100; })} suffix="%" color="#ec4899" />
        </div>
      </StudioPanel>
    </>
  );
}

function getMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const m of candidates) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK', wide }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string; wide?: boolean }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width={wide ? 'lg' : 'sm'}>{children}</SharedDialog>;
}
