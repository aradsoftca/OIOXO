'use client';

import * as React from 'react';
import {
  Loader2, Download, Upload, Play, Pause, Plus, Trash2, Copy, Scissors,
  Wand2, ChevronLeft, ChevronRight, Type as TypeIcon, FileText, Save,
  Undo2, Redo2, ZoomIn, ZoomOut, Magnet, X, AlertTriangle, SkipBack, SkipForward,
  Clipboard, RotateCcw, LayoutTemplate, FastForward, Rewind, ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever, checkFormat } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'subtitle-studio';
// Crash-recovery: a 2s-debounced snapshot of the working doc is mirrored here so a
// refresh / tab-crash mid-edit never loses work (weaponizes the rivals' #1 complaint).
const RECOVERY_KEY = 'subtitle-studio:recovery:v1';
const RECOVERY_MAX_AGE = 7 * 24 * 3600 * 1000; // 7 days

interface RecoverySnapshot { savedAt: number; name: string; cueCount: number; doc: DocState }

function readRecovery(): RecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RecoverySnapshot;
    if (!snap?.doc || !Array.isArray(snap.doc.cues)) return null;
    if (Date.now() - snap.savedAt > RECOVERY_MAX_AGE) { localStorage.removeItem(RECOVERY_KEY); return null; }
    return snap;
  } catch { return null; }
}
// Returns false if the snapshot couldn't be saved (quota exceeded / private mode)
// so the caller can warn the user once — silent failure here could lose work.
function writeRecovery(doc: DocState): boolean {
  try {
    const snap: RecoverySnapshot = { savedAt: Date.now(), name: doc.name, cueCount: doc.cues.length, doc };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snap));
    return true;
  } catch { return false; }
}
function clearRecovery() { try { localStorage.removeItem(RECOVERY_KEY); } catch {} }
import {
  parseTime as parseSubTime, formatSrt, formatVtt, detectFormat,
} from '@/engines/subtitle';
import {
  StudioShell, StudioTopBar, StudioBody, StudioSidebar, StudioPanel,
  StudioButton, StudioSlider, StudioSelect,
  UndoStack, newProject, saveProject, loadProject, listProjects,
  type StudioProject, downloadBlob, safeFilename,
  useShortcuts, formatCombo,
  computeWaveformPeaksInWorker,
  readingSpeedCps, suggestCueSplit, repairCueTiming,
  SUBTITLE_STYLES, type SubtitleStylePreset,
  diarizeAudio, type SpeakerSegment,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
  EmptyState, pushToast,
  SharedDialog,
  TemplateGallery, type GalleryItem,
  SUBTITLE_TEMPLATES, SUBTITLE_TEMPLATE_CATEGORIES,
  materializeSubtitleTemplate, renderSubtitleThumb,
} from '@/lib/studios';

interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
  /** Per-word timings (for karaoke word-highlight + ASS \k tags). */
  words?: { text: string; start: number; end: number }[];
}

interface CueStyle {
  font: string;
  size: number;
  color: string;
  weight: number;
  italic: boolean;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  background: 'none' | 'box';
  bgColor: string;
  pos: 'top' | 'center' | 'bottom';
}

interface DocState {
  name: string;
  cues: Cue[];
  selectedId: string | null;
  style: CueStyle;
  fps: number;
  language: string;
}

let _id = 0;
const cid = () => `c${++_id}`;

const DEFAULT_STYLE: CueStyle = {
  font: 'Arial, sans-serif', size: 48, color: '#ffffff', weight: 700, italic: false,
  outline: true, outlineColor: '#000000', outlineWidth: 4,
  shadow: false, shadowColor: 'rgba(0,0,0,.8)', shadowBlur: 6,
  background: 'none', bgColor: 'rgba(0,0,0,.7)', pos: 'bottom',
};

const STYLE_PRESETS: { name: string; style: Partial<CueStyle> }[] = SUBTITLE_STYLES.map(p => ({
  name: p.name,
  style: {
    font: p.font, size: p.size, color: p.color, weight: p.weight, italic: p.italic,
    outline: p.outline, outlineColor: p.outlineColor, outlineWidth: p.outlineWidth,
    background: p.background, bgColor: p.bgColor, pos: p.pos,
  },
}));

const STYLE_CATEGORIES: SubtitleStylePreset['category'][] = ['streaming', 'social', 'cinema', 'broadcast', 'gaming', 'educational'];

const NEW_DOC = (): DocState => ({
  name: 'Untitled',
  cues: [],
  selectedId: null,
  style: { ...DEFAULT_STYLE },
  fps: 30,
  language: '',
});

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  cues: d.cues.map(c => ({ ...c })),
  style: { ...d.style },
});

function parseSrtVtt(text: string): Cue[] {
  const fmt = detectFormat(text);
  const out: Cue[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim() || /^WEBVTT/i.test(block)) continue;
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    let tIdx = 0;
    if (/^\d+$/.test(lines[0])) tIdx = 1;
    if (tIdx >= lines.length) continue;
    const tline = lines[tIdx];
    const m = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/.exec(tline);
    if (!m) continue;
    const start = parseSubTime(m[1]);
    const end = parseSubTime(m[2]);
    const txt = lines.slice(tIdx + 1).join('\n').trim();
    if (Number.isFinite(start) && Number.isFinite(end)) {
      out.push({ id: cid(), start, end, text: txt });
    }
  }
  return out;
}

function cuesToSrt(cs: Cue[]): string {
  return cs.map((c, i) => `${i + 1}\n${formatSrt(c.start)} --> ${formatSrt(c.end)}\n${c.text}\n`).join('\n');
}
function cuesToVtt(cs: Cue[]): string {
  return 'WEBVTT\n\n' + cs.map((c) => `${formatVtt(c.start)} --> ${formatVtt(c.end)}\n${c.text}\n`).join('\n');
}
function cuesToAss(cs: Cue[], style: CueStyle, w = 1920, h = 1080): string {
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${w}\nPlayResY: ${h}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Outline, Shadow, Alignment, MarginV\nStyle: Default,${style.font.split(',')[0]},${style.size},${assColor(style.color)},${assColor(style.outlineColor)},${assColor(style.bgColor)},${style.weight >= 700 ? -1 : 0},${style.italic ? -1 : 0},${style.outlineWidth},${style.shadow ? 1 : 0},${style.pos === 'top' ? 8 : style.pos === 'center' ? 5 : 2},40\n\n[Events]\nFormat: Layer, Start, End, Style, Text\n`;
  const events = cs.map(c => {
    // Emit \k karaoke tags (centiseconds per word) when word timings exist —
    // this is what players render as the word-by-word highlight.
    let body: string;
    if (c.words && c.words.length) {
      body = c.words.map(w => `{\\k${Math.max(1, Math.round((w.end - w.start) * 100))}}${w.text} `).join('').trimEnd();
    } else {
      body = c.text.replace(/\n/g, '\\N');
    }
    return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,${body}`;
  }).join('\n');
  return head + events;
}
function formatAssTime(s: number): string {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
function assColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return '&H00FFFFFF';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `&H00${[b, g, r].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

const fmtT = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

const computeWaveform = (file: File) => computeWaveformPeaksInWorker(file, 2000);

const LANGS: { code: string; name: string }[] = [
  { code: '', name: 'Auto-detect' }, { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' }, { code: 'de', name: 'German' }, { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' }, { code: 'ru', name: 'Russian' }, { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' }, { code: 'ko', name: 'Korean' }, { code: 'ar', name: 'Arabic' },
  { code: 'fa', name: 'Persian' }, { code: 'hi', name: 'Hindi' }, { code: 'tr', name: 'Turkish' },
];

export default function SubtitleStudioPro() {
  const { guard, gate } = useUsageGate('text');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const stack = React.useRef(new UndoStack<DocState>(80));
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  const commit = React.useCallback((label: string, next: DocState) => {
    next.cues.sort((a, b) => a.start - b.start);
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);

  const undo = () => { const p = stack.current.undo(cloneDoc(doc)); if (p) { setDoc(p); force(); } };
  const redo = () => { const p = stack.current.redo(); if (p) { setDoc(p); force(); } };

  // On mount: offer to restore a prior unsaved session if a fresh snapshot exists.
  React.useEffect(() => {
    const snap = readRecovery();
    if (snap && snap.doc.cues.length > 0) setRecovery(snap);
  }, []);

  // Autosave: 2s-debounced mirror of the working doc to the recovery key. Only
  // snapshots once there's real work (cues present) so an empty studio never
  // overwrites a meaningful recovery point. Runs purely on-device.
  const recoveryDirty = React.useRef(false);
  const quotaWarned = React.useRef(false);
  React.useEffect(() => {
    if (doc.cues.length === 0) return;
    recoveryDirty.current = true;
    const t = window.setTimeout(() => {
      const ok = writeRecovery(doc);
      recoveryDirty.current = false;
      // Warn ONCE if auto-save can't persist (quota/private mode) so the user
      // knows their work isn't being snapshotted and can export/save manually.
      if (!ok && !quotaWarned.current) { quotaWarned.current = true; toastFor('Auto-save failed (storage full) — export or save your project manually'); }
      else if (ok) quotaWarned.current = false;
    }, 2000);
    return () => window.clearTimeout(t);
  }, [doc]);
  // Flush a pending snapshot synchronously on tab hide / unload so a crash right
  // after an edit (inside the 2s debounce window) still recovers.
  React.useEffect(() => {
    const flush = () => { if (recoveryDirty.current && doc.cues.length > 0) writeRecovery(doc); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); };
  }, [doc]);

  const restoreRecovery = () => {
    if (!recovery) return;
    const restored = cloneDoc(recovery.doc);
    setDoc(restored);
    stack.current.reset(cloneDoc(restored), 'recover');
    force();
    setRecovery(null);
    toastFor(`Recovered ${restored.cues.length} cues from your last session`);
  };
  const dismissRecovery = () => { setRecovery(null); clearRecovery(); };

  const [mediaUrl, setMediaUrl] = React.useState('');
  const [mediaFile, setMediaFile] = React.useState<File | null>(null);
  const [waveform, setWaveform] = React.useState<{ peaks: Float32Array; duration: number; sampleRate: number } | null>(null);
  const [audioBuffer, setAudioBuffer] = React.useState<AudioBuffer | null>(null);
  const [speakerSegments, setSpeakerSegments] = React.useState<SpeakerSegment[]>([]);
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [karaoke, setKaraoke] = React.useState(false);
  const [zoom, setZoom] = React.useState(40);
  const [snap, setSnap] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [toast, setToast] = React.useState('');
  const [transcribeDialog, setTranscribeDialog] = React.useState(false);
  const [exportDialog, setExportDialog] = React.useState(false);
  const [importDialog, setImportDialog] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [templateCat, setTemplateCat] = React.useState<string>('all');
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [transcribeSize, setTranscribeSize] = React.useState<'tiny' | 'base' | 'small'>('tiny');
  const [exportFmt, setExportFmt] = React.useState<'srt' | 'vtt' | 'ass' | 'json'>('srt');
  // Crash-recovery banner: surfaced on mount if a fresh snapshot from a previous
  // session exists. Restoring re-hydrates the doc + resets the undo stack.
  const [recovery, setRecovery] = React.useState<RecoverySnapshot | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const isVideo = mediaFile?.type.startsWith('video/');
  const isAudio = mediaFile?.type.startsWith('audio/');

  const toastFor = (m: string) => { pushToast(m); };

  React.useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);

  const loadMedia = async (file: File) => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaFile(file);
    setMediaUrl(URL.createObjectURL(file));
    setBusy('Analyzing audio…');
    try {
      const w = await computeWaveform(file);
      setWaveform(w);
      try {
        const ab = await file.arrayBuffer();
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new Ctx();
        try {
          const buf = await ctx.decodeAudioData(ab.slice(0));
          setAudioBuffer(buf);
        } finally {
          // Decode-only context — close it so we don't leak. Browsers cap
          // concurrent AudioContexts (~6 on Chrome) and previously this would
          // silently fail after ~6 imports.
          try { await ctx.close(); } catch {}
        }
      } catch {}
      setSpeakerSegments([]);
    } catch (e) {
      toastFor('Could not read audio');
    } finally {
      setBusy('');
    }
  };

  const runDiarization = async () => {
    if (!audioBuffer) { toastFor('Import media first'); return; }
    setBusy('Detecting speakers…');
    try {
      const segs = await diarizeAudio(audioBuffer);
      setSpeakerSegments(segs);
      const uniqueSpeakers = new Set(segs.map(s => s.speaker));
      toastFor(`Found ${uniqueSpeakers.size} speaker${uniqueSpeakers.size === 1 ? '' : 's'} across ${segs.length} segments`);
    } catch (e) {
      toastFor((e as Error).message || 'Diarization failed');
    } finally {
      setBusy('');
    }
  };

  const labelCuesWithSpeakers = () => {
    if (!speakerSegments.length) { toastFor('Run speaker detection first'); return; }
    const next = cloneDoc(doc);
    for (const c of next.cues) {
      const mid = (c.start + c.end) / 2;
      const seg = speakerSegments.find(s => mid >= s.start && mid <= s.end);
      if (seg) {
        const prefix = `[${seg.speaker}] `;
        if (!c.text.startsWith('[')) c.text = prefix + c.text;
      }
    }
    commit('label speakers', next);
    toastFor('Labeled cues with speakers');
  };

  const importSubsFile = async (file: File) => {
    setRecovery(null); // importing real subtitles supersedes the recover-last-session offer
    const txt = await file.text();
    try {
      const cs = parseSrtVtt(txt);
      const next = cloneDoc(doc);
      next.cues = cs;
      next.name = file.name.replace(/\.[^.]+$/, '');
      commit('import', next);
      toastFor(`Imported ${cs.length} cues`);
    } catch {
      toastFor('Could not parse subtitles');
    }
  };

  const importMedia = async (files: FileList | File[]) => {
    setRecovery(null); // importing real media supersedes the recover-last-session offer
    const arr = Array.from(files);
    for (const f of arr) {
      if (f.type.startsWith('video/') || f.type.startsWith('audio/')) {
        await loadMedia(f);
      } else if (/\.(srt|vtt|ass)$/i.test(f.name)) {
        await importSubsFile(f);
      }
    }
  };

  // Import subtitle text (SRT/VTT/ASS body) pasted or dropped as raw text.
  const importSubsText = (txt: string, source = 'clipboard') => {
    const cs = parseSrtVtt(txt);
    if (!cs.length) { toastFor('No timed cues found in pasted text'); return false; }
    const next = cloneDoc(doc);
    next.cues = cs;
    commit('paste subs', next);
    toastFor(`Pasted ${cs.length} cues from ${source}`);
    return true;
  };

  // Explicit "Paste" button path — reads SRT/VTT text via the async Clipboard API
  // (the global listener only fires on a real Ctrl+V keystroke).
  const pasteFromClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt) { toastFor('Clipboard is empty'); return; }
      if (!/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(txt)) { toastFor('Clipboard has no timed subtitles'); return; }
      importSubsText(txt);
    } catch {
      toastFor('Clipboard access blocked — copy subtitles and press Ctrl+V instead');
    }
  };

  // Clipboard paste: drop a copied media file OR pasted SRT/VTT text straight into
  // the studio — no file picker. Ignored while typing in a field so Ctrl+V still
  // works for normal text editing. (CapCut/Aegisub can't do this; we can.)
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const dt = e.clipboardData;
      if (!dt) return;
      // 1) a pasted media/subtitle file
      const files: File[] = [];
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); }
      }
      const media = files.find(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
      const subFile = files.find(f => /\.(srt|vtt|ass)$/i.test(f.name));
      if (media) { e.preventDefault(); void loadMedia(media); toastFor('Pasted media from clipboard'); return; }
      if (subFile) { e.preventDefault(); void importSubsFile(subFile); return; }
      // 2) pasted subtitle text (looks timecoded)
      const text = dt.getData('text/plain');
      if (text && /\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(text)) {
        e.preventDefault();
        importSubsText(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [doc]);

  const runTranscribe = async () => {
    if (!mediaFile) { toastFor('Import media first'); return; }
    if (!(await guard())) return;
    setBusy('Loading model…');
    setProgress(0);
    setTranscribeDialog(false);
    try {
      const mod = await import('@/engines/transcribe');
      const res = await mod.transcribe(mediaFile, {
        size: transcribeSize,
        language: doc.language || undefined,
        // Word-level timing so we can do karaoke highlight + ASS \k tags. We
        // group the words back into readable cues below. (Was hardcoded false,
        // which threw away the word times the engine can produce.)
        wordTimestamps: true,
        onProgress: (p) => {
          setBusy(p.phase || 'Transcribing…');
          setProgress(Math.round((p.ratio || 0) * 100));
        },
      });
      // Group word chunks into cues: break on a long pause (>0.6s) or when a cue
      // gets long (~7 words / ~3.5s), keeping each word's timing for karaoke.
      const words = res.chunks.map(c => ({ text: (c.text || '').trim(), start: c.start, end: c.end })).filter(w => w.text);
      const cs: Cue[] = [];
      let cur: typeof words = [];
      const flush = () => {
        if (!cur.length) return;
        cs.push({ id: cid(), start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map(w => w.text).join(' '), words: cur });
        cur = [];
      };
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const prev = cur[cur.length - 1];
        const gap = prev ? w.start - prev.end : 0;
        if (cur.length && (gap > 0.6 || cur.length >= 7 || (w.end - cur[0].start) > 3.5)) flush();
        cur.push(w);
      }
      flush();
      const next = cloneDoc(doc);
      next.cues = cs;
      commit('transcribe', next);
      toastFor(`Transcribed ${cs.length} cues — on-device, with word timing`);
    } catch (e) {
      toastFor((e as Error).message || 'Transcribe failed');
    } finally {
      setBusy('');
      setProgress(0);
    }
  };

  const addCue = () => {
    const next = cloneDoc(doc);
    const start = time;
    const end = start + 2;
    const c: Cue = { id: cid(), start, end, text: 'New cue' };
    next.cues.push(c);
    next.selectedId = c.id;
    commit('add cue', next);
  };

  const updateCue = (id: string, mut: (c: Cue) => void, label = 'edit cue') => {
    const next = cloneDoc(doc);
    const c = next.cues.find(x => x.id === id);
    if (!c) return;
    mut(c);
    if (c.end < c.start + 0.1) c.end = c.start + 0.1;
    commit(label, next);
  };

  const deleteCue = (id: string) => {
    const next = cloneDoc(doc);
    next.cues = next.cues.filter(c => c.id !== id);
    if (next.selectedId === id) next.selectedId = null;
    commit('delete cue', next);
  };

  const splitAtTime = (id: string, t: number) => {
    const next = cloneDoc(doc);
    const c = next.cues.find(x => x.id === id);
    if (!c || t <= c.start + 0.1 || t >= c.end - 0.1) return;
    const old = { ...c, words: c.words ? c.words.map(w => ({ ...w })) : undefined };
    // Split the TEXT too — not just the timing. Previously both halves kept the
    // full text, so a "split" duplicated the line. If we have word timings, cut
    // on the word boundary at t and reflow each half's words; otherwise split
    // the text proportionally to where t falls in the cue.
    let leftText = old.text, rightText = old.text;
    let leftWords: Cue['words'], rightWords: Cue['words'];
    if (old.words && old.words.length) {
      const left = old.words.filter(w => w.start < t);
      const right = old.words.filter(w => w.start >= t);
      // Guard against an empty side (t before first / after last word).
      if (left.length && right.length) {
        leftWords = left; rightWords = right;
        leftText = left.map(w => w.text).join(' ').trim();
        rightText = right.map(w => w.text).join(' ').trim();
      }
    } else {
      const ratio = (t - old.start) / Math.max(0.001, old.end - old.start);
      // Snap the cut to the nearest word boundary so we never split mid-word.
      const approx = Math.round(old.text.length * ratio);
      let cut = old.text.lastIndexOf(' ', approx);
      if (cut <= 0) cut = old.text.indexOf(' ', approx);
      if (cut > 0 && cut < old.text.length) {
        leftText = old.text.slice(0, cut).trim();
        rightText = old.text.slice(cut).trim();
      }
    }
    c.end = t;
    c.text = leftText;
    if (leftWords) c.words = leftWords;
    next.cues.push({ id: cid(), start: t, end: old.end, text: rightText, words: rightWords });
    commit('split', next);
  };

  const mergeWithNext = (id: string) => {
    const next = cloneDoc(doc);
    const idx = next.cues.findIndex(c => c.id === id);
    if (idx < 0 || idx >= next.cues.length - 1) return;
    const a = next.cues[idx], b = next.cues[idx + 1];
    a.end = b.end;
    a.text = `${a.text}\n${b.text}`.trim();
    next.cues.splice(idx + 1, 1);
    commit('merge', next);
  };

  // The cue immediately following the selected one in timeline order (or null).
  const followingCue = (id: string | null): Cue | null => {
    if (!id) return null;
    const ordered = [...doc.cues].sort((a, b) => a.start - b.start);
    const idx = ordered.findIndex(c => c.id === id);
    return idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  };

  // Merge the selected cue with the next cue (timeline order): text joined with a
  // space, start = first cue's start, end = second cue's end, drop the second.
  const mergeWithFollowing = (id: string) => {
    const ordered = [...doc.cues].sort((a, b) => a.start - b.start);
    const idx = ordered.findIndex(c => c.id === id);
    if (idx < 0 || idx >= ordered.length - 1) return;
    const a = ordered[idx], b = ordered[idx + 1];
    const next = cloneDoc(doc);
    const ai = next.cues.findIndex(c => c.id === a.id);
    if (ai < 0) return;
    next.cues[ai] = { ...next.cues[ai], start: a.start, end: b.end, text: `${a.text} ${b.text}`.trim() };
    next.cues = next.cues.filter(c => c.id !== b.id).sort((x, y) => x.start - y.start);
    next.selectedId = a.id;
    commit('merge down', next);
  };

  // --- Commit-and-advance timing loop (Aegisub's biggest speed multiplier) ---
  // Select the next / previous cue (by timeline order) and seek to its start, so a
  // power user can ride down the whole file on the keyboard without the mouse.
  const selectAdjacent = (dir: 1 | -1) => {
    if (!doc.cues.length) return;
    const ordered = [...doc.cues].sort((a, b) => a.start - b.start);
    const idx = ordered.findIndex(c => c.id === doc.selectedId);
    let nextIdx: number;
    if (idx < 0) nextIdx = dir > 0 ? 0 : ordered.length - 1;
    else nextIdx = Math.max(0, Math.min(ordered.length - 1, idx + dir));
    const target = ordered[nextIdx];
    if (!target) return;
    setDoc(d => ({ ...d, selectedId: target.id }));
    seek(target.start);
  };

  // Set the selected cue's in-point (q) / out-point (w) to the current playhead.
  const setEdgeToPlayhead = (edge: 'l' | 'r') => {
    if (!doc.selectedId) { toastFor('Select a cue first'); return; }
    updateCue(doc.selectedId, c => {
      if (edge === 'l') c.start = Math.min(time, c.end - 0.1);
      else c.end = Math.max(time, c.start + 0.1);
    }, edge === 'l' ? 'set in' : 'set out');
  };

  // Pro one-click timing repair (Aegisub "Fix Timing" / CapCut): clamp overlaps,
  // enforce min duration + min gap, fix negative durations — across all cues.
  const fixTiming = () => {
    if (doc.cues.length < 1) { toastFor('No cues to fix'); return; }
    const res = repairCueTiming(doc.cues, { minDuration: 0.5, minGap: 0.04 });
    if (!res.fixed) { toastFor('Timing is already clean ✓'); return; }
    const next = cloneDoc(doc);
    // res.cues is sorted+repaired; map back by id preserving everything else.
    const byId = new Map(res.cues.map(c => [c.id, c]));
    next.cues = next.cues.map(c => { const r = byId.get(c.id); return r ? { ...c, start: r.start, end: r.end } : c; }).sort((a, b) => a.start - b.start);
    const counts = res.issues.reduce((m, i) => (m[i.kind] = (m[i.kind] || 0) + 1, m), {} as Record<string, number>);
    const parts = Object.entries(counts).map(([k, n]) => `${n} ${k.replace('-', ' ')}`);
    commit('fix timing', next);
    toastFor(`Fixed ${res.fixed}: ${parts.join(', ')}`);
  };

  // Pro batch timing (Aegisub "Shift Times" / "Resample"): apply a time transform to
  // every cue — or just the selected cue when one is picked — clamp end>start, re-sort.
  // `xform` maps each timestamp through the same function so word-timings stay coherent.
  const batchTiming = (label: string, xform: (t: number) => number) => {
    if (!doc.cues.length) { toastFor('No cues to adjust'); return; }
    const next = cloneDoc(doc);
    const sel = doc.selectedId;
    const targets = sel && next.cues.some(c => c.id === sel) ? next.cues.filter(c => c.id === sel) : next.cues;
    let touched = 0;
    for (const c of targets) {
      const ns = Math.max(0, xform(c.start));
      const ne = Math.max(ns + 0.1, xform(c.end)); // clamp end > start
      c.start = ns;
      c.end = ne;
      if (c.words) c.words = c.words.map(w => ({ ...w, start: Math.max(0, xform(w.start)), end: Math.max(0, xform(w.end)) }));
      touched++;
    }
    next.cues.sort((a, b) => a.start - b.start);
    commit(label, next);
    toastFor(`${label} · ${touched} cue${touched === 1 ? '' : 's'}${sel && targets.length === 1 ? ' (selected)' : ''}`);
  };
  // Shift all/selected cues forward or back by a fixed delta.
  const shiftTiming = (delta: number) => batchTiming(delta >= 0 ? `shift +${delta.toFixed(1)}s` : `shift ${delta.toFixed(1)}s`, t => t + delta);
  // Scale all/selected cue times by a factor (framerate conversion / tempo match).
  const scaleTiming = (factor: number) => batchTiming(factor > 1 ? 'slower' : 'faster', t => t * factor);

  // Play just the active cue's region, then auto-pause at its out-point — the
  // "tap to play it back to confirm timing" half of the loop.
  const regionStop = React.useRef<number | null>(null);
  const playRegion = (from: number, to: number) => {
    const el = (isVideo ? videoRef.current : audioRef.current) as (HTMLMediaElement | null);
    if (!el) return;
    if (regionStop.current != null) { window.clearTimeout(regionStop.current); regionStop.current = null; }
    seek(Math.max(0, from));
    el.play().catch(() => {});
    setPlaying(true);
    const ms = Math.max(60, (to - from) * 1000);
    regionStop.current = window.setTimeout(() => { el.pause(); setPlaying(false); regionStop.current = null; }, ms);
  };
  const playSelectedRegion = () => {
    const c = doc.cues.find(x => x.id === doc.selectedId);
    if (!c) { toastFor('Select a cue first'); return; }
    playRegion(c.start, c.end);
  };
  // Play the last 500ms up to the out-point — confirm the tail lands right.
  const playOutPoint = () => {
    const c = doc.cues.find(x => x.id === doc.selectedId);
    if (!c) { toastFor('Select a cue first'); return; }
    playRegion(Math.max(c.start, c.end - 0.5), c.end);
  };
  // Commit the current cue and advance to the next — the green-check loop. If on
  // the last cue, append a fresh one at the playhead so dictation keeps flowing.
  const commitAndAdvance = () => {
    if (!doc.cues.length) { addCue(); return; }
    const ordered = [...doc.cues].sort((a, b) => a.start - b.start);
    const idx = ordered.findIndex(c => c.id === doc.selectedId);
    if (idx >= 0 && idx < ordered.length - 1) {
      const target = ordered[idx + 1];
      setDoc(d => ({ ...d, selectedId: target.id }));
      seek(target.start);
    } else {
      addCue();
    }
  };
  React.useEffect(() => () => { if (regionStop.current != null) window.clearTimeout(regionStop.current); }, []);

  const shiftAll = (delta: number) => {
    const next = cloneDoc(doc);
    for (const c of next.cues) { c.start += delta; c.end += delta; }
    commit('shift', next);
  };

  const autoSplitLong = () => {
    const next = cloneDoc(doc);
    const newCues: Cue[] = [];
    for (const c of next.cues) {
      const split = suggestCueSplit(c, 21);
      if (split) {
        newCues.push({ id: cid(), start: split.keep.start, end: split.keep.end, text: split.keep.text });
        newCues.push({ id: cid(), start: split.new.start, end: split.new.end, text: split.new.text });
      } else {
        newCues.push(c);
      }
    }
    const fixedCount = newCues.length - next.cues.length;
    next.cues = newCues;
    commit('auto split', next);
    toastFor(fixedCount > 0 ? `Split ${fixedCount} long cue${fixedCount === 1 ? '' : 's'}` : 'No cues needed splitting');
  };

  // Pro batch action: auto-extend cues that read too fast (CPS > 21) by pushing
  // their out-point later until they hit the comfortable reading speed — without
  // overlapping the next cue (clamp to next.start minus a small gap).
  const MAX_READ_CPS = 21;
  const fixReadingSpeed = () => {
    if (!doc.cues.length) { toastFor('No cues to fix'); return; }
    const next = cloneDoc(doc);
    next.cues.sort((a, b) => a.start - b.start);
    const GAP = 0.04; // keep a small gap before the following cue
    let fixed = 0;
    for (let i = 0; i < next.cues.length; i++) {
      const c = next.cues[i];
      if (readingSpeedCps(c) <= MAX_READ_CPS) continue;
      // Duration needed so CPS drops to the max comfortable reading speed.
      const needEnd = c.start + c.text.length / MAX_READ_CPS;
      const nextStart = next.cues[i + 1]?.start;
      const limit = nextStart != null ? nextStart - GAP : Infinity;
      const ne = Math.max(c.end, Math.min(needEnd, limit));
      if (ne > c.end + 1e-4) {
        c.end = ne;
        if (c.words && c.words.length) {
          // Keep the last word's out-point aligned with the extended cue end so
          // karaoke/word timing stays coherent.
          const lw = c.words[c.words.length - 1];
          if (lw.end < ne) lw.end = ne;
        }
        fixed++;
      }
    }
    if (!fixed) { toastFor('Reading speed is already comfortable ✓'); return; }
    next.cues.sort((a, b) => a.start - b.start);
    commit('fix CPS', next);
    toastFor(`Extended ${fixed} fast cue${fixed === 1 ? '' : 's'} to ≤${MAX_READ_CPS} chars/sec`);
  };

  // Re-sort cues by start time and reset the per-block index numbering — the SRT
  // index is always emitted as i+1 on export (cuesToSrt), but this makes the
  // working order explicit + deterministic after lots of splits/merges/edits.
  const reindexCues = () => {
    if (!doc.cues.length) { toastFor('No cues to re-index'); return; }
    const next = cloneDoc(doc);
    next.cues.sort((a, b) => a.start - b.start);
    commit('re-index', next);
    toastFor(`Re-indexed ${next.cues.length} cue${next.cues.length === 1 ? '' : 's'} in timeline order`);
  };

  // Shift every cue so the first one starts at exactly 0:00 (kills the leading
  // dead-air auto-transcribe often leaves; word timings stay coherent).
  const zeroFirstCue = () => {
    if (!doc.cues.length) { toastFor('No cues to align'); return; }
    const first = Math.min(...doc.cues.map(c => c.start));
    if (first <= 1e-4) { toastFor('First cue already starts at 0:00 ✓'); return; }
    const next = cloneDoc(doc);
    for (const c of next.cues) {
      c.start = Math.max(0, c.start - first);
      c.end = Math.max(c.start + 0.1, c.end - first);
      if (c.words) c.words = c.words.map(w => ({ ...w, start: Math.max(0, w.start - first), end: Math.max(0, w.end - first) }));
    }
    next.cues.sort((a, b) => a.start - b.start);
    commit('zero first cue', next);
    toastFor(`Shifted everything back ${first.toFixed(2)}s — first cue now at 0:00`);
  };

  const translateAll = async () => {
    const targetLang = window.prompt('Translate to language code (e.g. es, fr, de, ja):', 'es');
    if (!targetLang) return;
    if (!(await guard())) return;
    setBusy('Translating…');
    try {
      let translator: any = null;
      try {
        const W = window as any;
        if (W.translation?.createTranslator) translator = await W.translation.createTranslator({ sourceLanguage: doc.language || 'en', targetLanguage: targetLang });
        else if (W.Translator?.create) translator = await W.Translator.create({ sourceLanguage: doc.language || 'en', targetLanguage: targetLang });
      } catch {}
      const next = cloneDoc(doc);
      for (let i = 0; i < next.cues.length; i++) {
        setProgress(Math.round((i / next.cues.length) * 100));
        const c = next.cues[i];
        if (translator?.translate) {
          try { c.text = await translator.translate(c.text); } catch {}
        }
      }
      commit('translate', next);
      toastFor(translator ? `Translated to ${targetLang}` : 'Browser translation unavailable on this device');
    } catch (e) {
      toastFor((e as Error).message || 'Translation failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const seek = (t: number) => {
    setTime(Math.max(0, t));
    const el = (isVideo ? videoRef.current : audioRef.current) as (HTMLMediaElement | null);
    if (el && isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(t, el.duration));
  };

  const togglePlay = () => {
    const el = (isVideo ? videoRef.current : audioRef.current) as (HTMLMediaElement | null);
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setPlaying(true); }
    else { el.pause(); setPlaying(false); }
  };

  React.useEffect(() => {
    const el = (isVideo ? videoRef.current : audioRef.current) as (HTMLMediaElement | null);
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [mediaUrl, isVideo]);

  const activeCue = doc.cues.find(c => c.start <= time && c.end > time) ?? null;
  const cuesHaveWords = doc.cues.some(c => c.words && c.words.length);
  const selectedCue = doc.cues.find(c => c.id === doc.selectedId) ?? null;
  // Total program duration = the last cue's out-point (end of the timeline). Shown
  // as the toolbar "Σ N cues · M:SS total" readout.
  const totalDuration = doc.cues.length ? Math.max(...doc.cues.map(c => c.end)) : 0;
  const fmtMSS = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };
  // Can we split the selected cue right here? Only when a cue is selected AND the
  // playhead is strictly inside it (matches splitAtTime's own 0.1s guard).
  const canSplitHere = !!selectedCue && time > selectedCue.start + 0.1 && time < selectedCue.end - 0.1;

  // Word-level retime: which word (index) of the selected cue is being tuned.
  // Rivals' auto-captioners give you a flat block; per-word timing is the
  // precision feature that makes karaoke/highlight land exactly on the beat.
  const [selWord, setSelWord] = React.useState(0);
  React.useEffect(() => { setSelWord(0); }, [doc.selectedId]);
  // Set the selected word's start or end to the current playhead, keeping
  // neighbors consistent (a word can't start before the previous ends, etc.)
  // and the edit clamped inside the cue.
  const setWordEdge = (edge: 'start' | 'end', t: number) => {
    if (!selectedCue?.words || !selectedCue.words[selWord]) return;
    updateCue(selectedCue.id, c => {
      const ws = c.words!; const i = selWord; const w = ws[i];
      const lo = i > 0 ? ws[i - 1].end : c.start;
      const hi = i < ws.length - 1 ? ws[i + 1].start : c.end;
      const clamped = Math.max(lo, Math.min(hi, t));
      if (edge === 'start') w.start = Math.min(clamped, w.end - 0.02);
      else w.end = Math.max(clamped, w.start + 0.02);
    }, 'retime word');
  };

  const exportNow = async () => {
    const fmtHit = checkFormat(POLICY_KEY, exportFmt, isPro);
    if (fmtHit) { policyGate.fire(fmtHit); return; }
    if (!(await guard())) return;
    let blob: Blob;
    let ext = exportFmt;
    if (exportFmt === 'srt') blob = new Blob([cuesToSrt(doc.cues)], { type: 'application/x-subrip' });
    else if (exportFmt === 'vtt') blob = new Blob([cuesToVtt(doc.cues)], { type: 'text/vtt' });
    else if (exportFmt === 'ass') blob = new Blob([cuesToAss(doc.cues, doc.style)], { type: 'text/plain' });
    else { blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }); ext = 'json'; }
    downloadBlob(blob, `${safeFilename(doc.name)}.${ext}`);
    toastFor('Exported');
    setExportDialog(false);
  };

  // Burn the cues INTO the source video (hard-subs) — the output the category is
  // actually bought for. Reuses the existing engines/subtitle burnCaptions
  // (ffmpeg overlay of rendered caption PNGs). Needs the loaded source video.
  const burnIntoVideo = async () => {
    if (!mediaFile || !/^video\//.test(mediaFile.type)) { toastFor('Load a video first (left panel) to burn captions in'); return; }
    if (!doc.cues.length) { toastFor('No cues to burn'); return; }
    if (!(await guard())) return;
    setBusy('Burning captions into video…');
    setProgress(0);
    try {
      const { burnCaptions } = await import('@/engines/subtitle/auto');
      // Probe the source video's pixel dimensions (burnCaptions sizes the
      // caption PNGs to the frame).
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = () => resolve({ w: v.videoWidth || 1920, h: v.videoHeight || 1080 });
        v.onerror = () => resolve({ w: 1920, h: 1080 });
        v.src = URL.createObjectURL(mediaFile);
      });
      const chunks = doc.cues.map(c => ({ start: c.start, end: c.end, text: c.text }));
      const s = doc.style;
      const blob = await burnCaptions(mediaFile, chunks, dims.w, dims.h, {
        fontSize: s.size,
        color: s.color,
        highlight: s.background === 'box',
        position: s.pos,
        uppercase: false,
      }, (r: number) => setProgress(Math.round(r * 100)));
      downloadBlob(blob, `${safeFilename(doc.name)}-captioned.mp4`);
      toastFor('Exported captioned video');
      setExportDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Burn-in failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const proj = newProject('subtitle', doc.name, doc);
      await saveProject(proj);
      toastFor('Saved');
    } finally { setBusy(''); }
  };

  const openSaved = async () => {
    const list = await listProjects('subtitle');
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

  const applySubtitleTemplate = (id: string) => {
    const tpl = SUBTITLE_TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    const next = materializeSubtitleTemplate(tpl) as unknown as DocState;
    setDoc(next);
    stack.current.reset(cloneDoc(next), 'template');
    setTemplatesOpen(false);
    pushToast(`Started from "${tpl.name}" — import media to preview`);
  };

  const subtitleTemplateItems = React.useMemo<GalleryItem[]>(() => SUBTITLE_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    thumb: renderSubtitleThumb(t),
    meta: [`${t.cues.length} cues`],
  })), []);

  const frameStep = 1 / Math.max(1, doc.fps);

  useRegisterShortcuts([
    {
      label: 'Playback',
      items: [
        { combo: ' ', description: 'Play / Pause' },
        { combo: 'left', description: `Step back 1 frame (${(frameStep * 1000).toFixed(0)}ms)` },
        { combo: 'right', description: `Step forward 1 frame` },
        { combo: 'shift+left', description: 'Seek back 0.5s' },
        { combo: 'shift+right', description: 'Seek forward 0.5s' },
        { combo: 'home', description: 'Jump to start' },
        { combo: 'end', description: 'Jump to end' },
      ],
    },
    {
      label: 'Cues',
      items: [
        { combo: 'enter', description: 'Add new cue at playhead' },
        { combo: 's', description: 'Split cue at playhead' },
        { combo: 'm', description: 'Merge with next cue' },
        { combo: 'delete', description: 'Delete selected cue' },
        { combo: 'tab', description: 'Select next cue (seek to it)' },
        { combo: 'shift+tab', description: 'Select previous cue' },
      ],
    },
    {
      label: 'Timing loop',
      items: [
        { combo: 'q', description: 'Set in-point to playhead' },
        { combo: 'w', description: 'Set out-point to playhead' },
        { combo: 'r', description: 'Play selected cue region' },
        { combo: 't', description: 'Play last 0.5s (confirm out-point)' },
        { combo: 'g', description: 'Commit + advance to next cue' },
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
    { combo: 'enter', handler: addCue },
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'delete', handler: () => doc.selectedId && deleteCue(doc.selectedId) },
    { combo: 'backspace', handler: () => doc.selectedId && deleteCue(doc.selectedId) },
    { combo: 's', handler: () => doc.selectedId && splitAtTime(doc.selectedId, time) },
    { combo: 'm', handler: () => doc.selectedId && mergeWithNext(doc.selectedId) },
    { combo: 'tab', handler: () => selectAdjacent(1) },
    { combo: 'shift+tab', handler: () => selectAdjacent(-1) },
    { combo: 'q', handler: () => setEdgeToPlayhead('l') },
    { combo: 'w', handler: () => setEdgeToPlayhead('r') },
    { combo: 'r', handler: playSelectedRegion },
    { combo: 't', handler: playOutPoint },
    { combo: 'g', handler: commitAndAdvance },
    { combo: 'left', handler: () => seek(time - frameStep) },
    { combo: 'right', handler: () => seek(time + frameStep) },
    { combo: 'shift+left', handler: () => seek(time - 0.5) },
    { combo: 'shift+right', handler: () => seek(time + 0.5) },
    { combo: 'home', handler: () => seek(0) },
    { combo: 'end', handler: () => seek(waveform?.duration ?? 0) },
  ]);

  return (
    <StudioShell>
      {policyGate.element}
      {recovery && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
          <RotateCcw className="h-3.5 w-3.5 text-amber-300" />
          <span className="flex-1 truncate">
            Recovered an unsaved session — <span className="font-medium text-amber-50">{recovery.name || 'Untitled'}</span>, {recovery.cueCount} cue{recovery.cueCount === 1 ? '' : 's'} from {new Date(recovery.savedAt).toLocaleString()}.
          </span>
          <button onClick={restoreRecovery} className="rounded bg-amber-400/90 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-300">Restore</button>
          <button onClick={dismissRecovery} className="rounded px-2 py-1 text-[11px] text-amber-200 hover:bg-white/10">Dismiss</button>
        </div>
      )}
      <StudioTopBar
        title="Subtitle Studio Pro"
        left={
          <>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Media
              <input type="file" accept="video/*,audio/*" className="hidden" onChange={e => e.target.files && importMedia(e.target.files)} />
            </label>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <FileText className="h-3.5 w-3.5" /> Subs
              <input type="file" accept=".srt,.vtt,.ass,.txt" className="hidden" onChange={e => e.target.files?.[0] && importSubsFile(e.target.files[0])} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={pasteFromClipboard} title="Paste SRT/VTT text from clipboard (Ctrl+V)"><Clipboard className="h-3.5 w-3.5" /> Paste</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => setTranscribeDialog(true)} disabled={!mediaFile}><Wand2 className="h-3.5 w-3.5" /> Auto-transcribe</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => { setTemplateCat('all'); setTemplatesOpen(true); }} title="Templates"><LayoutTemplate className="h-3.5 w-3.5" /> Templates</StudioButton>
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

      <StudioBody>
        <StudioSidebar side="left" width={300} label="Cues" autoOpen={false}>
          <StudioPanel title="Cues">
            <div className="flex gap-1 pb-2">
              <StudioButton size="sm" variant="soft" onClick={addCue}><Plus className="h-3 w-3" /> Add</StudioButton>
              <StudioButton size="sm" variant="soft" onClick={() => doc.selectedId && splitAtTime(doc.selectedId, time)} disabled={!doc.selectedId}><Scissors className="h-3 w-3" /> Split</StudioButton>
              <StudioButton size="sm" variant="soft" onClick={() => doc.selectedId && mergeWithNext(doc.selectedId)} disabled={!doc.selectedId}><Copy className="h-3 w-3" /> Merge</StudioButton>
              <StudioButton size="sm" variant="soft" onClick={() => doc.selectedId && mergeWithFollowing(doc.selectedId)} disabled={!followingCue(doc.selectedId)}><ArrowDown className="h-3 w-3" /> Merge ↓</StudioButton>
              <StudioButton size="sm" variant="danger" onClick={() => doc.selectedId && deleteCue(doc.selectedId)} disabled={!doc.selectedId}><Trash2 className="h-3 w-3" /></StudioButton>
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {doc.cues.length === 0 && <div className="rounded bg-white/5 p-3 text-center text-xs text-zinc-500">No cues yet — auto-transcribe or click Add</div>}
              {doc.cues.map((c, i) => {
                const cps = readingSpeedCps(c);
                const tooFast = cps > 21;
                return (
                <div
                  key={c.id}
                  onClick={() => { setDoc(d => ({ ...d, selectedId: c.id })); seek(c.start); }}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' } as React.CSSProperties}
                  className={cn(
                    'cursor-pointer rounded border px-2 py-1.5',
                    doc.selectedId === c.id ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-white/5 bg-white/[.02] hover:bg-white/5',
                    activeCue?.id === c.id && 'ring-1 ring-cyan-300/40',
                    tooFast && 'border-l-2 border-l-amber-400',
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] tabular-nums text-zinc-500">
                    <span>#{i + 1}{tooFast && <span title="Too fast to read" className="ml-1 text-amber-400">⚡</span>}</span>
                    <span>{fmtT(c.start)} → {fmtT(c.end)} · {(c.end - c.start).toFixed(2)}s · {cps.toFixed(0)}cps</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-200">{c.text || <span className="text-zinc-500">(empty)</span>}</div>
                </div>
                );
              })}
            </div>
          </StudioPanel>
          <StudioPanel title="Bulk" defaultOpen={false}>
            <div className="space-y-1.5">
              <div className="flex gap-1">
                <StudioButton size="sm" variant="soft" onClick={() => shiftAll(-0.5)}>−0.5s</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => shiftAll(0.5)}>+0.5s</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => shiftAll(-0.1)}>−100ms</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => shiftAll(0.1)}>+100ms</StudioButton>
              </div>
            </div>
          </StudioPanel>
          <StudioPanel title="Smart fixes">
            <div className="space-y-1.5">
              <StudioButton size="sm" variant="soft" onClick={autoSplitLong}><Wand2 className="h-3 w-3" /> Auto-split long cues</StudioButton>
              <StudioButton size="sm" variant="soft" onClick={() => void translateAll()}><Wand2 className="h-3 w-3" /> Translate all…</StudioButton>
              <div className="rounded bg-white/5 p-2 text-[10px] text-zinc-400">
                {doc.cues.filter(c => readingSpeedCps(c) > 21).length} cues exceed 21 cps (too fast)
              </div>
            </div>
          </StudioPanel>
          <StudioPanel title="Speakers" defaultOpen={speakerSegments.length > 0}>
            <div className="space-y-1.5">
              <StudioButton size="sm" variant="soft" onClick={() => void runDiarization()} disabled={!audioBuffer}><Wand2 className="h-3 w-3" /> Detect speakers</StudioButton>
              {speakerSegments.length > 0 && (
                <>
                  <StudioButton size="sm" variant="soft" onClick={labelCuesWithSpeakers}><Wand2 className="h-3 w-3" /> Label cues with [A]/[B]/...</StudioButton>
                  <div className="rounded bg-white/5 p-2 text-[10px] text-zinc-400">
                    {new Set(speakerSegments.map(s => s.speaker)).size} speakers · {speakerSegments.length} segments
                  </div>
                </>
              )}
              <div className="rounded bg-white/5 p-2 text-[10px] text-zinc-500">
                Frame jog: ← / → step by {(frameStep * 1000).toFixed(0)}ms · Shift+← / → for 0.5s
              </div>
            </div>
          </StudioPanel>
        </StudioSidebar>

        <div className="flex flex-1 min-w-0 flex-col">
          <div className="flex min-w-0 items-center justify-center bg-[#0a0b0e] p-3">
            <div className="relative w-full max-w-[640px]">
              {isVideo ? (
                <video ref={videoRef} src={mediaUrl} className="block max-h-[40vh] rounded border border-white/10" />
              ) : isAudio ? (
                <div className="flex h-40 w-full max-w-[640px] items-center justify-center rounded border border-white/10 bg-black/50 text-zinc-500 text-sm">
                  <audio ref={audioRef} src={mediaUrl} />
                  Audio loaded — see waveform below
                </div>
              ) : doc.cues.length > 0 ? (
                // Cues exist but no media yet: the cues ARE the content now, so don't
                // dominate with the full "import media first" hero (it read as empty
                // even after a successful SRT import). Show a compact prompt to add a
                // video/audio for visual preview; the cue list/timeline below is live.
                <button
                  onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*,audio/*'; i.onchange = () => i.files && importMedia(i.files); i.click(); }}
                  className="flex h-40 w-full max-w-[640px] flex-col items-center justify-center gap-2 rounded border border-dashed border-white/10 bg-black/30 text-zinc-400 transition hover:border-cyan-400/40 hover:text-zinc-200"
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-sm font-medium">{doc.cues.length} cue{doc.cues.length === 1 ? '' : 's'} loaded — add a video or audio to preview</span>
                  <span className="text-[11px] text-zinc-500">Editing works without media; import to see captions on the frame</span>
                </button>
              ) : (
                <div className="w-full max-w-[640px] rounded border border-dashed border-white/10">
                  <EmptyState
                    icon={<FileText className="h-7 w-7" />}
                    title="Subtitle a video or audio"
                    description="Import media first — then auto-transcribe, edit cues, or import an existing SRT/VTT/ASS file."
                    actions={[
                      { label: 'Import video or audio', description: 'MP4, WebM, MP3, WAV, M4A...', icon: <Upload className="h-4 w-4" />, onClick: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*,audio/*'; i.onchange = () => i.files && importMedia(i.files); i.click(); }, primary: true },
                      { label: 'Import subtitles', description: 'SRT / VTT / ASS — keep existing timing', icon: <FileText className="h-4 w-4" />, onClick: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.srt,.vtt,.ass,.txt'; i.onchange = () => i.files?.[0] && importSubsFile(i.files[0]); i.click(); } },
                      { label: 'Start from a template', description: `${SUBTITLE_TEMPLATES.length} caption styles — TikTok, lyrics, interview…`, icon: <LayoutTemplate className="h-4 w-4" />, onClick: () => { setTemplateCat('all'); setTemplatesOpen(true); } },
                      { label: 'Paste subtitles', description: 'Ctrl+V an SRT/VTT you copied anywhere', icon: <Clipboard className="h-4 w-4" />, onClick: () => { void pasteFromClipboard(); } },
                      { label: 'Open saved project', description: 'Continue subtitling', icon: <FileText className="h-4 w-4" />, onClick: openSaved },
                    ]}
                    hints={[
                      { label: 'On-device AI transcribe', description: 'Whisper model runs locally, never uploads' },
                      { label: 'Frame-accurate jog', description: '← / → step by one frame; Shift+← / → seek 0.5s' },
                      { label: 'Keyboard timing loop', description: 'q/w set in/out · r preview · g commit + advance' },
                      { label: 'Autosave + recovery', description: 'Every edit is snapshotted locally — a crash never loses work' },
                    ]}
                  />
                </div>
              )}
              {activeCue && (
                <CuePreview cue={activeCue} style={doc.style} time={time} karaoke={karaoke} />
              )}
              {cuesHaveWords && (
                <button
                  onClick={() => setKaraoke(k => !k)}
                  className={cn('absolute right-2 top-2 rounded px-2 py-1 text-[11px] font-medium', karaoke ? 'bg-cyan-500 text-zinc-900' : 'bg-black/50 text-zinc-200')}
                  title="Highlight each word as it's spoken"
                >Karaoke {karaoke ? 'on' : 'off'}</button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto border-y border-white/5 bg-[#0f1115] px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:shrink-0 [&_button]:justify-center sm:[&_button]:min-h-0 sm:[&_button]:min-w-0">
            <button onClick={() => seek(0)} className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"><SkipBack className="h-4 w-4" /></button>
            <button onClick={togglePlay} className="rounded bg-cyan-500 p-1.5 text-zinc-900 hover:bg-cyan-400 disabled:opacity-40" disabled={!mediaFile}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={() => seek(waveform?.duration ?? 0)} className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"><SkipForward className="h-4 w-4" /></button>
            <span className="ml-3 text-xs tabular-nums text-zinc-300">{fmtT(time)} / {fmtT(waveform?.duration ?? 0)}</span>
            <div className="mx-2 h-4 w-px bg-white/10" />
            <button onClick={() => setSnap(s => !s)} title="Snap cue edges to neighbours · hold Alt while dragging for free placement" className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs', snap ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-400 hover:bg-white/5')}><Magnet className="h-3 w-3" /> Snap</button>
            <button onClick={fixTiming} title="Fix timing: clamp overlaps, enforce min duration + gap, fix negative durations across all cues" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><AlertTriangle className="h-3 w-3" /> Fix timing</button>
            <button onClick={fixReadingSpeed} title="Fix CPS: auto-extend cues that read too fast (>21 chars/sec) until they hit a comfortable reading speed, without overlapping the next cue" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><Wand2 className="h-3 w-3" /> Fix CPS</button>
            <div className="mx-1 h-4 w-px bg-white/10" />
            <button onClick={() => doc.selectedId && splitAtTime(doc.selectedId, time)} disabled={!canSplitHere} title={canSplitHere ? 'Split the selected cue into two at the playhead' : 'Select a cue and move the playhead inside it to split here'} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"><Scissors className="h-3 w-3" /> Split here</button>
            <button onClick={reindexCues} title="Re-sort cues by start time and renumber them 1…N in timeline order" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><FileText className="h-3 w-3" /> Re-index</button>
            <button onClick={zeroFirstCue} title="Shift everything so the first cue starts at exactly 0:00 (removes leading dead-air)" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><SkipBack className="h-3 w-3" /> First → 0</button>
            <div className="mx-1 h-4 w-px bg-white/10" />
            <button onClick={() => shiftTiming(-0.5)} title="Shift all cues (or the selected cue) 0.5s earlier" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><ChevronLeft className="h-3 w-3" /> Shift −0.5s</button>
            <button onClick={() => shiftTiming(0.5)} title="Shift all cues (or the selected cue) 0.5s later" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><ChevronRight className="h-3 w-3" /> Shift +0.5s</button>
            <button onClick={() => scaleTiming(1.04)} title="Scale all cue times ×1.04 — stretch timing 4% slower (e.g. framerate conversion)" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><Rewind className="h-3 w-3" /> Slower 4%</button>
            <button onClick={() => scaleTiming(0.96)} title="Scale all cue times ×0.96 — compress timing 4% faster (e.g. framerate conversion)" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"><FastForward className="h-3 w-3" /> Faster 4%</button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] tabular-nums text-zinc-400" title="Total cues · timeline length (end of the last cue)">Σ {doc.cues.length} cue{doc.cues.length === 1 ? '' : 's'} · {fmtMSS(totalDuration)} total</span>
              <div className="mx-1 h-4 w-px bg-white/10" />
              <button onClick={() => setZoom(z => Math.max(10, z / 1.25))} className="rounded p-1 text-zinc-400 hover:bg-white/5"><ZoomOut className="h-3.5 w-3.5" /></button>
              <span className="text-[10px] tabular-nums text-zinc-500">{Math.round(zoom)}px/s</span>
              <button onClick={() => setZoom(z => Math.min(400, z * 1.25))} className="rounded p-1 text-zinc-400 hover:bg-white/5"><ZoomIn className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <WaveformTimeline
            waveform={waveform}
            cues={doc.cues}
            selectedId={doc.selectedId}
            time={time}
            zoom={zoom}
            snap={snap}
            onSeek={seek}
            onSelect={(id) => setDoc(d => ({ ...d, selectedId: id }))}
            onMoveCue={(id, start) => updateCue(id, c => { const dur = c.end - c.start; c.start = start; c.end = start + dur; }, 'move cue')}
            onTrimCue={(id, edge, t) => updateCue(id, c => { if (edge === 'l') c.start = Math.min(t, c.end - 0.1); else c.end = Math.max(t, c.start + 0.1); }, 'trim cue')}
          />

          <div className="flex h-44 shrink-0 border-t border-white/5 bg-[#0c0d10]">
            <div className="flex w-full flex-col gap-1.5 p-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>Cue {doc.selectedId ? `#${doc.cues.findIndex(c => c.id === doc.selectedId) + 1}` : '—'}</span>
                {selectedCue ? (
                  <>
                    <span className="ml-2">Start</span>
                    <input type="number" step={0.01} value={selectedCue.start.toFixed(2)} onChange={e => updateCue(selectedCue.id, c => { c.start = +e.target.value; }, 'start')} className="h-6 w-20 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-right tabular-nums" />
                    <span>End</span>
                    <input type="number" step={0.01} value={selectedCue.end.toFixed(2)} onChange={e => updateCue(selectedCue.id, c => { c.end = +e.target.value; }, 'end')} className="h-6 w-20 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-right tabular-nums" />
                    <span>Dur {(selectedCue.end - selectedCue.start).toFixed(2)}s</span>
                  </>
                ) : <span className="text-zinc-600">Select a cue to edit</span>}
              </div>
              <textarea
                value={selectedCue?.text ?? ''}
                disabled={!selectedCue}
                onChange={e => selectedCue && updateCue(selectedCue.id, c => { c.text = e.target.value; }, 'text')}
                placeholder={selectedCue ? 'Type cue text — \\n for line break' : 'Select or add a cue first'}
                rows={3}
                className="flex-1 rounded border border-white/10 bg-[#0a0b0e] p-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50 disabled:opacity-40"
              />
              {/* Per-word timing editor — click a word, then set its start/end
                  to the playhead. The precision tool auto-captioners lack. */}
              {selectedCue?.words && selectedCue.words.length > 0 && (
                <div className="rounded border border-white/10 bg-[#0a0b0e] p-2">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Word timing (karaoke)</span>
                    <span className="tabular-nums">
                      {selectedCue.words[selWord] ? `${selectedCue.words[selWord].start.toFixed(2)}s → ${selectedCue.words[selWord].end.toFixed(2)}s` : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedCue.words.map((w, i) => {
                      const lit = time >= w.start && time < w.end;
                      return (
                        <button key={i} onClick={() => setSelWord(i)}
                          className={cn('rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors',
                            i === selWord ? 'bg-cyan-500 text-zinc-900' : lit ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>
                          {w.text}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <StudioButton size="sm" variant="soft" onClick={() => setWordEdge('start', time)} title="Set this word's start to the playhead">Start = playhead</StudioButton>
                    <StudioButton size="sm" variant="soft" onClick={() => setWordEdge('end', time)} title="Set this word's end to the playhead">End = playhead</StudioButton>
                    <StudioButton size="sm" variant="ghost" onClick={() => setWordEdge('start', (selectedCue.words![selWord]?.start ?? 0) - 0.05)} title="Nudge start −50ms">−50</StudioButton>
                    <StudioButton size="sm" variant="ghost" onClick={() => setWordEdge('start', (selectedCue.words![selWord]?.start ?? 0) + 0.05)} title="Nudge start +50ms">+50</StudioButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <StudioSidebar width={272} label="Style" autoOpen={false}>
          <StudioPanel title="Style presets">
            <div className="space-y-3">
              {STYLE_CATEGORIES.map(cat => {
                const inCat = SUBTITLE_STYLES.filter(s => s.category === cat);
                return (
                  <div key={cat}>
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">{cat}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {inCat.map(p => (
                        <button key={p.id} title={p.description}
                          onClick={() => commit('preset', { ...cloneDoc(doc), style: { ...doc.style,
                            font: p.font, size: p.size, color: p.color, weight: p.weight, italic: p.italic,
                            outline: p.outline, outlineColor: p.outlineColor, outlineWidth: p.outlineWidth,
                            background: p.background, bgColor: p.bgColor, pos: p.pos,
                          } })}
                          className="rounded bg-white/5 px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-white/10">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </StudioPanel>
          <StudioPanel title="Style controls" defaultOpen={false}>
            <div className="space-y-2">
              <StudioSelect value={doc.style.font} options={[
                { value: 'Arial, sans-serif', label: 'Arial' },
                { value: 'Georgia, serif', label: 'Georgia' },
                { value: 'Impact, sans-serif', label: 'Impact' },
                { value: 'Courier New, monospace', label: 'Courier' },
                { value: 'Times New Roman, serif', label: 'Times' },
              ]} onChange={v => commit('font', { ...cloneDoc(doc), style: { ...doc.style, font: v } })} className="w-full" />
              <StudioSlider label="Size" value={doc.style.size} min={20} max={140} onChange={v => commit('size', { ...cloneDoc(doc), style: { ...doc.style, size: v } })} suffix="px" />
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>Color</span>
                <input type="color" value={doc.style.color} onChange={e => commit('color', { ...cloneDoc(doc), style: { ...doc.style, color: e.target.value } })} className="h-6 w-10 rounded border border-white/10" />
                <button onClick={() => commit('weight', { ...cloneDoc(doc), style: { ...doc.style, weight: doc.style.weight >= 700 ? 400 : 700 } })} className={cn('rounded px-2 py-1 font-bold', doc.style.weight >= 700 && 'bg-white/10')}>B</button>
                <button onClick={() => commit('italic', { ...cloneDoc(doc), style: { ...doc.style, italic: !doc.style.italic } })} className={cn('rounded px-2 py-1 italic', doc.style.italic && 'bg-white/10')}>I</button>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={doc.style.outline} onChange={e => commit('outline', { ...cloneDoc(doc), style: { ...doc.style, outline: e.target.checked } })} /> Outline
              </label>
              {doc.style.outline && (
                <div className="flex items-center gap-2">
                  <input type="color" value={doc.style.outlineColor} onChange={e => commit('o-color', { ...cloneDoc(doc), style: { ...doc.style, outlineColor: e.target.value } })} className="h-6 w-10 rounded border border-white/10" />
                  <input type="number" value={doc.style.outlineWidth} onChange={e => commit('o-width', { ...cloneDoc(doc), style: { ...doc.style, outlineWidth: +e.target.value } })} className="h-6 w-14 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-xs" />
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={doc.style.background === 'box'} onChange={e => commit('bg', { ...cloneDoc(doc), style: { ...doc.style, background: e.target.checked ? 'box' : 'none' } })} /> Background box
              </label>
              {doc.style.background === 'box' && (
                <input type="color" value={'#' + (doc.style.bgColor.match(/[0-9a-f]{6}/i)?.[0] ?? '000000')} onChange={e => commit('bgc', { ...cloneDoc(doc), style: { ...doc.style, bgColor: e.target.value } })} className="h-6 w-full rounded border border-white/10" />
              )}
              <StudioSelect value={doc.style.pos} options={[
                { value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' },
              ]} onChange={v => commit('pos', { ...cloneDoc(doc), style: { ...doc.style, pos: v as CueStyle['pos'] } })} className="w-full" />
            </div>
          </StudioPanel>
        </StudioSidebar>
      </StudioBody>

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/5 bg-[#0f1115] px-3 text-[11px] text-zinc-400">
        <span>{doc.cues.length} cues</span>
        {waveform && <span>{fmtT(waveform.duration)} media</span>}
        <span className="ml-auto">{doc.style.font.split(',')[0]} · {doc.style.size}px · {doc.style.pos}</span>
      </div>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
          {progress > 0 && <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>}
      {gate}

      {transcribeDialog && (
        <Dialog title="Auto-transcribe" onCancel={() => setTranscribeDialog(false)} onConfirm={runTranscribe} confirmLabel="Transcribe">
          <Field label="Quality">
            <div className="flex gap-1">
              {(['tiny', 'base', 'small'] as const).map(s => (
                <button key={s} onClick={() => setTranscribeSize(s)} className={cn('flex-1 rounded px-2 py-1.5 text-xs', transcribeSize === s ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>
                  {s === 'tiny' ? 'Fast' : s === 'base' ? 'Standard' : 'Detailed'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Language">
            <select value={doc.language} onChange={e => setDoc(d => ({ ...d, language: e.target.value }))} className={INPUT_CLS}>
              {LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
          <div className="rounded bg-amber-500/10 p-2 text-xs text-amber-200">First run downloads the model (~40–150 MB).</div>
        </Dialog>
      )}
      {exportDialog && (
        <Dialog title="Export" onCancel={() => setExportDialog(false)} onConfirm={exportNow} confirmLabel="Download">
          <Field label="Format">
            <div className="flex gap-1">
              {(['srt', 'vtt', 'ass', 'json'] as const).map(f => (
                <button key={f} onClick={() => setExportFmt(f)} className={cn('flex-1 rounded px-2 py-1.5 text-xs uppercase', exportFmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
              ))}
            </div>
          </Field>
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-1 text-[11px] text-zinc-400">Or render captions onto the video (hard-subs):</div>
            <button
              onClick={() => void burnIntoVideo()}
              disabled={!mediaFile || !/^video\//.test(mediaFile?.type ?? '')}
              className="w-full rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-zinc-500"
              title={mediaFile ? 'Burn the styled captions into the loaded video' : 'Load a video on the left first'}
            >
              Burn into video (MP4)
            </button>
          </div>
        </Dialog>
      )}
      {templatesOpen && (
        <TemplateGallery
          title="Caption Templates"
          items={subtitleTemplateItems}
          categories={SUBTITLE_TEMPLATE_CATEGORIES.map(c => ({ id: c.id, label: c.label }))}
          activeCategory={templateCat}
          onCategory={setTemplateCat}
          onPick={applySubtitleTemplate}
          onClose={() => setTemplatesOpen(false)}
          accent="violet"
        />
      )}
      {openDialog && (
        <Dialog title="Library" onCancel={() => setOpenDialog(false)} onConfirm={() => setOpenDialog(false)} confirmLabel="Close">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {savedList.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects</div>}
            {savedList.map(p => (
              <button key={p.id} onClick={() => loadFromLibrary(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
                <FileText className="h-3.5 w-3.5 text-zinc-400" />
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

function CuePreview({ cue, style, time, karaoke, highlightColor = '#22d3ee' }: { cue: Cue; style: CueStyle; time?: number; karaoke?: boolean; highlightColor?: string }) {
  const bg = style.background === 'box' ? style.bgColor : 'transparent';
  const base = {
    fontFamily: style.font,
    fontSize: style.size * 0.4,
    color: style.color,
    fontWeight: style.weight,
    fontStyle: style.italic ? 'italic' as const : undefined,
    background: bg,
    padding: style.background === 'box' ? '4px 12px' : 0,
    display: 'inline-block' as const,
    textShadow: style.shadow ? `0 0 ${style.shadowBlur}px ${style.shadowColor}` : undefined,
    WebkitTextStroke: style.outline ? `${style.outlineWidth * 0.5}px ${style.outlineColor}` : undefined,
  };
  const wrapCls = cn(
    'pointer-events-none absolute left-0 right-0 px-6 text-center',
    style.pos === 'top' ? 'top-4' : style.pos === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-4',
  );
  // Karaoke: highlight each word as it's spoken (the signature 2025 caption look).
  if (karaoke && cue.words && cue.words.length) {
    const t = time ?? -1;
    return (
      <div className={wrapCls}>
        <div style={base}>
          {cue.words.map((w, i) => {
            const spoken = t >= w.start;
            return <span key={i} style={{ color: spoken ? highlightColor : style.color, transition: 'color 80ms' }}>{w.text}{i < cue.words!.length - 1 ? ' ' : ''}</span>;
          })}
        </div>
      </div>
    );
  }
  const lines = cue.text.split(/\\N|\n/);
  return (
    <div className={wrapCls}>
      <div style={base}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

function WaveformTimeline({ waveform, cues, selectedId, time, zoom, snap, onSeek, onSelect, onMoveCue, onTrimCue }: {
  waveform: { peaks: Float32Array; duration: number; sampleRate: number } | null;
  cues: Cue[]; selectedId: string | null; time: number; zoom: number; snap: boolean;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onMoveCue: (id: string, start: number) => void;
  onTrimCue: (id: string, edge: 'l' | 'r', t: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<null | { type: 'move' | 'trim-l' | 'trim-r' | 'scrub'; id?: string; ox: number; ov: number; opp?: number }>(null);
  // Live drag feedback: the exact timecode being set, where to draw the floating
  // tooltip, and — if the value landed on a snap target — where to draw the
  // bright vertical guide line. This is the "feels alive" Aegisub affordance.
  const [feedback, setFeedback] = React.useState<null | { kind: 'move' | 'trim-l' | 'trim-r'; t: number; x: number; snapT: number | null }>(null);

  const dur = waveform?.duration ?? 60;
  const totalW = Math.max(800, dur * zoom);
  const xToT = (x: number) => x / zoom;
  const tToX = (t: number) => t * zoom;

  React.useEffect(() => {
    const c = ref.current?.querySelector<HTMLCanvasElement>('canvas');
    if (!c || !waveform) return;
    c.width = totalW;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    const step = c.width / waveform.peaks.length;
    for (let i = 0; i < waveform.peaks.length; i++) {
      const h = waveform.peaks[i] * c.height * 0.9;
      ctx.fillRect(i * step, (c.height - h) / 2, Math.max(1, step), h);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let s = 0; s <= dur; s++) {
      const x = s * zoom;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
    }
  }, [waveform, totalW, zoom, dur]);

  // Returns the (possibly snapped) time AND which snap target it locked onto (or
  // null). `force` lets the caller suppress snapping (Alt held = free placement).
  const snapResolve = (t: number, exclude?: string, off = false): { t: number; snapT: number | null } => {
    if (!snap || off) return { t: Math.max(0, t), snapT: null };
    const snaps: number[] = [0, dur, time];
    for (const c of cues) {
      if (exclude && c.id === exclude) continue;
      snaps.push(c.start, c.end);
    }
    let best = t, bestD = 0.15, hit: number | null = null;
    for (const s of snaps) {
      const d = Math.abs(s - t);
      if (d < bestD) { bestD = d; best = s; hit = s; }
    }
    return { t: Math.max(0, best), snapT: hit };
  };

  const onWheel: React.WheelEventHandler = (e) => {
    if (!ref.current) return;
    if (e.shiftKey) ref.current.scrollLeft -= e.deltaY;
  };

  const onScrub: React.MouseEventHandler = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left + ref.current.scrollLeft;
    onSeek(Math.max(0, xToT(x)));
  };

  const onPointerDownCue = (e: React.PointerEvent, c: Cue, mode: 'move' | 'trim-l' | 'trim-r') => {
    e.stopPropagation();
    onSelect(c.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      type: mode, id: c.id,
      ox: e.clientX,
      ov: mode === 'trim-r' ? c.end : c.start,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !d.id) return;
    const off = e.altKey; // hold Alt for free placement (snap off) — signature modifier
    const dx = (e.clientX - d.ox) / zoom;
    const raw = d.ov + dx;
    const res = snapResolve(raw, d.id, off);
    if (d.type === 'move') {
      onMoveCue(d.id, res.t);
      // For a body-move the tooltip tracks the cue's NEW start (= res.t).
      setFeedback({ kind: 'move', t: res.t, x: tToX(res.t), snapT: res.snapT });
    } else if (d.type === 'trim-l') {
      onTrimCue(d.id, 'l', res.t);
      setFeedback({ kind: 'trim-l', t: res.t, x: tToX(res.t), snapT: res.snapT });
    } else if (d.type === 'trim-r') {
      onTrimCue(d.id, 'r', res.t);
      setFeedback({ kind: 'trim-r', t: res.t, x: tToX(res.t), snapT: res.snapT });
    }
  };

  const onPointerUp = () => { drag.current = null; setFeedback(null); };

  return (
    <div ref={ref} className="relative h-32 shrink-0 overflow-x-auto overflow-y-hidden border-t border-white/5" onClick={onScrub} onWheel={onWheel} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="relative" style={{ width: totalW, height: 100 }}>
        <canvas className="absolute inset-0" />
        {cues.map((c) => {
          const x = tToX(c.start);
          const w = Math.max(8, tToX(c.end - c.start));
          const sel = c.id === selectedId;
          return (
            <div
              key={c.id}
              style={{ left: x, width: w }}
              onPointerDown={(e) => onPointerDownCue(e, c, 'move')}
              className={cn(
                'group absolute top-2 flex h-20 cursor-grab items-stretch rounded border bg-gradient-to-br from-cyan-500/25 to-blue-500/25 backdrop-blur',
                sel ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-white/10 hover:border-white/30',
              )}
            >
              <div onPointerDown={(e) => onPointerDownCue(e, c, 'trim-l')} className="w-1.5 cursor-ew-resize bg-white/30 hover:bg-cyan-300" />
              <div className="flex-1 overflow-hidden px-1 py-0.5 text-[10px] leading-tight text-white">
                <div className="truncate font-medium">{c.text.slice(0, 60)}</div>
                <div className="mt-0.5 text-[9px] tabular-nums text-cyan-100/70">{fmtT(c.start)}–{fmtT(c.end)}</div>
              </div>
              <div onPointerDown={(e) => onPointerDownCue(e, c, 'trim-r')} className="w-1.5 cursor-ew-resize bg-white/30 hover:bg-cyan-300" />
            </div>
          );
        })}
        <div className="pointer-events-none absolute top-0 h-full" style={{ left: tToX(time), width: 2, background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,.6)' }}>
          <div className="absolute -left-1.5 -top-1 h-3 w-4 rounded-sm bg-cyan-400" />
        </div>
        {/* Snap guide line — a bright amber rule appears exactly where an edge has
            locked onto a neighbouring cue boundary / start / end (Aegisub-style). */}
        {feedback?.snapT != null && (
          <div
            className="pointer-events-none absolute top-0 h-full"
            style={{ left: tToX(feedback.snapT), width: 2, background: '#fbbf24', boxShadow: '0 0 8px rgba(251,191,36,.7)' }}
          />
        )}
        {/* Live drag tooltip — exact timecode follows the dragged handle so timing
            is precise to the millisecond without a round-trip to a field. */}
        {feedback && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow"
            style={{ left: Math.max(24, feedback.x), top: 2 }}
          >
            <span className={cn(feedback.snapT != null && 'text-amber-300')}>{fmtT(feedback.t)}</span>
            <span className="ml-1 text-cyan-300/70">{feedback.kind === 'trim-l' ? 'in' : feedback.kind === 'trim-r' ? 'out' : 'move'}</span>
            {feedback.snapT != null && <span className="ml-1 text-amber-300">⊹snap</span>}
          </div>
        )}
      </div>
    </div>
  );
}

const INPUT_CLS = 'w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1 text-xs text-zinc-400"><span>{label}</span>{children}</label>
);

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK' }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width="sm">{children}</SharedDialog>;
}
