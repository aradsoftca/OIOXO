'use client';

import * as React from 'react';
import {
  Loader2, Download, Plus, Trash2, Film, Scissors, Copy,
  Play, Pause, Volume2, VolumeX, Music, ZoomIn, ZoomOut,
  Sliders, MousePointer2, Hand, Type as TypeIcon, Square,
  ChevronLeft, ChevronRight, Save, Upload, FileText, Undo2, Redo2,
  Eye, EyeOff, Lock, Unlock, SkipBack, SkipForward, Magnet,
  ImageIcon, AudioLines, X, Sparkles, LayoutTemplate, Palette,
  Activity, BarChart3, History,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever, checkFormat } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { ProBadge } from '@/components/limits/ProBadge';

const POLICY_KEY = 'video-studio';
import { getVideoInfo } from '@/engines/video';
import { chromaKeySource } from '@/engines/video/compositor';
import {
  StudioShell, StudioTopBar, StudioBody, StudioToolDock, StudioToolButton,
  StudioPanel, StudioSidebar, StudioButton, StudioSlider, StudioSelect,
  UndoStack, newProject, saveProject, loadProject, listProjects,
  type StudioProject, downloadBlob, safeFilename, useShortcuts, formatCombo,
  blankCanvas,
  COLOR_GRADES, TRANSITIONS, TITLE_PRESETS, VIDEO_TEMPLATES, thumbDataUri,
  type ColorGrade, type VideoTemplate, type VideoTemplateCategory,
  renderHistogram, renderWaveformScope, renderVectorscope,
  WebCodecsPlayer, blitFrameToCanvas, deviceProfile, useRafThrottle, targetFps,
  usePinchPan,
  type AnimatedParam, sampleAnimated, addKeyframe, removeKeyframe, makeStatic, isAnimated,
  type TextAnimId, TEXT_ANIMATIONS, sampleTextAnim,
  type AudioEffect, type AudioEffectType, AUDIO_EFFECT_DEFAULTS, AUDIO_EFFECT_LABELS,
  type TransitionId, TRANSITION_LIST, setupTransition,
  type VideoEffect, type VideoEffectType, VIDEO_EFFECT_LABELS, VIDEO_EFFECT_DEFAULT_AMOUNT,
  effectFilterFragment, hasPixelEffects, applyPixelEffects,
  ColorWheelsPanel, RgbCurvesPanel,
  type ColorWheels, type CurveSet, ZERO_WHEELS, isZeroWheels,
  applyColorWheelsToImageData, applyCurveSet,
  applyLut, parseCubeLut, type Lut3D,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
  EmptyState, pushToast,
  SharedDialog,
  PresetBar, KeyframeSlider,
} from '@/lib/studios';

/** Styleable subset of a caption TextClip — the value saved as a C4 preset. */
interface CaptionStyleValue {
  font: string; size: number; color: string; weight: number; italic: boolean;
  outline: boolean; outlineColor: string; outlineWidth: number;
  pos: 'top' | 'center' | 'bottom'; anim: TextAnimId; align: CanvasTextAlign;
}

type Tool = 'select' | 'razor' | 'hand' | 'text';
type TrackKind = 'video' | 'audio' | 'text';

interface Track {
  id: string;
  kind: TrackKind;
  label: string;
  muted: boolean;
  locked: boolean;
  height: number;
}

interface VideoClipKeyframes {
  brightness?: AnimatedParam<number>;
  contrast?: AnimatedParam<number>;
  saturation?: AnimatedParam<number>;
  hue?: AnimatedParam<number>;
  opacity?: AnimatedParam<number>;
  // Motion keyframes — animate the PiP transform so a clip can pan, zoom
  // (Ken Burns by hand), grow, spin, or fly across the frame over time. posX/posY
  // are normalized to the frame (0 = centered, ±0.5 = edge); scale 1 = fit;
  // rotation in degrees. Sampled in drawVideoFrame so preview == export.
  posX?: AnimatedParam<number>;
  posY?: AnimatedParam<number>;
  scale?: AnimatedParam<number>;
  rotation?: AnimatedParam<number>;
}

interface VideoClip {
  id: string;
  kind: 'video';
  trackId: string;
  mediaId: string;
  start: number;
  srcStart: number;
  srcEnd: number;
  speed: number;
  volume: number;
  /** When muted, `volume` is forced to 0 so the existing mixer (which keys the
   *  clip's audio level off `volume`) drops it; the pre-mute level is stashed
   *  here so the Mute toggle can restore it. No compositor change needed. */
  mutedVolume?: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  opacity: number;
  fit: 'contain' | 'cover';
  transition?: TransitionId;
  transDur?: number;
  chromaKey?: { color: string; similarity: number; smoothness: number; spill: number };
  keyframes?: VideoClipKeyframes;
  colorWheels?: ColorWheels;
  curves?: CurveSet;
  /** Creative LUT (.cube) film look + intensity (0..1). Applied after wheels+curves. */
  lut?: Lut3D;
  lutName?: string;
  lutIntensity?: number;
  /** Stackable creative effects (blur/glow/vignette/grain/pixelate/…) applied
   *  identically in preview + export. */
  effects?: VideoEffect[];
  /** Source-space crop rect (normalized 0..1) applied before fit, so a placed
   *  image/video can be cropped without a separate tool. */
  crop?: { x: number; y: number; w: number; h: number };
  /** PiP transform around the frame center. x/y normalized to frame (0 = centered),
   *  scale 1 = fit, rotation in degrees. Used for picture-in-picture / split / Ken Burns. */
  transform?: { x: number; y: number; scale: number; rotation: number };
  /** Mirror the placed media. Applied around the frame center in preview +
   *  export so a flipped clip reads identically in both. */
  flipH?: boolean;
  flipV?: boolean;
}

function sampleClipParam(c: VideoClip, name: keyof VideoClipKeyframes, defaultVal: number, localT: number): number {
  const kf = c.keyframes?.[name];
  if (!kf || kf.keyframes.length === 0) return defaultVal;
  return sampleAnimated(kf, localT);
}

interface AudioClip {
  id: string;
  kind: 'audio';
  trackId: string;
  mediaId: string;
  start: number;
  srcStart: number;
  srcEnd: number;
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Volume AUTOMATION — keyframed gain envelope (0..2 = 0..200%) sampled in
   *  CLIP-LOCAL SECONDS so a user can duck one part and lift another. When
   *  present it overrides the static `volume` in the mixdown. */
  volumeKf?: AnimatedParam<number>;
  /** Per-clip audio effects rack (EQ/reverb/filter/compressor/echo/pitch),
   *  applied in BOTH the export mixdown and live preview. */
  effects?: AudioEffect[];
}

interface TextClip {
  id: string;
  kind: 'text';
  trackId: string;
  start: number;
  duration: number;
  text: string;
  font: string;
  size: number;
  color: string;
  weight: number;
  italic: boolean;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  pos: 'top' | 'center' | 'bottom';
  anim: TextAnimId;
  align: CanvasTextAlign;
  /** Optional manual keyframes layered ON TOP of the preset animation, so a user
   *  can hand-animate text scale/opacity/position/rotation (e.g. make a title
   *  grow over its whole duration). Sampled with the same keyframe engine as
   *  video clips → identical in preview + export. */
  kf?: { scale?: AnimatedParam<number>; opacity?: AnimatedParam<number>; posX?: AnimatedParam<number>; posY?: AnimatedParam<number>; rotation?: AnimatedParam<number> };
  /** Free position (normalized 0..1) when the user has dragged the text on the
      preview. Overrides pos/align placement. Undefined → use pos/align presets. */
  nx?: number;
  ny?: number;
  /** Marks an auto-generated caption (vs a title/lower-third) so the Captions
      panel can list+correct them and bulk-restyle them as a group. */
  caption?: boolean;
}

type TimelineClip = VideoClip | AudioClip | TextClip;

interface MediaItem {
  id: string;
  file: File;
  name: string;
  kind: 'video' | 'audio' | 'image';
  duration: number;
  width: number;
  height: number;
  thumb?: string;
  url: string;
  peaks?: number[]; // normalized 0..1 amplitude peaks for waveform render (audio/video)
}

// RMS energy bins (per second resolution) of a media file's audio — the
// "how active is this moment" signal Auto-Cut uses to keep the good bits.
// On-device, best-effort (returns empty if undecodable).
async function videoEnergyBins(file: File, binsPerSec: number): Promise<Float32Array> {
  try {
    const AC: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!AC) return new Float32Array(0);
    const ctx = new AC();
    try {
      const buf = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
      const nBins = Math.max(1, Math.floor(buf.duration * binsPerSec));
      const out = new Float32Array(nBins);
      const ch0 = buf.getChannelData(0);
      const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
      const spb = Math.floor(buf.length / nBins);
      for (let b = 0; b < nBins; b++) {
        let sum = 0; const s0 = b * spb, s1 = Math.min(buf.length, s0 + spb);
        for (let i = s0; i < s1; i++) { const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i]; sum += v * v; }
        out[b] = Math.sqrt(sum / Math.max(1, s1 - s0));
      }
      return out;
    } finally { try { await ctx.close(); } catch { /* */ } }
  } catch { return new Float32Array(0); }
}

// Pick the start time (sec) of the highest-energy window of `segLen` seconds
// from the footage that doesn't overlap an already-claimed window. Falls back
// to sequential windows when energy is unavailable (silent/undecodable video).
function pickBestWindow(energy: Float32Array, binsPerSec: number, segLen: number, totalDur: number, used: Array<[number, number]>): number {
  const winBins = Math.max(1, Math.round(segLen * binsPerSec));
  const overlaps = (s: number) => used.some(([u0, u1]) => s < u1 && s + segLen > u0);
  if (energy.length >= winBins) {
    let running = 0;
    for (let i = 0; i < winBins; i++) running += energy[i];
    let best = -Infinity, bestStart = 0;
    for (let i = winBins; i < energy.length; i++) {
      running += energy[i] - energy[i - winBins];
      const startSec = (i - winBins + 1) / binsPerSec;
      if (running > best && !overlaps(startSec)) { best = running; bestStart = startSec; }
    }
    if (best > -Infinity) return Math.max(0, Math.min(Math.max(0, totalDur - segLen), bestStart));
  }
  // Fallback: sequential window after the last used one (wraps if past the end).
  const span = Math.max(0.1, totalDur - segLen);
  const lastEnd = used.length ? Math.max(...used.map(u => u[1])) : 0;
  return Math.max(0, Math.min(span, lastEnd % span));
}

// Decode an audio/video file on-device and downsample to a compact peak array
// (~600 buckets) for drawing a clip waveform. Best-effort: returns [] if the
// browser can't decode (e.g. some video containers) so the UI just shows no
// waveform rather than throwing.
async function extractPeaks(file: File, buckets = 600): Promise<number[]> {
  try {
    const AC: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return [];
    const ctx = new AC();
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    ctx.close();
    const ch = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(ch.length / buckets));
    const peaks: number[] = [];
    let max = 0.0001;
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const s = i * block, e = Math.min(ch.length, s + block);
      for (let j = s; j < e; j++) { const v = Math.abs(ch[j]); if (v > peak) peak = v; }
      peaks.push(peak);
      if (peak > max) max = peak;
    }
    return peaks.map(p => p / max); // normalize to 0..1
  } catch { return []; }
}

interface DocState {
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  tracks: Track[];
  clips: TimelineClip[];
  selectedId: string | null;
  playhead: number;
  duration: number;
  master: { volume: number; audioFade: boolean; duck?: boolean };
  /** Empty media slots from an applied template (Hook/Main/CTA structure).
   *  Rendered as dashed "drop here" guides on the timeline; consumed as the
   *  user drops media in. Undefined when no template is active. */
  slots?: TemplateSlot[];
  /** Color-grade id the active template wants applied to every clip — applied
   *  to media as it lands in a slot (deferred because a fresh template has no
   *  clips yet). Cleared once there are no slots left to fill. */
  pendingGrade?: string;
}

/** A template slot materialized onto the live doc. Mirrors VideoTemplateSlot
 *  but carries the resolved track it lives on. */
interface TemplateSlot {
  id: string;
  kind: 'video' | 'image' | 'audio';
  trackId: string;
  start: number;
  duration: number;
  label: string;
  hint?: string;
}

const FONTS = [
  'system-ui, sans-serif', 'Georgia, serif', 'Impact, sans-serif',
  'Times New Roman, serif', 'Comic Sans MS, cursive', 'Courier New, monospace',
];

const PRESETS: { id: string; label: string; w: number; h: number; fps: number }[] = [
  { id: '16:9-1080', label: '1080p (1920×1080)', w: 1920, h: 1080, fps: 30 },
  { id: '16:9-720', label: '720p (1280×720)', w: 1280, h: 720, fps: 30 },
  { id: '9:16-1080', label: 'Vertical (1080×1920)', w: 1080, h: 1920, fps: 30 },
  { id: '1:1-1080', label: 'Square (1080×1080)', w: 1080, h: 1080, fps: 30 },
  { id: '4:5-1080', label: 'Insta (1080×1350)', w: 1080, h: 1350, fps: 30 },
  { id: '16:9-4k', label: '4K (3840×2160)', w: 3840, h: 2160, fps: 30 },
];

let _id = 0;
const tid = () => `T${++_id}_${Math.random().toString(36).slice(2, 5)}`;

const NEW_DOC = (preset: typeof PRESETS[0] | { id: string; label: string; w: number; h: number; fps: number } = PRESETS[0]): DocState => ({
  name: 'Untitled',
  width: preset.w,
  height: preset.h,
  fps: preset.fps,
  background: '#000000',
  tracks: [
    { id: tid(), kind: 'video', label: 'V1', muted: false, locked: false, height: 56 },
    { id: tid(), kind: 'video', label: 'V2', muted: false, locked: false, height: 48 },
    { id: tid(), kind: 'text', label: 'T1', muted: false, locked: false, height: 32 },
    { id: tid(), kind: 'audio', label: 'A1', muted: false, locked: false, height: 40 },
    { id: tid(), kind: 'audio', label: 'A2 (music)', muted: false, locked: false, height: 40 },
  ],
  clips: [],
  selectedId: null,
  playhead: 0,
  duration: 0,
  master: { volume: 1, audioFade: true },
});

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  tracks: d.tracks.map(t => ({ ...t })),
  clips: d.clips.map(c => ({ ...c })),
  master: { ...d.master },
  slots: d.slots ? d.slots.map(s => ({ ...s })) : undefined,
});

const clipDuration = (c: TimelineClip): number => {
  if (c.kind === 'text') return c.duration;
  return Math.max(0.04, (c.srcEnd - c.srcStart) / Math.max(0.01, c.speed));
};

const clipEnd = (c: TimelineClip) => c.start + clipDuration(c);

const computeDuration = (clips: TimelineClip[]): number => {
  let max = 0;
  for (const c of clips) max = Math.max(max, clipEnd(c));
  return max;
};

const trackOf = (doc: DocState, id: string): Track | undefined => doc.tracks.find(t => t.id === id);

const fmtT = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

async function makeThumb(file: File): Promise<string | undefined> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => { try { v.currentTime = Math.min(v.duration / 3, 1); } catch {} };
      v.onseeked = () => res();
      v.onerror = () => rej(new Error('thumb failed'));
      setTimeout(() => res(), 4000);
    });
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  } finally {
    // Always revoke — the previous version only revoked on success, so
    // every corrupt/unsupported video that hit the catch leaked one blob
    // URL until tab close.
    URL.revokeObjectURL(url);
  }
}

export default function VideoStudioPro() {
  const { guard, gate } = useUsageGate('video');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const stack = React.useRef(new UndoStack<DocState>(60));
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  // Always-current snapshot of the working doc. Builders that can fire several
  // times before React re-renders (e.g. clicking 3 media items in a row to add
  // them all to the timeline) MUST read from this ref, not the `doc` closure —
  // otherwise each rapid call clones the SAME stale doc and only the last commit
  // survives, silently dropping clips.
  const docRef = React.useRef<DocState>(doc);
  // Keep the ref consistent with whatever path mutates `doc` (functional
  // setDoc for playhead/selection/name, recovery restore, etc.).
  React.useEffect(() => { docRef.current = doc; }, [doc]);
  const applyDoc = React.useCallback((next: DocState) => { docRef.current = next; setDoc(next); }, []);

  const commit = React.useCallback((label: string, next: DocState) => {
    next.duration = computeDuration(next.clips);
    docRef.current = next;
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);
  const undo = () => { const p = stack.current.undo(cloneDoc(docRef.current)); if (p) { applyDoc(p); force(); } };
  const redo = () => { const p = stack.current.redo(); if (p) { applyDoc(p); force(); } };

  const [media, setMedia] = React.useState<MediaItem[]>([]);
  const mediaMap = React.useMemo(() => new Map(media.map(m => [m.id, m])), [media]);

  const [tool, setTool] = React.useState<Tool>('select');
  const [playing, setPlaying] = React.useState(false);
  const [snap, setSnap] = React.useState(true);
  // Ripple trim: when on, trimming a clip edge shifts all LATER clips on the
  // same track by the same delta so the gap closes/opens (DaVinci/Premiere).
  const [ripple, setRipple] = React.useState(false);
  const [zoom, setZoom] = React.useState(100);
  const [busy, setBusy] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [toast, setToast] = React.useState('');
  const [exportDialog, setExportDialog] = React.useState(false);
  const [exportPreset, setExportPreset] = React.useState(PRESETS[0].id);
  const [newDialog, setNewDialog] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [textDialogClip, setTextDialogClip] = React.useState<string | null>(null);
  // Double-tap an element on the preview → focus its inspector (a titled, single-
  // element settings view) and a "‹ Back" returns to the timeline. The product
  // interaction model: click=select(+handles), double-click=edit-this-element.
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  // Captions editor panel (inline transcription correction + bulk restyle).
  const [captionsPanel, setCaptionsPanel] = React.useState(false);
  const [templatesDialog, setTemplatesDialog] = React.useState(false);
  const [templateCategory, setTemplateCategory] = React.useState<VideoTemplateCategory | 'all'>('all');
  const [showScopes, setShowScopes] = React.useState(false);
  const histoRef = React.useRef<HTMLCanvasElement | null>(null);
  const waveRef = React.useRef<HTMLCanvasElement | null>(null);
  const vectorRef = React.useRef<HTMLCanvasElement | null>(null);

  const previewRef = React.useRef<HTMLCanvasElement | null>(null);
  const previewWrapRef = React.useRef<HTMLDivElement | null>(null);
  const playStart = React.useRef<{ at: number; t0: number } | null>(null);
  const videoElems = React.useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElems = React.useRef<Map<string, HTMLAudioElement>>(new Map());
  const playerRef = React.useRef<WebCodecsPlayer | null>(null);
  const device = React.useRef(deviceProfile());
  const [previewZoom, setPreviewZoom] = React.useState(1);
  const [previewPan, setPreviewPan] = React.useState({ x: 0, y: 0 });

  const toastFor = (m: string) => { pushToast(m); };

  // Unmount-only cleanup. Previous version had `[media]` deps, which meant
  // EVERY import ran the cleanup against the OLD media array — revoking the
  // URLs of files still in the timeline and resetting their <video>/<audio>
  // elements. That broke any previously imported clip the moment a new file
  // landed in the media pool. Now we keep a ref of the live media list and
  // only revoke on actual unmount.
  const mediaRef = React.useRef<MediaItem[]>(media);
  React.useEffect(() => { mediaRef.current = media; }, [media]);
  React.useEffect(() => () => {
    for (const m of mediaRef.current) URL.revokeObjectURL(m.url);
    videoElems.current.forEach(v => { v.pause(); v.src = ''; });
    audioElems.current.forEach(a => { a.pause(); a.src = ''; });
    playerRef.current?.dispose();
    playerRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!playerRef.current) playerRef.current = new WebCodecsPlayer();
  }, []);

  const getMediaEl = (item: MediaItem): HTMLVideoElement | HTMLAudioElement => {
    if (item.kind === 'video') {
      let v = videoElems.current.get(item.id);
      if (!v) {
        v = document.createElement('video');
        v.src = item.url;
        // Blob URLs are same-origin — `crossOrigin = anonymous` makes the
        // browser treat them as anonymous CORS requests, which on some
        // browsers causes the audio track to be discarded as tainted. Leave
        // it unset for blob inputs.
        v.playsInline = true;
        // Belt + braces: muted AND volume 0. We blit FRAMES to canvas from
        // either WebCodecsPlayer or this element — never its audio track.
        // Audio is played separately via the AudioClips path.
        v.muted = true;
        v.volume = 0;
        v.preload = 'auto';
        videoElems.current.set(item.id, v);
      }
      return v;
    }
    let a = audioElems.current.get(item.id);
    if (!a) {
      a = new Audio(item.url);
      // Same as above — no crossOrigin on blob URLs.
      a.preload = 'auto';
      audioElems.current.set(item.id, a);
    }
    return a;
  };

  const ingestFiles = async (files: FileList | File[]) => {
    setRecovery(null); // importing real media supersedes the recover-last-session offer
    // Importing media is FREE — like every real editor (CapCut, Premiere), you
    // load and arrange clips without spending anything; the usage credit is
    // charged on Export (the valuable output) and on the heavy AI ops
    // (auto-caption / auto-reframe). Gating import burned a free user's daily
    // video credit just to *open a clip*, before they made anything — and it
    // blocked the whole editor when the usage API was unreachable.
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy('Importing…');
    try {
      const next: MediaItem[] = [];
      for (const f of arr) {
        const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('image/') ? 'image' : null;
        if (!kind) continue;
        const url = URL.createObjectURL(f);
        // Track URLs that haven't been adopted into `next` yet, so a throw
        // mid-iteration (corrupt video, makeThumb failure, etc.) doesn't
        // leak the URL — the cleanup loop at the bottom only sees URLs
        // already pushed to media state.
        let adopted = false;
        // Allocate the media id ONCE, up front, and use the SAME id for both the
        // WebCodecs player clip and the media item. Previously the player got
        // `M${_id+1}` before an awaited addClip() and the media item got
        // `M${++_id}` after — if `_id` moved during the await (another import,
        // a text-clip tid(), or a StrictMode double-invoke) the two diverged, so
        // hasClip(item.id) was false and the preview silently fell back / drew
        // BLACK. Pinning the id removes that race.
        const mediaId = `M${++_id}`;
        try {
        let duration = 0, width = 0, height = 0;
        if (kind === 'video') {
          try {
            if (!playerRef.current) playerRef.current = new WebCodecsPlayer();
            const info = await playerRef.current.addClip(mediaId, f);
            if (info) {
              duration = info.duration;
              width = info.width;
              height = info.height;
            }
          } catch {}
          if (!duration) {
            try {
              const r = await getVideoInfo(f);
              const info = (r as any).info ?? r;
              duration = info.duration || 0;
              width = info.width || 0;
              height = info.height || 0;
            } catch {}
          }
        } else if (kind === 'audio') {
          const a = new Audio(url);
          await new Promise<void>((res) => { a.onloadedmetadata = () => res(); setTimeout(res, 4000); });
          duration = isFinite(a.duration) ? a.duration : 0;
        } else {
          const img = new Image();
          await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url; });
          width = img.naturalWidth; height = img.naturalHeight; duration = 5;
        }
        const thumb = kind === 'video' ? await makeThumb(f) : kind === 'image' ? url : undefined;
        // Waveform peaks for audio clips (and video, which usually has a
        // decodable audio track) so the timeline shows a real wave instead of a
        // featureless bar — the precision tax the audit flagged. Best-effort.
        const peaks = kind === 'audio' || kind === 'video' ? await extractPeaks(f) : undefined;
        next.push({
          id: mediaId,
          file: f, name: f.name, kind,
          duration, width, height, thumb, url,
          peaks: peaks && peaks.length ? peaks : undefined,
        });
        adopted = true;
        } finally {
          if (!adopted) {
            try { URL.revokeObjectURL(url); } catch { /* */ }
          }
        }
      }
      setMedia(m => [...m, ...next]);
    } finally {
      setBusy('');
    }
  };

  const addClipFromMedia = (mediaId: string, targetTrackId?: string) => {
    const item = mediaMap.get(mediaId);
    if (!item) return;
    // Read the LATEST doc (not the render-closure `doc`) so rapid successive
    // adds stack correctly instead of clobbering each other.
    const next = cloneDoc(docRef.current);
    let trackId: string;

    // Template slot-fill: if the active template still has an open slot matching
    // this media kind, drop the clip straight onto it (at the slot's track AND
    // start time) so the template's structure gets populated where it belongs,
    // then consume the slot and apply the template's pending color grade. Only
    // when the caller didn't force a specific track.
    const slotKind = (item.kind === 'audio' ? 'audio' : 'video');
    const openSlot = !targetTrackId && next.slots
      ? next.slots.find(s => (s.kind === 'audio' ? 'audio' : 'video') === slotKind)
      : undefined;
    if (openSlot) {
      const dur = item.duration || openSlot.duration || 5;
      if (item.kind === 'audio') {
        const c: AudioClip = {
          id: tid(), kind: 'audio', trackId: openSlot.trackId, mediaId,
          start: openSlot.start, srcStart: 0, srcEnd: dur, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
        };
        next.clips.push(c); next.selectedId = c.id;
      } else {
        const grade = next.pendingGrade ? COLOR_GRADES.find(g => g.id === next.pendingGrade) : undefined;
        const c: VideoClip = {
          id: tid(), kind: 'video', trackId: openSlot.trackId, mediaId,
          start: openSlot.start, srcStart: 0, srcEnd: dur, speed: 1, volume: 1,
          brightness: grade?.brightness ?? 100, contrast: grade?.contrast ?? 100,
          saturation: grade?.saturation ?? 100, hue: grade?.hue ?? 0, opacity: 100,
          fit: 'cover', transition: 'none', transDur: 0.5,
        };
        next.clips.push(c); next.selectedId = c.id;
      }
      next.slots = next.slots!.filter(s => s.id !== openSlot.id);
      if (!next.slots.length) { next.slots = undefined; next.pendingGrade = undefined; }
      next.duration = computeDuration(next.clips);
      commit('fill template slot', next);
      toastFor(`Added “${item.name}” to the template`);
      return;
    }

    if (targetTrackId && next.tracks.find(t => t.id === targetTrackId)) {
      // Caller named a specific track — use it (e.g. drop on A2 to layer music
      // under a voiceover that's already on A1).
      trackId = targetTrackId;
    } else if (item.kind === 'video' || item.kind === 'image') {
      // Find the first video track WITH ROOM for a new clip if possible,
      // otherwise fall back to V1. Lets repeated drops stack onto V2, V3, …
      // when V1 is already full at the playhead.
      const head = next.playhead;
      const videoTracks = next.tracks.filter(t => t.kind === 'video');
      const free = videoTracks.find(t => !next.clips.some(c => c.trackId === t.id && head >= c.start && head < clipEnd(c)));
      trackId = (free ?? videoTracks[0]).id;
    } else {
      const head = next.playhead;
      const audioTracks = next.tracks.filter(t => t.kind === 'audio');
      const free = audioTracks.find(t => !next.clips.some(c => c.trackId === t.id && head >= c.start && head < clipEnd(c)));
      trackId = (free ?? audioTracks[0]).id;
    }
    const trackClips = next.clips.filter(c => c.trackId === trackId);
    const startAt = trackClips.length ? Math.max(...trackClips.map(clipEnd)) : 0;
    if (item.kind === 'video' || item.kind === 'image') {
      const dur = item.duration || 5;
      const c: VideoClip = {
        id: tid(), kind: 'video', trackId, mediaId,
        start: startAt, srcStart: 0, srcEnd: dur, speed: 1, volume: 1,
        brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 100,
        fit: 'contain', transition: 'none', transDur: 0.5,
      };
      next.clips.push(c);
      next.selectedId = c.id;
    } else {
      const c: AudioClip = {
        id: tid(), kind: 'audio', trackId, mediaId,
        start: startAt, srcStart: 0, srcEnd: item.duration, speed: 1, volume: 1,
        fadeIn: 0, fadeOut: 0,
      };
      next.clips.push(c);
      next.selectedId = c.id;
    }
    commit('add clip', next);
    toastFor(`Added “${item.name}” to the timeline`);
  };

  // Add an image as a LOGO/WATERMARK OVERLAY: dropped on the top video track at
  // the playhead with a non-identity transform (so it floats over the base video
  // and gets the move/resize/rotate gizmo), sized small and parked top-right.
  // The inspector's opacity slider makes it semi-transparent. This is the
  // "add logo to video, make it transparent, free-move" product flow.
  const addLogoOverlay = (mediaId: string) => {
    const item = mediaMap.get(mediaId);
    if (!item || (item.kind !== 'image' && item.kind !== 'video')) { toastFor('Pick an image for the logo'); return; }
    const next = cloneDoc(docRef.current);
    // Put it on the HIGHEST video track so it sits above the base footage.
    const videoTracks = next.tracks.filter(t => t.kind === 'video');
    const trackId = (videoTracks[videoTracks.length - 1] ?? videoTracks[0]).id;
    const head = next.playhead;
    const dur = item.kind === 'image' ? Math.max(3, next.duration || 5) : (item.duration || 5);
    const c: VideoClip = {
      id: tid(), kind: 'video', trackId, mediaId,
      start: head, srcStart: 0, srcEnd: item.duration || dur, speed: 1, volume: 0,
      brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 100,
      fit: 'contain', transition: 'none', transDur: 0,
      // top-right corner, ~28% size — a classic logo bug. Non-identity ⇒ overlay+gizmo.
      transform: { x: 0.32, y: -0.34, scale: 0.28, rotation: 0 },
    };
    next.clips.push(c);
    next.selectedId = c.id;
    next.duration = computeDuration(next.clips);
    commit('add logo overlay', next);
    toastFor('Logo added — drag to move, corner to resize, opacity in the panel');
  };

  const applyTemplate = (tpl: VideoTemplate) => {
    setRecovery(null); // committing to a template supersedes the recover-last-session offer
    const next = NEW_DOC({ id: tpl.id, label: tpl.name, w: tpl.resolution.w, h: tpl.resolution.h, fps: tpl.resolution.fps });
    next.name = tpl.name;

    // 1) Text clips (titles / lower-thirds / CTAs) straight onto the text track.
    const textTrack = next.tracks.find(t => t.kind === 'text');
    if (textTrack) {
      for (const t of tpl.texts) {
        const preset = TITLE_PRESETS.find(p => p.id === t.preset) ?? TITLE_PRESETS[0];
        next.clips.push({
          id: tid(), kind: 'text', trackId: textTrack.id,
          start: t.start, duration: t.duration,
          text: t.text, font: preset.font, size: preset.size,
          color: preset.color, weight: preset.weight, italic: !!preset.italic,
          outline: !!preset.outline, outlineColor: preset.outlineColor ?? '#000', outlineWidth: preset.outlineWidth ?? 4,
          pos: t.pos, anim: preset.anim, align: preset.align,
        });
      }
    }

    // 2) Materialize the template's media slots (Hook/Main/CTA …) onto real
    //    tracks so the structure is VISIBLE on the timeline and the user knows
    //    where to drop clips. Previously these were dropped on the floor, which
    //    is why a freshly-applied template looked like it did nothing. Each
    //    slot is laid on the matching track kind, stacking video slots across
    //    V1/V2 only when they overlap in time.
    const videoTracks = next.tracks.filter(t => t.kind === 'video');
    const audioTracks = next.tracks.filter(t => t.kind === 'audio');
    const slots: TemplateSlot[] = [];
    for (const s of tpl.slots) {
      const pool = s.kind === 'audio' ? audioTracks : videoTracks;
      // Pick the first track in the pool with no slot already overlapping this
      // time range, so sequential slots share a track and overlapping ones split.
      const sEnd = s.start + s.duration;
      const track = pool.find(t => !slots.some(o => o.trackId === t.id && s.start < o.start + o.duration && sEnd > o.start)) ?? pool[0];
      if (!track) continue;
      slots.push({ id: s.id, kind: s.kind, trackId: track.id, start: s.start, duration: s.duration, label: s.label, hint: s.hint });
    }
    next.slots = slots.length ? slots : undefined;

    // 3) Store the template's color grade so it's applied to each clip AS it
    //    lands in a slot (a fresh template has no media clips to grade yet).
    if (tpl.colorGrade && tpl.colorGrade !== 'original' && COLOR_GRADES.some(g => g.id === tpl.colorGrade)) {
      next.pendingGrade = tpl.colorGrade;
    }

    next.duration = computeDuration(next.clips);
    // Park the playhead in the MIDDLE of the first text clip rather than at 0.
    // Intro animations (pop/fade) ramp alpha from 0 over the clip's first ~25%,
    // so at t=0 the title is fully transparent — the preview would look empty
    // even though the redraw fired. The midpoint is past the ramp, so the user
    // immediately SEES the template's title.
    const firstText = next.clips.find(c => c.kind === 'text') as TextClip | undefined;
    if (firstText) next.playhead = firstText.start + firstText.duration / 2;
    commit(`apply template: ${tpl.name}`, next);
    setTemplatesDialog(false);
    // Preview repaints via the content-change effect (throttledDraw watches the
    // clip set + playhead), so the title paints right after the template loads.
    const slotCount = slots.length;
    toastFor(slotCount
      ? `Template "${tpl.name}" loaded — ${slotCount} clip slot${slotCount > 1 ? 's' : ''} ready, drop your media onto them`
      : `Template "${tpl.name}" loaded`);
  };

  const applyGradeToClip = (clipId: string, gradeId: string) => {
    const grade = COLOR_GRADES.find(g => g.id === gradeId);
    if (!grade) return;
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === clipId) as VideoClip | undefined;
    if (!c || c.kind !== 'video') return;
    c.brightness = grade.brightness;
    c.contrast = grade.contrast;
    c.saturation = grade.saturation;
    c.hue = grade.hue;
    commit(`grade: ${grade.name}`, next);
  };

  // Load a .cube LUT and apply it to the selected clip (or all video clips if
  // none is selected). Parsed once → stored on the clip; applied identically in
  // preview + export (WYSIWYG).
  const loadLutFile = async (file: File) => {
    try {
      const lut = parseCubeLut(await file.text());
      if (!lut) { toastFor('Not a valid 3D .cube LUT'); return; }
      const next = cloneDoc(doc);
      const targets = doc.selectedId ? next.clips.filter(c => c.id === doc.selectedId && c.kind === 'video') : next.clips.filter(c => c.kind === 'video');
      if (!targets.length) { toastFor('Add a video clip first'); return; }
      for (const c of targets) { (c as VideoClip).lut = lut; (c as VideoClip).lutName = file.name.replace(/\.cube$/i, ''); (c as VideoClip).lutIntensity = (c as VideoClip).lutIntensity ?? 1; }
      commit('apply LUT', next);
      toastFor(`LUT "${lut.title || file.name}" applied to ${targets.length} clip${targets.length > 1 ? 's' : ''}`);
    } catch { toastFor('Failed to read LUT'); }
  };
  const setLutIntensity = (pct: number) => {
    if (!doc.selectedId) return;
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === doc.selectedId) as VideoClip | undefined;
    if (!c) return;
    c.lutIntensity = Math.max(0, Math.min(1, pct / 100));
    commit('lut intensity', next);
  };
  const clearLut = () => {
    const next = cloneDoc(doc);
    const targets = doc.selectedId ? next.clips.filter(c => c.id === doc.selectedId) : next.clips.filter(c => c.kind === 'video');
    for (const c of targets) { delete (c as VideoClip).lut; delete (c as VideoClip).lutName; }
    commit('clear LUT', next);
  };

  const applyGradeToAll = (gradeId: string) => {
    const grade = COLOR_GRADES.find(g => g.id === gradeId);
    if (!grade) return;
    const next = cloneDoc(doc);
    for (const c of next.clips) {
      if (c.kind === 'video') {
        c.brightness = grade.brightness;
        c.contrast = grade.contrast;
        c.saturation = grade.saturation;
        c.hue = grade.hue;
      }
    }
    commit(`grade all: ${grade.name}`, next);
    toastFor(`Applied ${grade.name} to all clips`);
  };

  // Set a transition on EVERY cut at once — the "transitions to all cuts" move
  // every editor has. A clip's `transition` is its INCOMING blend (drawn over the
  // previous clip on the same track), so we apply it to every video clip that has
  // an earlier clip before it on its own track, skipping the first clip per track
  // (nothing to blend from). Passing 'none' clears them all. Length defaults to
  // the clip's current transDur (or 0.5s).
  const applyTransitionsToAllCuts = (id: TransitionId) => {
    const next = cloneDoc(doc);
    const videos = next.clips.filter(c => c.kind === 'video') as VideoClip[];
    let changed = 0;
    for (const c of videos) {
      // Is there an earlier clip on the same track? → this is a cut, not the lead-in.
      const hasPrev = videos.some(o => o.trackId === c.trackId && o.id !== c.id && o.start < c.start);
      if (!hasPrev) { if (id === 'none') { c.transition = 'none'; } continue; }
      c.transition = id;
      if (id !== 'none' && !c.transDur) c.transDur = 0.5;
      changed++;
    }
    if (!changed && id !== 'none') { toastFor('Need at least two clips on a track to add a transition'); return; }
    const label = TRANSITION_LIST.find(t => t.id === id)?.label ?? id;
    commit(`transitions: ${id}`, next);
    toastFor(id === 'none' ? 'Cleared all transitions' : `${label} added to ${changed} cut${changed > 1 ? 's' : ''}`);
  };

  // Auto-reframe: find the subject in the current preview frame (on-device
  // segmentation) and set the first video clip's PiP transform so the subject
  // stays centered + filled — the "make my 16:9 into 9:16 keeping the person"
  // move. Static (one detection); graceful if no subject is found.
  const autoReframe = async () => {
    const firstVideo = doc.clips.find(c => c.kind === 'video') as VideoClip | undefined;
    if (!firstVideo) { toastFor('Add a video clip first'); return; }
    const c = previewRef.current;
    if (!c || c.width === 0) { toastFor('Move the playhead to a frame with your subject, then try again'); return; }
    if (!(await guard())) return;
    setBusy('Finding your subject on-device…');
    try {
      const { findSubjectCenter } = await import('@/lib/studios/ai-bgremove');
      // Copy the preview into a same-origin canvas for segmentation.
      const work = document.createElement('canvas'); work.width = c.width; work.height = c.height;
      work.getContext('2d')!.drawImage(c, 0, 0);
      const subj = await findSubjectCenter(work);
      const next = cloneDoc(doc);
      const vc = next.clips.find(x => x.id === firstVideo.id) as VideoClip | undefined;
      if (!vc) return;
      // Fill the frame ('cover') and shift so the subject's center sits at the
      // frame center. cx/cy are 0..1; transform.x/y offset from center in frame units.
      vc.fit = 'cover';
      const cx = subj?.cx ?? 0.5, cy = subj?.cy ?? 0.5;
      vc.transform = { x: (0.5 - cx), y: (0.5 - cy) * 0.6, scale: 1.15, rotation: 0 };
      commit('auto-reframe', next);
      toastFor(subj ? 'Reframed around your subject — tweak in Transform (PiP)' : 'No clear subject — centered the frame');
    } catch (e) {
      toastFor((e as Error).message || 'Auto-reframe failed');
    } finally { setBusy(''); }
  };

  // AI Auto-Cut: drop footage + a song → a paced, BEAT-SYNCED rough cut on the
  // timeline in seconds. 100% on-device, NO model, NO upload — the free browser
  // answer to CapCut's signature first step (which CapCut WEB doesn't even have).
  //  1. detect the music's beats (on-device DSP),
  //  2. score the footage by audio energy (loud/active = keep),
  //  3. lay the best segments back-to-back so every cut lands on a beat,
  //  4. drop the music underneath.
  const autoCut = async () => {
    const vids = media.filter(m => m.kind === 'video');
    if (!vids.length) { toastFor('Import a video clip first'); return; }
    const music = media.find(m => m.kind === 'audio');
    const vid = vids.slice().sort((a, b) => b.duration - a.duration)[0]; // longest = most to cut from
    if (!(await guard())) return;
    setBusy('Listening for the beat…');
    try {
      const { detectBeats } = await import('@/lib/studios/beat-detect');
      // Beats come from the music if present, else the footage's own audio.
      const beatSrc = music?.file ?? vid.file;
      const info = await detectBeats(beatSrc);
      const songDur = music?.duration ?? Math.min(vid.duration, 30);

      // Build a beat grid spanning the song. Cut every 2 beats (a musical
      // half-bar) for a punchy pace; fall back to ~1.2s if no clear tempo.
      let cutPoints: number[] = [];
      if (info && info.confidence > 0.05 && info.beats.length > 2) {
        for (let i = 0; i < info.beats.length; i += 2) if (info.beats[i] <= songDur) cutPoints.push(info.beats[i]);
      }
      if (cutPoints.length < 2) { cutPoints = []; for (let t = 0; t <= songDur; t += 1.2) cutPoints.push(+t.toFixed(3)); }
      if (cutPoints[cutPoints.length - 1] < songDur) cutPoints.push(songDur);

      setBusy('Scoring your footage…');
      // Energy bins of the footage (RMS @ 10 bins/s), on-device.
      const energy = await videoEnergyBins(vid.file, 10);

      // For each timeline gap between consecutive cut points, pick the
      // highest-energy unused window of that length from the footage.
      const next = cloneDoc(docRef.current);
      const vTrack = next.tracks.find(t => t.kind === 'video')!;
      // Clear existing video clips on V1 so Auto-Cut produces a clean edit.
      next.clips = next.clips.filter(c => !(c.kind === 'video' && c.trackId === vTrack.id));
      const used: Array<[number, number]> = []; // claimed source windows (sec)
      const binsPerSec = 10;
      let added = 0;
      for (let i = 0; i < cutPoints.length - 1; i++) {
        const segLen = Math.max(0.3, cutPoints[i + 1] - cutPoints[i]);
        const src = pickBestWindow(energy, binsPerSec, segLen, vid.duration, used);
        used.push([src, src + segLen]);
        const c: VideoClip = {
          id: tid(), kind: 'video', trackId: vTrack.id, mediaId: vid.id,
          start: +cutPoints[i].toFixed(3), srcStart: +src.toFixed(3), srcEnd: +(src + segLen).toFixed(3),
          speed: 1, volume: music ? 0 : 1, // duck footage audio under the music
          brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 100,
          fit: 'cover', transition: 'none', transDur: 0.5,
        };
        next.clips.push(c); added++;
      }
      // Drop the music on the first audio track.
      if (music) {
        const aTrack = next.tracks.find(t => t.kind === 'audio');
        if (aTrack) {
          next.clips = next.clips.filter(c => !(c.kind === 'audio' && c.trackId === aTrack.id));
          next.clips.push({ id: tid(), kind: 'audio', trackId: aTrack.id, mediaId: music.id, start: 0, srcStart: 0, srcEnd: songDur, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0.5 } as AudioClip);
        }
      }
      next.duration = computeDuration(next.clips);
      next.playhead = 0;
      commit('auto-cut', next);
      toastFor(info && info.confidence > 0.05
        ? `Auto-cut to the beat (${info.bpm} BPM) — ${added} cuts. Polish away.`
        : `Auto-cut — ${added} cuts. Add music for beat-sync.`);
    } catch (e) {
      toastFor((e as Error).message || 'Auto-cut failed');
    } finally { setBusy(''); }
  };

  const addTextClip = () => {
    const next = cloneDoc(doc);
    const tt = next.tracks.find(t => t.kind === 'text');
    if (!tt) return;
    const trackClips = next.clips.filter(c => c.trackId === tt.id);
    const startAt = trackClips.length ? Math.max(...trackClips.map(clipEnd)) : Math.max(0, next.playhead);
    const c: TextClip = {
      id: tid(), kind: 'text', trackId: tt.id,
      start: startAt, duration: 3,
      text: 'Your title', font: FONTS[2], size: 88, color: '#ffffff',
      weight: 900, italic: false,
      outline: true, outlineColor: '#000000', outlineWidth: 6,
      pos: 'bottom', anim: 'fade', align: 'center',
    };
    next.clips.push(c);
    next.selectedId = c.id;
    commit('add text', next);
    setTextDialogClip(c.id);
  };

  // Auto-captions: transcribe the first video clip's audio ON-DEVICE (Whisper
  // via engines/subtitle/auto) and drop one styled TextClip per spoken chunk on
  // the text track, timed to where that clip sits on the timeline. The engine
  // was already in the repo — the Video Studio just never called it.
  const autoCaption = async () => {
    const firstVideo = doc.clips.find(c => c.kind === 'video') as VideoClip | undefined;
    const item = firstVideo ? mediaMap.get(firstVideo.mediaId) : undefined;
    if (!firstVideo || !item || item.kind !== 'video') { toastFor('Add a video clip first'); return; }
    if (!(await guard())) return;
    setBusy('Listening — transcribing on your device…');
    setProgress(0);
    try {
      const { videoToCaptions } = await import('@/engines/subtitle/auto');
      const chunks = await videoToCaptions(item.file, {
        size: device.current.tier === 'low' ? 'tiny' : 'base',
        onProgress: (p) => { setBusy(p.phase + '…'); setProgress(Math.round(p.ratio * 100)); },
      });
      if (!chunks.length) { toastFor('No speech detected'); return; }
      const next = cloneDoc(doc);
      const tt = next.tracks.find(t => t.kind === 'text');
      if (!tt) return;
      // Map source-time chunks onto timeline time: account for the clip's
      // srcStart/speed and where it starts on the timeline.
      const toTimeline = (srcT: number) => firstVideo.start + (srcT - firstVideo.srcStart) / Math.max(0.01, firstVideo.speed);
      let added = 0;
      for (const ch of chunks) {
        const start = Math.max(0, toTimeline(ch.start));
        const end = toTimeline(ch.end);
        const dur = Math.max(0.4, end - start);
        if (!ch.text.trim()) continue;
        next.clips.push({
          id: tid(), kind: 'text', trackId: tt.id,
          start, duration: dur,
          text: ch.text.trim(), font: FONTS[0], size: 64, color: '#ffffff',
          weight: 800, italic: false,
          outline: true, outlineColor: '#000000', outlineWidth: 5,
          pos: 'bottom', anim: 'fade', align: 'center', caption: true,
        });
        added++;
      }
      commit(`auto-caption (${added})`, next);
      setCaptionsPanel(true); // open the editor so the user can fix mistranscriptions
      toastFor(`Added ${added} captions — review & fix any words on the right`);
    } catch (e) {
      toastFor((e as Error).message || 'Captioning failed');
    } finally {
      setBusy(''); setProgress(0);
    }
  };

  // ── Caption styling presets (restyle ALL captions at once) ─────────────────
  const CAPTION_STYLES: { id: string; name: string; apply: (c: TextClip) => void }[] = [
    { id: 'clean', name: 'Clean', apply: c => { c.font = FONTS[0]; c.size = 60; c.color = '#ffffff'; c.weight = 700; c.outline = true; c.outlineColor = '#000'; c.outlineWidth = 4; c.pos = 'bottom'; } },
    { id: 'boxed', name: 'Boxed', apply: c => { c.font = FONTS[0]; c.size = 56; c.color = '#ffffff'; c.weight = 800; c.outline = true; c.outlineColor = '#000'; c.outlineWidth = 10; c.pos = 'bottom'; } },
    { id: 'bold', name: 'TikTok bold', apply: c => { c.font = FONTS[2]; c.size = 78; c.color = '#ffffff'; c.weight = 900; c.outline = true; c.outlineColor = '#000'; c.outlineWidth = 8; c.pos = 'center'; c.anim = 'pop'; } },
    { id: 'yellow', name: 'Pop yellow', apply: c => { c.font = FONTS[2]; c.size = 72; c.color = '#ffe14d'; c.weight = 900; c.outline = true; c.outlineColor = '#000'; c.outlineWidth = 7; c.pos = 'bottom'; } },
  ];
  const applyCaptionStyle = (styleId: string) => {
    const st = CAPTION_STYLES.find(s => s.id === styleId);
    if (!st) return;
    const next = cloneDoc(doc);
    let n = 0;
    for (const c of next.clips) if (c.kind === 'text' && (c as TextClip).caption) { st.apply(c as TextClip); n++; }
    if (!n) { toastFor('No captions to style'); return; }
    commit('style captions', next);
    toastFor(`Styled ${n} captions — ${st.name}`);
  };
  const captionClips = React.useMemo(() => (doc.clips.filter(c => c.kind === 'text' && (c as TextClip).caption) as TextClip[]).sort((a, b) => a.start - b.start), [doc.clips]);

  // C4 preset system: save the current caption look as a reusable preset and
  // apply a saved one to ALL captions. The value is the styleable subset of a
  // caption TextClip — capture from the first caption, apply to every caption.
  const captureCaptionStyle = (): CaptionStyleValue => {
    const c = captionClips[0];
    return c
      ? { font: c.font, size: c.size, color: c.color, weight: c.weight, italic: c.italic, outline: c.outline, outlineColor: c.outlineColor, outlineWidth: c.outlineWidth, pos: c.pos, anim: c.anim, align: c.align }
      : { font: FONTS[0], size: 60, color: '#ffffff', weight: 700, italic: false, outline: true, outlineColor: '#000', outlineWidth: 4, pos: 'bottom', anim: 'fade', align: 'center' };
  };
  const applyCaptionStyleValue = (v: CaptionStyleValue) => {
    const next = cloneDoc(doc);
    let n = 0;
    for (const c of next.clips) if (c.kind === 'text' && (c as TextClip).caption) { Object.assign(c as TextClip, v); n++; }
    if (!n) { toastFor('No captions to style'); return; }
    commit('apply caption preset', next);
    toastFor(`Applied preset to ${n} captions`);
  };

  const updateClip = (id: string, mut: (c: TimelineClip) => void, label = 'edit clip') => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id);
    if (!c) return;
    mut(c);
    if (c.start < 0) c.start = 0;
    commit(label, next);
  };

  // ── Drag text on the PREVIEW (Canva/CapCut parity) ─────────────────────────
  // Click a caption on the frame and drag it anywhere. We map the pointer to
  // normalized 0..1 coords (accounting for objectFit:contain letterboxing) and
  // write nx/ny on the text clip, which the renderer honours over pos/align.
  const textDrag = React.useRef<{ id: string; offX: number; offY: number } | null>(null);
  // Pointer → normalized {nx,ny} within the displayed (contained) video frame,
  // or null if the click is in the letterbox bars.
  const previewNorm = (e: React.PointerEvent, allowOutside = false): { nx: number; ny: number } | null => {
    const cv = previewRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const arDoc = doc.width / doc.height;
    const arBox = r.width / r.height;
    // Contained content rect inside the element box.
    let cw = r.width, ch = r.height, ox = 0, oy = 0;
    if (arBox > arDoc) { cw = r.height * arDoc; ox = (r.width - cw) / 2; }
    else { ch = r.width / arDoc; oy = (r.height - ch) / 2; }
    const nx = (e.clientX - r.left - ox) / cw;
    const ny = (e.clientY - r.top - oy) / ch;
    // For a press we require an in-frame click; during a drag we allow the
    // pointer to drift past the frame edge (callers clamp) so the text keeps
    // tracking smoothly instead of freezing at the border.
    if (!allowOutside && (nx < 0 || nx > 1 || ny < 0 || ny > 1)) return null;
    return { nx, ny };
  };
  const activeTextAt = (p: { nx: number; ny: number }): TextClip | null => {
    const t = doc.playhead;
    // Top-most visible text at the playhead whose box contains the point.
    const txts = doc.clips.filter(cl => cl.kind === 'text' && t >= cl.start && t < clipEnd(cl)) as TextClip[];
    for (let i = txts.length - 1; i >= 0; i--) {
      const tx = txts[i];
      const lines = tx.text.split('\n');
      const lhN = (tx.size * 1.25 / 1080); // normalized line height (≈ frame-height units)
      const hN = lines.length * lhN;
      const wN = Math.max(0.08, Math.max(1, ...lines.map(s => s.length)) * tx.size * 0.6 / 1920);
      const cxN = tx.nx ?? (tx.align === 'center' ? 0.5 : tx.align === 'right' ? 0.94 : 0.06);
      const cyN = tx.ny ?? (tx.pos === 'top' ? 0.12 : tx.pos === 'center' ? 0.5 : 0.88);
      if (Math.abs(p.nx - cxN) <= wN / 2 + 0.02 && Math.abs(p.ny - cyN) <= hN / 2 + 0.03) return tx;
    }
    return null;
  };
  const onPreviewDown = (e: React.PointerEvent) => {
    const p = previewNorm(e);
    if (!p) return;
    // 1) If an image/video overlay is selected, its gizmo handles win.
    const b = overlayBox;
    if (b && selectedOverlay) {
      const h = gizmoHandleAt(p);
      if (h) {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const tf = selectedOverlay.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
        if (h === 'move') gizmoDrag.current = { mode: 'move', offX: p.nx - b.cx, offY: p.ny - b.cy };
        else if (h === 'rotate') gizmoDrag.current = { mode: 'rotate', startRot: tf.rotation, startAngle: Math.atan2(p.ny - b.cy, p.nx - b.cx) };
        else gizmoDrag.current = { mode: 'resize', startScale: tf.scale, startDist: Math.hypot(p.nx - b.cx, p.ny - b.cy) };
        return;
      }
    }
    // 2) Otherwise try selecting an image/video overlay UNDER the pointer so a
    //    single tap selects it (then handles appear next frame).
    {
      const t = doc.playhead;
      const overlays = doc.clips.filter(c => c.kind === 'video' && t >= c.start && t < clipEnd(c) && (c as VideoClip).transform && ((c as VideoClip).transform!.scale !== 1 || (c as VideoClip).transform!.x !== 0 || (c as VideoClip).transform!.y !== 0)) as VideoClip[];
      for (let i = overlays.length - 1; i >= 0; i--) {
        const v = overlays[i];
        const tf = v.transform!;
        const cx = 0.5 + tf.x, cy = 0.5 + tf.y, hw = 0.5 * tf.scale, hh = 0.5 * tf.scale;
        const a = (tf.rotation * Math.PI) / 180;
        const dx = p.nx - cx, dy = p.ny - cy;
        const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          gizmoDrag.current = { mode: 'move', offX: lx === 0 ? 0 : p.nx - cx, offY: p.ny - cy };
          const seeded = { ...doc, selectedId: v.id };
          docRef.current = seeded; setDoc(seeded);
          return;
        }
      }
    }
    // 3) Fall back to text drag.
    const hit = activeTextAt(p);
    if (!hit) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // Seed nx/ny from current placement, and remember the grab OFFSET (pointer −
    // block center) so dragging the edge of the text doesn't snap its center to
    // the cursor — the text moves relative to where you grabbed it.
    const cxN = hit.nx ?? (hit.align === 'center' ? 0.5 : hit.align === 'right' ? 0.94 : 0.06);
    const cyN = hit.ny ?? (hit.pos === 'top' ? 0.12 : hit.pos === 'center' ? 0.5 : 0.88);
    textDrag.current = { id: hit.id, offX: p.nx - cxN, offY: p.ny - cyN };
    const seeded = { ...doc, selectedId: hit.id, clips: doc.clips.map(c => c.id === hit.id ? { ...c, nx: cxN, ny: cyN } as TextClip : c) };
    docRef.current = seeded; setDoc(seeded);
  };
  const onPreviewMove = (e: React.PointerEvent) => {
    // Gizmo drag (image/video overlay) takes priority over text drag.
    if (gizmoDrag.current && selectedOverlay) {
      const p = previewNorm(e, true);
      if (!p) return;
      const g = gizmoDrag.current;
      const id = selectedOverlay.id;
      const cur = docRef.current.clips.find(c => c.id === id) as VideoClip | undefined;
      if (!cur) return;
      const tf = { ...(cur.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }) };
      const cx = 0.5 + tf.x, cy = 0.5 + tf.y;
      if (g.mode === 'move') { tf.x = Math.max(-0.5, Math.min(0.5, p.nx - 0.5 - g.offX)); tf.y = Math.max(-0.5, Math.min(0.5, p.ny - 0.5 - g.offY)); }
      else if (g.mode === 'rotate') { let deg = g.startRot + ((Math.atan2(p.ny - cy, p.nx - cx) - g.startAngle) * 180) / Math.PI; if (e.shiftKey) deg = Math.round(deg / 15) * 15; tf.rotation = Math.round(deg); }
      else { const d = Math.hypot(p.nx - cx, p.ny - cy); tf.scale = Math.max(0.05, Math.min(4, g.startScale * (d / Math.max(0.001, g.startDist)))); }
      const next = { ...docRef.current, clips: docRef.current.clips.map(c => c.id === id ? { ...c, transform: tf } as VideoClip : c) };
      docRef.current = next; setDoc(next);
      return;
    }
    if (!textDrag.current) return;
    const p = previewNorm(e, true);
    if (!p) return;
    const { id, offX, offY } = textDrag.current;
    const nx = Math.max(0, Math.min(1, p.nx - offX));
    const ny = Math.max(0, Math.min(1, p.ny - offY));
    // Live, cheap update (no undo entry per frame); keep docRef in sync so the
    // pointer-up commit captures the final position.
    const next = { ...docRef.current, clips: docRef.current.clips.map(c => c.id === id ? { ...c, nx, ny } as TextClip : c) };
    docRef.current = next; setDoc(next);
  };
  const onPreviewUp = () => {
    if (gizmoDrag.current) {
      const m = gizmoDrag.current.mode;
      gizmoDrag.current = null;
      commit(m === 'move' ? 'move overlay' : m === 'rotate' ? 'rotate overlay' : 'resize overlay', docRef.current);
      return;
    }
    if (!textDrag.current) return;
    textDrag.current = null;
    // One undo step for the whole drag.
    commit('move text', docRef.current);
  };
  // Double-click/tap an element on the preview → select it AND focus its
  // inspector (the "edit this element" view with a Back to timeline).
  const onPreviewDoubleClick = (e: React.MouseEvent) => {
    const p = previewNorm(e as unknown as React.PointerEvent);
    if (!p) return;
    // image/video overlay under the point?
    const t = doc.playhead;
    const overlays = doc.clips.filter(c => c.kind === 'video' && t >= c.start && t < clipEnd(c) && (c as VideoClip).transform && ((c as VideoClip).transform!.scale !== 1 || (c as VideoClip).transform!.x !== 0 || (c as VideoClip).transform!.y !== 0)) as VideoClip[];
    for (let i = overlays.length - 1; i >= 0; i--) {
      const v = overlays[i]; const tf = v.transform!;
      const cx = 0.5 + tf.x, cy = 0.5 + tf.y, hw = 0.5 * tf.scale, hh = 0.5 * tf.scale;
      const a = (tf.rotation * Math.PI) / 180;
      const dx = p.nx - cx, dy = p.ny - cy;
      const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) { setDoc(d => ({ ...d, selectedId: v.id })); setFocusedId(v.id); return; }
    }
    // text under the point?
    const hit = activeTextAt(p);
    if (hit) { setDoc(d => ({ ...d, selectedId: hit.id })); setFocusedId(hit.id); }
  };

  // ── Direct-manipulation GIZMO for image/video overlays on the preview ──────
  // The selected image or PiP-video overlay (a clip with a `transform`) gets a
  // move/resize/rotate gizmo on the frame, like Canva/CapCut. We work in
  // frame-normalized coords (0..1) so the math matches the renderer/exporter:
  //   center = (0.5 + tf.x, 0.5 + tf.y);  half-size grows with tf.scale.
  // The displayed box approximates the clip's fitted rect × scale; this is the
  // same value the renderer uses, so the handles sit on the real pixels.
  const selectedOverlay = React.useMemo(() => {
    const c = doc.clips.find(x => x.id === doc.selectedId);
    if (!c || (c.kind !== 'video')) return null;
    const t = doc.playhead;
    if (!(t >= c.start && t < clipEnd(c))) return null; // only when visible at playhead
    return c as VideoClip;
  }, [doc.selectedId, doc.clips, doc.playhead]);

  // Frame-normalized box {cx,cy,hw,hh,rot} of the selected overlay, or null.
  const overlayBox = React.useMemo(() => {
    const v = selectedOverlay;
    if (!v) return null;
    const tf = v.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
    // Approximate the fitted half-extent: a fit='contain' image fills one axis.
    // We use a square-ish default and let scale drive size; the renderer applies
    // the same scale about the frame center so visually it lines up.
    const baseHW = 0.5, baseHH = 0.5; // unit box = full frame at scale 1
    return { cx: 0.5 + tf.x, cy: 0.5 + tf.y, hw: baseHW * tf.scale, hh: baseHH * tf.scale, rot: tf.rotation };
  }, [selectedOverlay]);

  const gizmoDrag = React.useRef<
    | { mode: 'move'; offX: number; offY: number }
    | { mode: 'resize'; startScale: number; startDist: number }
    | { mode: 'rotate'; startRot: number; startAngle: number }
    | null
  >(null);

  // Hit-test the gizmo handles at a normalized point. Returns the handle or null.
  const gizmoHandleAt = (p: { nx: number; ny: number }): 'rotate' | 'resize' | 'move' | null => {
    const b = overlayBox;
    if (!b) return null;
    const tol = 0.04;
    // rotate handle: above top-center (in unrotated local space, then rotate)
    const a = (b.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const local = (lx: number, ly: number) => ({ x: b.cx + lx * ca - ly * sa, y: b.cy + lx * sa + ly * ca });
    const rotPt = local(0, -b.hh - 0.06);
    if (Math.hypot(p.nx - rotPt.x, p.ny - rotPt.y) <= tol) return 'rotate';
    // corner handles (resize) — any corner drives uniform scale
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const c = local(sx * b.hw, sy * b.hh);
      if (Math.hypot(p.nx - c.x, p.ny - c.y) <= tol) return 'resize';
    }
    // body (move) — point inside the (unrotated) box after de-rotating
    const dx = p.nx - b.cx, dy = p.ny - b.cy;
    const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    if (Math.abs(lx) <= b.hw && Math.abs(ly) <= b.hh) return 'move';
    return null;
  };

  const splitAt = (clipId: string, t: number) => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === clipId);
    if (!c) return;
    const local = t - c.start;
    if (local <= 0.05 || local >= clipDuration(c) - 0.05) return;
    const copy: TimelineClip = JSON.parse(JSON.stringify(c));
    copy.id = tid();
    if (c.kind === 'text') {
      const tA = c as TextClip;
      const tB = copy as TextClip;
      tB.start = c.start + local;
      tB.duration = tA.duration - local;
      tA.duration = local;
    } else {
      const va = c as VideoClip | AudioClip;
      const vb = copy as VideoClip | AudioClip;
      const local0 = va.srcStart + local * va.speed;
      vb.start = va.start + local;
      vb.srcStart = local0;
      va.srcEnd = local0;
    }
    next.clips.push(copy);
    commit('split', next);
  };

  const deleteClip = (id: string) => {
    const next = cloneDoc(doc);
    next.clips = next.clips.filter(c => c.id !== id);
    if (next.selectedId === id) next.selectedId = null;
    commit('delete clip', next);
  };

  const duplicateClip = (id: string) => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id);
    if (!c) return;
    const copy: TimelineClip = JSON.parse(JSON.stringify(c));
    copy.id = tid();
    copy.start = clipEnd(c);
    next.clips.push(copy);
    next.selectedId = copy.id;
    commit('duplicate', next);
  };

  const rippleDelete = (id: string) => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id);
    if (!c) return;
    const dur = clipDuration(c);
    const trackId = c.trackId;
    next.clips = next.clips.filter(x => x.id !== id);
    for (const o of next.clips) if (o.trackId === trackId && o.start > c.start) o.start -= dur;
    commit('ripple delete', next);
  };

  // Trim a clip edge to timeline-time `t`. When `ripple` is on, the change in
  // duration is propagated: downstream clips on the same track shift by the same
  // delta so the cut closes/opens the gap (Premiere/DaVinci ripple trim).
  const trimClip = (id: string, edge: 'l' | 'r', t: number) => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id);
    if (!c) return;
    const oldEnd = clipEnd(c), oldStart = c.start;
    if (c.kind === 'text') {
      if (edge === 'l') { const newDur = c.duration + (oldStart - t); if (newDur > 0.05) { c.start = t; c.duration = newDur; } }
      else { c.duration = Math.max(0.05, t - c.start); }
    } else {
      if (edge === 'l') {
        const delta = t - c.start;
        const newSrcStart = (c as VideoClip).srcStart + delta * (c as VideoClip).speed;
        if (newSrcStart < (c as VideoClip).srcEnd - 0.05 && t < clipEnd(c) - 0.05) { c.start = t; (c as VideoClip).srcStart = newSrcStart; }
      } else {
        const newSrcEnd = (c as VideoClip).srcStart + (t - c.start) * (c as VideoClip).speed;
        if (newSrcEnd > (c as VideoClip).srcStart + 0.05) (c as VideoClip).srcEnd = newSrcEnd;
      }
    }
    if (ripple) {
      // How much the EDGE moved on the timeline → shift everything downstream.
      const newStart = c.start, newEnd = clipEnd(c);
      const shift = edge === 'l' ? (newStart - oldStart) : (newEnd - oldEnd);
      if (shift !== 0) {
        const fromX = edge === 'l' ? oldStart : oldEnd;
        for (const o of next.clips) if (o.id !== c.id && o.trackId === c.trackId && o.start >= fromX - 1e-4) o.start = Math.max(0, o.start + shift);
      }
    }
    commit(ripple ? 'ripple trim' : 'trim', next);
  };
  // Slip: slide the source window (srcStart/srcEnd) under a fixed clip position
  // by `dt` seconds — the clip stays put, a different part of the footage plays.
  const slipClip = (id: string, dt: number) => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id) as VideoClip | undefined;
    if (!c || c.kind !== 'video') return;
    const span = c.srcEnd - c.srcStart;
    let ns = c.srcStart + dt * c.speed;
    ns = Math.max(0, ns);
    c.srcStart = ns; c.srcEnd = ns + span;
    commit('slip', next);
  };

  // Trim around the playhead — CapCut's Q ("delete left of cursor") and W
  // ("delete right of cursor"), the fast-trim verbs power users live on. We trim
  // the SELECTED clip if the playhead sits inside it; otherwise we trim every
  // clip the playhead crosses (a quick "topp/tail at the cursor" on all tracks).
  const trimToPlayhead = (side: 'left' | 'right') => {
    const t = doc.playhead;
    const sel = doc.clips.find(c => c.id === doc.selectedId);
    const targets = (sel && t > sel.start && t < clipEnd(sel))
      ? [sel]
      : doc.clips.filter(c => t > c.start && t < clipEnd(c));
    if (!targets.length) { toastFor('Put the playhead over a clip first'); return; }
    const next = cloneDoc(doc);
    let changed = 0;
    for (const tc of targets) {
      const c = next.clips.find(x => x.id === tc.id);
      if (!c) continue;
      const local = t - c.start;
      if (c.kind === 'text') {
        if (side === 'left') { c.duration = c.duration - local; c.start = t; }
        else { c.duration = local; }
      } else {
        const v = c as VideoClip | AudioClip;
        if (side === 'left') { v.srcStart = v.srcStart + local * v.speed; v.start = t; }
        else { v.srcEnd = v.srcStart + local * v.speed; }
      }
      changed++;
    }
    if (!changed) return;
    commit(side === 'left' ? 'trim left of playhead' : 'trim right of playhead', next);
  };

  const selectedClip = doc.clips.find(c => c.id === doc.selectedId) ?? null;
  // Drop focus if the focused element was deleted (keeps the Back-flow honest).
  React.useEffect(() => {
    if (focusedId && !doc.clips.find(c => c.id === focusedId)) setFocusedId(null);
  }, [focusedId, doc.clips]);

  const drawPreviewFrame = React.useCallback((t: number) => {
    const c = previewRef.current;
    if (!c) return;
    const lowTier = device.current.tier === 'low';
    const maxW = lowTier ? Math.min(doc.width, 1280) : doc.width;
    const scale = maxW / doc.width;
    const cw = Math.round(doc.width * scale);
    const ch = Math.round(doc.height * scale);
    // Only reassign width/height when they actually change — assigning canvas.width
    // CLEARS the canvas, so doing it every draw wiped any async video frame that
    // had just landed (decode resolves after this sync pass), leaving the preview
    // black. Clearing via fillRect each pass is enough.
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, c.width, c.height);

    const videoTracks = doc.tracks.filter(tr => tr.kind === 'video');
    for (let i = videoTracks.length - 1; i >= 0; i--) {
      const tr = videoTracks[i];
      const trackClips = (doc.clips.filter(cl => cl.trackId === tr.id && cl.kind === 'video') as VideoClip[]).sort((a, b) => a.start - b.start);
      const ai = trackClips.findIndex(cl => t >= cl.start && t < clipEnd(cl));
      const active = ai >= 0 ? trackClips[ai] : undefined;
      if (!active) continue;
      const item = mediaMap.get(active.mediaId);
      if (!item) continue;
      // Transition preview: during the opening transDur, draw the previous clip
      // underneath (held on its last frame) and ramp the incoming clip's alpha
      // (fade) — a visible cue matching the export's WYSIWYG transition.
      const transDur = active.transDur ?? 0.5;
      const inTrans = !!active.transition && active.transition !== 'none' && (t - active.start) < transDur && ai > 0;
      // True transition parity with the export: during the opening transDur, draw
      // the held previous frame underneath, then set up the SAME transition (slide/
      // wipe/zoom/circle/blur/spin/fade…) on the incoming frame via setupTransition.
      const transP = inTrans ? Math.min(1, (t - active.start) / transDur) : 1;
      if (inTrans) {
        const prev = trackClips[ai - 1];
        const pItem = mediaMap.get(prev.mediaId);
        if (pItem) {
          const pLocalT = clipDuration(prev);
          if (pItem.kind === 'image') { const im = new Image(); im.src = pItem.url; if (im.complete) drawVideoFrame(ctx, im, c.width, c.height, prev, pLocalT); }
          else { const pv = getMediaEl(pItem) as HTMLVideoElement; if (pv.readyState >= 2) drawVideoFrame(ctx, pv, c.width, c.height, prev, pLocalT); }
        }
      }
      // Wrap a draw with the transition setup so preview == export.
      const drawWithTrans = (cx: CanvasRenderingContext2D, drawFn: () => void) => {
        if (!inTrans) { drawFn(); return; }
        cx.save();
        setupTransition(cx, active.transition as TransitionId, transP, c.width, c.height);
        drawFn();
        cx.filter = 'none';
        cx.restore();
      };
      if (item.kind === 'image') {
        const img = new Image();
        img.src = item.url;
        if (img.complete) drawWithTrans(ctx, () => drawVideoFrame(ctx, img, c.width, c.height, active, 0, 1));
      } else {
        const local = (t - active.start) * active.speed + active.srcStart;
        const localT = t - active.start;
        if (playerRef.current?.hasClip(item.id)) {
          void playerRef.current.frameAt(item.id, local, lowTier ? 1 / 12 : 1 / 24).then(bitmap => {
            if (!bitmap) return;
            if (Math.abs(doc.playhead - t) > 0.05) { try { bitmap.close?.(); } catch {} return; }
            const cc = previewRef.current;
            if (!cc) return;
            const ctx2 = cc.getContext('2d')!;
            drawWithTrans(ctx2, () => drawVideoFrame(ctx2, bitmap as any, cc.width, cc.height, active, localT, 1));
          });
        } else {
          const v = getMediaEl(item) as HTMLVideoElement;
          if (Math.abs(v.currentTime - local) > 0.2 && !isNaN(v.duration)) {
            try { v.currentTime = Math.min(Math.max(local, 0), v.duration); } catch {}
          }
          if (v.readyState >= 2) drawWithTrans(ctx, () => drawVideoFrame(ctx, v, c.width, c.height, active, localT, 1));
        }
      }
    }

    const textTrack = doc.tracks.find(tr => tr.kind === 'text');
    if (textTrack) {
      const txts = doc.clips.filter(cl => cl.trackId === textTrack.id && cl.kind === 'text' && t >= cl.start && t < clipEnd(cl)) as TextClip[];
      for (const tx of txts) {
        drawTextClip(ctx, tx, c.width, c.height, t);
      }
    }
  }, [doc, mediaMap]);

  const throttledDraw = useRafThrottle(drawPreviewFrame);
  // Redraw when the playhead moves OR when the rendered content changes (clips
  // added/removed/edited, background). Without the content deps, applying a
  // template — which leaves playhead at 0 — never repainted, so the title at
  // t=0 stayed invisible and the template looked like it did nothing.
  React.useEffect(() => { throttledDraw(doc.playhead); }, [doc.playhead, doc.clips, doc.background, doc.width, doc.height, throttledDraw]);

  usePinchPan({ ref: previewWrapRef, zoom: previewZoom, pan: previewPan, setZoom: setPreviewZoom, setPan: setPreviewPan, minZoom: 0.2, maxZoom: 6 });

  React.useEffect(() => {
    if (!showScopes) return;
    const preview = previewRef.current;
    if (!preview || preview.width === 0) return;
    if (histoRef.current) {
      histoRef.current.width = histoRef.current.clientWidth;
      histoRef.current.height = histoRef.current.clientHeight;
      renderHistogram(histoRef.current, preview, 'rgb');
    }
    if (waveRef.current) {
      waveRef.current.width = waveRef.current.clientWidth;
      waveRef.current.height = waveRef.current.clientHeight;
      renderWaveformScope(waveRef.current, preview, 'luma');
    }
    if (vectorRef.current) {
      vectorRef.current.width = vectorRef.current.clientWidth;
      vectorRef.current.height = vectorRef.current.clientHeight;
      renderVectorscope(vectorRef.current, preview);
    }
  }, [showScopes, doc.playhead, doc.clips]);

  React.useEffect(() => {
    if (!playing) {
      videoElems.current.forEach(v => v.pause());
      audioElems.current.forEach(a => a.pause());
      return;
    }
    let raf = 0;
    const t0 = performance.now() / 1000;
    const startedAt = doc.playhead;
    playStart.current = { at: startedAt, t0 };

    // Track which (track,clip) pairs are CURRENTLY playing so we don't spam
    // play() on every RAF frame — repeated play() calls on a paused element
    // can trip browser throttles and reset playback position.
    const activeAudio = new Set<string>();
    const activeVideo = new Set<string>();

    const playAudio = (t: number) => {
      const wantedAudio = new Set<string>();
      for (const tr of doc.tracks) {
        if (tr.kind !== 'audio' || tr.muted) continue;
        const ac = doc.clips.find(c => c.trackId === tr.id && c.kind === 'audio' && t >= c.start && t < clipEnd(c)) as AudioClip | undefined;
        if (!ac) continue;
        const item = mediaMap.get(ac.mediaId);
        if (!item) continue;
        const a = getMediaEl(item) as HTMLAudioElement;
        const local = (t - ac.start) * ac.speed + ac.srcStart;
        if (Math.abs(a.currentTime - local) > 0.25 && isFinite(a.duration)) try { a.currentTime = local; } catch {}
        a.volume = Math.max(0, Math.min(1, ac.volume * doc.master.volume));
        wantedAudio.add(ac.id);
        if (!activeAudio.has(ac.id) && a.paused) a.play().catch(() => {});
      }
      // Pause clips whose active window ended.
      for (const id of activeAudio) {
        if (!wantedAudio.has(id)) {
          const ac = doc.clips.find(c => c.id === id) as AudioClip | undefined;
          if (ac) {
            const item = mediaMap.get(ac.mediaId);
            if (item) (getMediaEl(item) as HTMLAudioElement).pause();
          }
        }
      }
      activeAudio.clear();
      wantedAudio.forEach(id => activeAudio.add(id));

      const wantedVideo = new Set<string>();
      for (const tr of doc.tracks) {
        if (tr.kind !== 'video' || tr.muted) continue;
        const vc = doc.clips.find(c => c.trackId === tr.id && c.kind === 'video' && t >= c.start && t < clipEnd(c)) as VideoClip | undefined;
        if (!vc) continue;
        const item = mediaMap.get(vc.mediaId);
        if (!item || item.kind !== 'video') continue;
        const v = getMediaEl(item) as HTMLVideoElement;
        const local = (t - vc.start) * vc.speed + vc.srcStart;
        if (Math.abs(v.currentTime - local) > 0.25 && isFinite(v.duration)) try { v.currentTime = local; } catch {}
        // Belt + braces: muted AND volume 0 (some browsers honor only one).
        v.muted = true; v.volume = 0;
        wantedVideo.add(vc.id);
        if (!activeVideo.has(vc.id) && v.paused) v.play().catch(() => {});
      }
      for (const id of activeVideo) {
        if (!wantedVideo.has(id)) {
          const vc = doc.clips.find(c => c.id === id) as VideoClip | undefined;
          if (vc) {
            const item = mediaMap.get(vc.mediaId);
            if (item) (getMediaEl(item) as HTMLVideoElement).pause();
          }
        }
      }
      activeVideo.clear();
      wantedVideo.forEach(id => activeVideo.add(id));
    };

    const loop = () => {
      const now = performance.now() / 1000;
      const t = startedAt + (now - t0);
      if (t >= doc.duration + 0.05) {
        setPlaying(false);
        setDoc(d => ({ ...d, playhead: doc.duration }));
        return;
      }
      setDoc(d => ({ ...d, playhead: t }));
      playAudio(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      videoElems.current.forEach(v => v.pause());
      audioElems.current.forEach(a => a.pause());
    };
  }, [playing, doc.duration, doc.clips, doc.tracks, mediaMap]);

  const togglePlay = () => {
    setPlaying(p => {
      const next = !p;
      if (next) {
        // CRITICAL: prime every audio + video element INSIDE the user-gesture
        // window. Browser autoplay policy treats the click handler as the
        // gesture; by the time the useEffect's requestAnimationFrame fires,
        // the gesture may have expired and `a.play()` would silently reject
        // with NotAllowedError. Calling play() here (synchronously inside
        // the React event handler) tags each element as gesture-permitted
        // so the subsequent RAF schedule works.
        const t = doc.playhead;
        for (const tr of doc.tracks) {
          if (tr.kind !== 'audio' || tr.muted) continue;
          const ac = doc.clips.find(c => c.trackId === tr.id && c.kind === 'audio' && t >= c.start && t < clipEnd(c)) as AudioClip | undefined;
          if (!ac) continue;
          const item = mediaMap.get(ac.mediaId);
          if (!item) continue;
          const a = getMediaEl(item) as HTMLAudioElement;
          const local = (t - ac.start) * ac.speed + ac.srcStart;
          try { if (isFinite(a.duration)) a.currentTime = local; } catch {}
          a.volume = Math.max(0, Math.min(1, ac.volume * doc.master.volume));
          a.play().catch(() => {});
        }
        for (const tr of doc.tracks) {
          if (tr.kind !== 'video' || tr.muted) continue;
          const vc = doc.clips.find(c => c.trackId === tr.id && c.kind === 'video' && t >= c.start && t < clipEnd(c)) as VideoClip | undefined;
          if (!vc) continue;
          const item = mediaMap.get(vc.mediaId);
          if (!item || item.kind !== 'video') continue;
          const v = getMediaEl(item) as HTMLVideoElement;
          v.muted = true; v.volume = 0;
          v.play().catch(() => {});
        }
      }
      return next;
    });
  };
  const seek = (t: number) => {
    setPlaying(false);
    setDoc(d => ({ ...d, playhead: Math.max(0, Math.min(d.duration, t)) }));
  };

  const exportNow = async () => {
    const preset = PRESETS.find(p => p.id === exportPreset) ?? PRESETS[0];
    const resHit = checkLever(POLICY_KEY, 'output-resolution', preset.h, isPro);
    if (resHit) { policyGate.fire(resHit); return; }
    const fpsHit = checkLever(POLICY_KEY, 'output-fps', preset.fps, isPro);
    if (fpsHit) { policyGate.fire(fpsHit); return; }
    const durHit = checkLever(POLICY_KEY, 'input-duration', doc.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    const trackHit = checkLever(POLICY_KEY, 'tracks', doc.tracks.length, isPro);
    if (trackHit) { policyGate.fire(trackHit); return; }
    const fmtHit = checkFormat(POLICY_KEY, 'mp4', isPro);
    if (fmtHit) { policyGate.fire(fmtHit); return; }
    if (!(await guard())) return;
    if (!doc.clips.some(c => c.kind === 'video')) { toastFor('Add at least one video or image clip'); return; }
    setBusy('Rendering — this may take a minute…');
    setProgress(0);
    try {
      // WYSIWYG export: render the timeline frame-by-frame exactly as the
      // preview composites it (every video track / PiP, per-clip color wheels,
      // RGB curves, keyframed brightness/contrast/saturation/hue/opacity,
      // animated text) and mix down ALL audio clips with their fades/speed.
      // The old concatClips path dropped all of that.
      const { exportTimeline } = await import('@/engines/video/compositor');
      const compMedia = media.map(m => ({
        id: m.id, kind: m.kind, file: m.file, url: m.url,
        width: m.width, height: m.height, duration: m.duration,
      }));
      const compDoc = {
        width: doc.width, height: doc.height, fps: preset.fps, background: doc.background,
        duration: doc.duration,
        tracks: doc.tracks.map(t => ({ id: t.id, kind: t.kind, muted: t.muted })),
        clips: doc.clips as any,
        master: { ...doc.master },
      };
      const result = await exportTimeline(compDoc as any, compMedia as any, {
        width: preset.w, height: preset.h, fps: preset.fps,
        isPro,
        onProgress: (r) => setProgress(Math.round(r * 100)),
      });
      downloadBlob(result.blob, `${safeFilename(doc.name)}.mp4`);
      toastFor(result.capped
        ? `Exported at ${result.width}×${result.height} (capped for this device)`
        : 'Exported');
      setExportDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally {
      setBusy(''); setProgress(0);
    }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const lite: DocStateLite = {
        ...doc,
        clips: doc.clips.map(c => ({ ...c })),
        tracks: doc.tracks.map(t => ({ ...t })),
        mediaRefs: media.map(m => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration, width: m.width, height: m.height, thumb: m.thumb })),
      };
      const proj = newProject('video', doc.name, lite);
      await saveProject(proj);
      toastFor('Saved');
    } finally {
      setBusy('');
    }
  };

  const openSaved = async () => {
    const list = await listProjects('video');
    setSavedList(list);
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<DocStateLite>(id);
      if (!p) return;
      const { mediaRefs, ...rest } = p.state;
      setDoc({ ...rest, selectedId: null, playhead: 0 });
      stack.current.reset(cloneDoc(rest as DocState), 'open');
      toastFor('Files need to be reimported');
      setOpenDialog(false);
    } finally {
      setBusy('');
    }
  };

  // ── Clipboard paste ────────────────────────────────────────────────────────
  // CapCut/Veed parity: paste a screenshot or copied image/video straight onto
  // the timeline (Ctrl+V). The fastest path from "took a screenshot" to "it's in
  // my edit". Ignored while typing in a text field so it never steals the caret.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/') || it.type.startsWith('video/') || it.type.startsWith('audio/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        void (async () => {
          await ingestFiles(files);
          toastFor(`Pasted ${files.length} item${files.length > 1 ? 's' : ''} — added to the media pool`);
        })();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag-and-drop import ──────────────────────────────────────────────────
  // The rival's signature opening move: drag a folder of clips straight onto the
  // page. A full-window drop overlay highlights the canvas, and nothing uploads
  // (a privacy toast confirms "processed on your device"). We count nested drag
  // enter/leave so the overlay doesn't flicker over child elements.
  const [dragOver, setDragOver] = React.useState(false);
  const dragDepth = React.useRef(0);
  React.useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const onEnter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); };
    const onOver = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const onLeave = (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0; setDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length) {
        void (async () => {
          await ingestFiles(files);
          toastFor('Imported on your device — nothing uploaded');
        })();
      }
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave + crash recovery ──────────────────────────────────────────────
  // Turn rivals' single most-damaging failure (browser crash mid-edit → lost
  // project) into our strength. The working doc is plain JSON (clips reference
  // media by id), so ~2s after the last edit we snapshot it to a dedicated
  // localStorage slot. On next load, a fresh (<7d) snapshot surfaces an amber
  // "Recover your last session" banner. Media blobs can't be persisted (they live
  // only in this tab), so the banner is honest: it restores the EDIT and prompts
  // a one-click reimport of the same filenames.
  const RECOVERY_KEY = 'xonvert.video-studio.recovery';
  React.useEffect(() => {
    // Only autosave a doc that actually has timeline content — never clobber the
    // recovery slot with the empty default project.
    if (doc.clips.length === 0) return;
    const id = window.setTimeout(() => {
      try {
        const snap = {
          at: Date.now(),
          name: doc.name,
          doc: { ...doc, selectedId: null },
          mediaRefs: media.map(m => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration, width: m.width, height: m.height, thumb: m.thumb })),
        };
        const payload = JSON.stringify(snap);
        // localStorage caps ~5MB; thumbnails dominate the size. If we're over
        // budget, drop the thumbs (the edit still recovers fully).
        if (payload.length < 4_500_000) {
          localStorage.setItem(RECOVERY_KEY, payload);
        } else {
          snap.mediaRefs = snap.mediaRefs.map(r => ({ ...r, thumb: undefined }));
          try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(snap)); } catch { /* quota → skip */ }
        }
      } catch { /* never let autosave throw into the editor */ }
    }, 2000);
    return () => window.clearTimeout(id);
  }, [doc, media]); // eslint-disable-line react-hooks/exhaustive-deps

  const [recovery, setRecovery] = React.useState<{ at: number; name: string; doc: DocState; mediaRefs: DocStateLite['mediaRefs'] } | null>(null);
  const recoveryChecked = React.useRef(false);
  React.useEffect(() => {
    if (recoveryChecked.current) return;
    recoveryChecked.current = true;
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Only offer a reasonably fresh snapshot, and only if there's real content.
      if (!parsed?.doc || !Array.isArray(parsed.doc.clips) || parsed.doc.clips.length === 0) { localStorage.removeItem(RECOVERY_KEY); return; }
      if (Date.now() - (parsed.at ?? 0) > 7 * 864e5) { localStorage.removeItem(RECOVERY_KEY); return; }
      setRecovery({ at: parsed.at, name: parsed.name ?? 'Untitled', doc: parsed.doc, mediaRefs: parsed.mediaRefs ?? [] });
    } catch { /* ignore corrupt recovery */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doRecover = () => {
    if (!recovery) return;
    const restored: DocState = { ...recovery.doc, selectedId: null, playhead: 0, duration: computeDuration(recovery.doc.clips) };
    setDoc(restored);
    stack.current.reset(cloneDoc(restored), 'recover');
    force();
    const need = recovery.mediaRefs.length;
    toastFor(need ? `Recovered your edit — reimport ${need} file${need > 1 ? 's' : ''} to see the media` : 'Recovered your last session');
    setRecovery(null);
  };
  const dismissRecovery = () => { try { localStorage.removeItem(RECOVERY_KEY); } catch {} setRecovery(null); };

  useRegisterShortcuts([
    {
      label: 'Playback',
      items: [
        { combo: ' ', description: 'Play / Pause' },
        { combo: 'j', description: 'Seek back 1s' },
        { combo: 'l', description: 'Seek forward 1s' },
        { combo: 'k', description: 'Stop' },
        { combo: 'left', description: 'Step back one frame' },
        { combo: 'right', description: 'Step forward one frame' },
        { combo: 'home', description: 'Jump to start' },
        { combo: 'end', description: 'Jump to end' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { combo: 'v', description: 'Select tool' },
        { combo: 'c', description: 'Razor (cut)' },
        { combo: 'h', description: 'Hand (pan)' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { combo: 's', description: 'Split clip at playhead' },
        { combo: 'mod+b', description: 'Split at playhead (CapCut)' },
        { combo: 'q', description: 'Trim left of playhead' },
        { combo: 'w', description: 'Trim right of playhead' },
        { combo: 'mod+d', description: 'Duplicate clip' },
        { combo: 'delete', description: 'Delete clip' },
        { combo: 'shift+delete', description: 'Ripple delete (close gap)' },
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
      ],
    },
    {
      label: 'File',
      items: [
        { combo: 'mod+n', description: 'New project' },
        { combo: 'mod+o', description: 'Open library' },
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
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
    { combo: ' ', handler: togglePlay },
    { combo: 'j', handler: () => seek(doc.playhead - 1) },
    { combo: 'l', handler: () => seek(doc.playhead + 1) },
    { combo: 'k', handler: () => setPlaying(false) },
    { combo: 'left', handler: () => seek(doc.playhead - 1 / doc.fps) },
    { combo: 'right', handler: () => seek(doc.playhead + 1 / doc.fps) },
    { combo: 'home', handler: () => seek(0) },
    { combo: 'end', handler: () => seek(doc.duration) },
    { combo: 'v', handler: () => setTool('select') },
    { combo: 'c', handler: () => setTool('razor') },
    { combo: 'h', handler: () => setTool('hand') },
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+n', handler: () => setNewDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'delete', handler: () => doc.selectedId && deleteClip(doc.selectedId) },
    { combo: 'backspace', handler: () => doc.selectedId && deleteClip(doc.selectedId) },
    { combo: 'shift+delete', handler: () => doc.selectedId && rippleDelete(doc.selectedId) },
    { combo: 'r', handler: () => setRipple(r => !r) },
    { combo: 'alt+,', handler: () => doc.selectedId && slipClip(doc.selectedId, -0.2) },
    { combo: 'alt+.', handler: () => doc.selectedId && slipClip(doc.selectedId, 0.2) },
    { combo: 'mod+d', handler: () => doc.selectedId && duplicateClip(doc.selectedId) },
    { combo: 's', handler: () => doc.selectedId && splitAt(doc.selectedId, doc.playhead) },
    // CapCut's core gesture — split at the playhead. We split the selected clip,
    // or whatever clip the playhead is currently over if nothing is selected.
    { combo: 'mod+b', handler: () => {
      const id = doc.selectedId ?? doc.clips.find(c => doc.playhead > c.start && doc.playhead < clipEnd(c))?.id;
      if (id) splitAt(id, doc.playhead);
    } },
    { combo: 'q', handler: () => trimToPlayhead('left') },
    { combo: 'w', handler: () => trimToPlayhead('right') },
    { combo: '+', handler: () => setZoom(z => Math.min(800, z * 1.25)) },
    { combo: '-', handler: () => setZoom(z => Math.max(20, z / 1.25)) },
  ]);

  return (
    <StudioShell>
      {policyGate.element}
      {recovery && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
          <History className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Recovered an unsaved session{recovery.name && recovery.name !== 'Untitled' ? ` — "${recovery.name}"` : ''}
            {recovery.doc.clips.length ? ` (${recovery.doc.clips.length} clips)` : ''}. Restore it?
          </span>
          <button onClick={doRecover} className="rounded bg-amber-400 px-3 py-1 font-semibold text-zinc-900 hover:bg-amber-300">Restore</button>
          <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200/80 hover:bg-white/5">Dismiss</button>
        </div>
      )}
      <StudioTopBar
        title="Video Studio Pro"
        left={
          <>
            <StudioButton variant="ghost" size="sm" onClick={() => setNewDialog(true)}><FileText className="h-3.5 w-3.5" /> New</StudioButton>
            <StudioButton variant="soft" size="sm" onClick={() => setTemplatesDialog(true)}><LayoutTemplate className="h-3.5 w-3.5" /> Templates</StudioButton>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Import
              <input type="file" accept="video/*,audio/*,image/*" multiple className="hidden" onChange={e => e.target.files && ingestFiles(e.target.files)} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><Film className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent}><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            {/* On mobile Export is pinned in the always-visible right cluster instead —
                in this horizontally-scrolling left strip it was buried/unreachable. */}
            <DesktopOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton></DesktopOnly>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
          </>
        }
        right={
          <>
            <StudioButton variant="ghost" size="sm" onClick={() => setShowScopes(s => !s)} title="Color scopes"><Activity className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={undo} disabled={!stack.current.canUndo()}><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={redo} disabled={!stack.current.canRedo()}><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            {/* Keyboard-shortcut help is meaningless on touch; its slot goes to Export. */}
            <DesktopOnly><HelpButton /></DesktopOnly>
            <MobileOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)} title="Export"><Download className="h-3.5 w-3.5" /></StudioButton></MobileOnly>
          </>
        }
      />
      {showScopes && (
        <div className="flex h-44 shrink-0 border-b border-white/5 bg-[#0a0b0e]">
          <div className="flex flex-1 flex-col border-r border-white/5">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">Histogram (RGB)</div>
            <canvas ref={histoRef} className="flex-1 w-full" />
          </div>
          <div className="flex flex-1 flex-col border-r border-white/5">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">Waveform (Luma)</div>
            <canvas ref={waveRef} className="flex-1 w-full" />
          </div>
          <div className="flex flex-1 flex-col">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">Vectorscope</div>
            <canvas ref={vectorRef} className="flex-1 w-full" />
          </div>
        </div>
      )}

      <StudioBody>
        <StudioSidebar side="left" width={240} label="Media" autoOpen={false}>
          <StudioPanel title="Media">
            <label className="mb-2 flex h-16 cursor-pointer items-center justify-center rounded border border-dashed border-white/15 text-xs text-zinc-500 hover:bg-white/5">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Drop files here
              <input type="file" accept="video/*,audio/*,image/*" multiple className="hidden" onChange={e => e.target.files && ingestFiles(e.target.files)} />
            </label>
            <div className="space-y-1">
              {media.map(m => (
                <button
                  key={m.id}
                  onClick={() => addClipFromMedia(m.id)}
                  className="group flex w-full items-center gap-2 rounded bg-white/5 p-1.5 text-left hover:bg-white/10"
                  title="Click to add to timeline"
                >
                  {m.thumb ? <img src={m.thumb} alt="" className="h-9 w-16 rounded object-cover" /> : (
                    <div className="flex h-9 w-16 items-center justify-center rounded bg-black/40">
                      {m.kind === 'video' ? <Film className="h-3.5 w-3.5 text-zinc-400" /> : m.kind === 'audio' ? <AudioLines className="h-3.5 w-3.5 text-zinc-400" /> : <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-zinc-200">{m.name}</div>
                    <div className="text-[10px] text-zinc-500">{m.kind} · {fmtT(m.duration)}{m.width ? ` · ${m.width}×${m.height}` : ''}</div>
                  </div>
                  {/* Discoverability: make "click adds to timeline" obvious. The
                      affordance fades in on hover (group-hover) so the row stays
                      clean at rest but clearly invites the action. */}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {m.kind === 'image' && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); addLogoOverlay(m.id); }}
                        title="Add as a floating logo/watermark overlay (free-move, resize, transparent)"
                        className="flex items-center gap-0.5 rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-200 opacity-0 transition-opacity hover:bg-fuchsia-500/30 group-hover:opacity-100"
                      >
                        <ImageIcon className="h-3 w-3" /> Logo
                      </span>
                    )}
                    <span className="flex items-center gap-0.5 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus className="h-3 w-3" /> Add
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </StudioPanel>
          {/* Add / Color-grade only make sense once there's footage. When the
              project is empty we quiet them (dim + non-interactive) so a
              first-timer's eye goes to the ONE thing that matters — importing —
              instead of a wall of 16 grade swatches competing for attention. */}
          <div className={cn('transition-opacity', doc.clips.length === 0 && 'pointer-events-none opacity-35')}>
            <StudioPanel title="Add">
              <div className="space-y-1.5">
                <StudioButton size="sm" variant="primary" onClick={() => void autoCut()} title="Drop footage + a song → a paced, beat-synced rough cut on the timeline, on your device"><Scissors className="h-3 w-3" /> Auto-Cut</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={addTextClip}><TypeIcon className="h-3 w-3" /> Text title</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => void autoCaption()} title="Transcribe speech on your device and add captions"><Sparkles className="h-3 w-3" /> Auto-caption</StudioButton>
                {captionClips.length > 0 && (
                  <StudioButton size="sm" variant="soft" onClick={() => setCaptionsPanel(true)} title="Review captions, fix any mistranscribed words, and restyle them"><TypeIcon className="h-3 w-3" /> Edit captions ({captionClips.length})</StudioButton>
                )}
                <StudioButton size="sm" variant="soft" onClick={() => void autoReframe()} title="Find your subject on-device and reframe the clip to keep them centered"><Sparkles className="h-3 w-3" /> Auto-reframe</StudioButton>
              </div>
            </StudioPanel>
            <StudioPanel title="Color grade">
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500">Apply to all video clips at once:</div>
                <div className="grid grid-cols-2 gap-1">
                  {COLOR_GRADES.map(g => (
                    <button key={g.id} onClick={() => applyGradeToAll(g.id)} title={g.description} className="flex min-h-[28px] items-center rounded bg-white/5 px-2 py-1 text-left text-[11px] leading-tight text-zinc-300 hover:bg-white/10">
                      {g.name}
                    </button>
                  ))}
                </div>
                {/* 3D LUT (.cube) — DaVinci/Premiere film looks */}
                <div className="mt-2 border-t border-white/5 pt-2">
                  <div className="mb-1 text-[10px] text-zinc-500">3D LUT (.cube){doc.selectedId ? ' — selected clip' : ' — all clips'}</div>
                  {(() => { const sel = doc.clips.find(c => c.id === doc.selectedId) as VideoClip | undefined; const lutName = sel?.lutName; return (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded bg-cyan-500/15 px-2 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25">
                          <Upload className="h-3 w-3" /> {lutName ? 'Replace LUT' : 'Load LUT'}
                          <input type="file" accept=".cube" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void loadLutFile(f); e.currentTarget.value = ''; }} />
                        </label>
                        {lutName && <button onClick={clearLut} className="rounded bg-white/5 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-white/10">Clear</button>}
                      </div>
                      {lutName && (
                        <>
                          <div className="truncate text-[10px] text-cyan-300">🎞 {lutName}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500">Intensity</span>
                            <input type="range" min={0} max={100} value={Math.round((sel?.lutIntensity ?? 1) * 100)} onChange={e => setLutIntensity(parseInt(e.target.value))} className="h-1 flex-1" />
                            <span className="w-7 text-right text-[10px] tabular-nums text-zinc-400">{Math.round((sel?.lutIntensity ?? 1) * 100)}%</span>
                          </div>
                        </>
                      )}
                    </div>
                  ); })()}
                </div>
              </div>
            </StudioPanel>
          </div>
        </StudioSidebar>

        <div className="flex flex-1 min-w-0 flex-col">
          <div ref={previewWrapRef} className="relative flex flex-1 min-h-0 items-center justify-center bg-[#0a0b0e] p-4 sm:p-6 overflow-hidden touch-none">
            {/* The preview fills the whole stage (height OR width bound,
                whichever hits first), keeping the document aspect ratio. No
                fixed vh cap — a real editor lets the monitor grow to the panel.
                The aspect box is sized by both max-h/max-w AND h/w-full so it
                expands to the available space instead of collapsing to content. */}
            <div className="relative flex h-full w-full items-center justify-center" style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`, transformOrigin: 'center center' }}>
              <canvas
                ref={previewRef}
                onPointerDown={onPreviewDown}
                onPointerMove={onPreviewMove}
                onPointerUp={onPreviewUp}
                onPointerCancel={onPreviewUp}
                onDoubleClick={onPreviewDoubleClick}
                className="block max-h-full max-w-full rounded border border-white/10 shadow-2xl"
                style={{ aspectRatio: `${doc.width}/${doc.height}`, height: '100%', width: '100%', objectFit: 'contain', cursor: 'default', touchAction: 'none' }}
              />
              {/* Direct-manipulation gizmo for the selected image/video overlay.
                  Same box + preserveAspectRatio as the canvas → its 0..1-in-frame
                  coords letterbox IDENTICALLY, so handles sit on the real pixels.
                  pointer-events:none so the canvas keeps receiving the drags. */}
              {overlayBox && (
                <svg
                  viewBox={`0 0 ${doc.width} ${doc.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ overflow: 'visible' }}
                >
                  {(() => {
                    const b = overlayBox; const W = doc.width, H = doc.height;
                    const a = (b.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
                    const L = (lx: number, ly: number) => ({ x: (b.cx + lx * ca - ly * sa) * W, y: (b.cy + lx * sa + ly * ca) * H });
                    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => L(sx * b.hw, sy * b.hh));
                    const top = L(0, -b.hh), rot = L(0, -b.hh - 0.06);
                    const hs = Math.max(6, W * 0.008);
                    return (<>
                      <polygon points={corners.map(c => `${c.x},${c.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth={Math.max(1.5, W * 0.002)} strokeDasharray={`${W * 0.01} ${W * 0.006}`} />
                      <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke="#22d3ee" strokeWidth={Math.max(1.5, W * 0.002)} />
                      <circle cx={rot.x} cy={rot.y} r={hs * 0.9} fill="#22d3ee" />
                      {corners.map((c, i) => <rect key={i} x={c.x - hs} y={c.y - hs} width={hs * 2} height={hs * 2} fill="#fff" stroke="#22d3ee" strokeWidth={Math.max(1.5, W * 0.002)} />)}
                    </>);
                  })()}
                </svg>
              )}
              <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur">
                {doc.width}×{doc.height} · {doc.fps}fps · {fmtT(doc.playhead)} / {fmtT(doc.duration)}
              </div>
            </div>
            {media.length === 0 && doc.clips.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b0e]/95 backdrop-blur-sm">
                <EmptyState
                  icon={<Film className="h-7 w-7" />}
                  title="Start your video project"
                  description="Pick a template, import your clips, or jump straight to a blank timeline."
                  actions={[
                    { label: 'Browse templates', description: '28 ready-made projects in 7 categories', icon: <LayoutTemplate className="h-4 w-4" />, onClick: () => setTemplatesDialog(true), primary: true },
                    { label: 'Import video / audio / images', description: 'Drop or pick files to add to the media pool', icon: <Upload className="h-4 w-4" />, onClick: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*,audio/*,image/*'; i.multiple = true; i.onchange = () => i.files && ingestFiles(i.files); i.click(); } },
                    { label: 'Open from Library', description: 'Continue a saved project', icon: <FileText className="h-4 w-4" />, onClick: openSaved },
                  ]}
                  hints={[
                    { label: 'Drag & drop or paste', description: 'Drop a folder of clips anywhere, or paste a screenshot with Ctrl+V' },
                    { label: 'Multi-track timeline', description: 'Trim, split (Ctrl+B), ripple delete, Q/W trim around the playhead' },
                    { label: 'Crash-proof autosave', description: 'Your edit is recovered automatically if the tab ever closes' },
                    { label: 'Press ?', description: 'See every keyboard shortcut' },
                  ]}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto border-y border-white/5 bg-[#0f1115] px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            <button onClick={() => seek(0)} className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"><SkipBack className="h-4 w-4" /></button>
            <button onClick={togglePlay} className="rounded bg-cyan-500 p-1.5 text-zinc-900 hover:bg-cyan-400">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={() => seek(doc.duration)} className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"><SkipForward className="h-4 w-4" /></button>
            <span className="ml-3 text-xs tabular-nums text-zinc-300">{fmtT(doc.playhead)} / {fmtT(doc.duration)}</span>
            <div className="mx-2 h-4 w-px bg-white/10" />
            <button onClick={() => doc.selectedId && splitAt(doc.selectedId, doc.playhead)} disabled={!doc.selectedId} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"><Scissors className="h-3 w-3" /> Split</button>
            <button onClick={() => doc.selectedId && duplicateClip(doc.selectedId)} disabled={!doc.selectedId} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"><Copy className="h-3 w-3" /> Duplicate</button>
            <button onClick={() => doc.selectedId && rippleDelete(doc.selectedId)} disabled={!doc.selectedId} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 className="h-3 w-3" /> Ripple</button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setSnap(s => !s)} className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs', snap ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-400 hover:bg-white/5')}><Magnet className="h-3 w-3" /> Snap</button>
              <button onClick={() => setRipple(r => !r)} title="Ripple trim — trimming a clip edge shifts later clips to close/open the gap" className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs', ripple ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-400 hover:bg-white/5')}><Scissors className="h-3 w-3" /> Ripple trim</button>
              <button onClick={() => setZoom(z => Math.max(20, z / 1.25))} className="rounded p-1 text-zinc-400 hover:bg-white/5"><ZoomOut className="h-3.5 w-3.5" /></button>
              <span className="text-[10px] tabular-nums text-zinc-500">{Math.round(zoom)}px/s</span>
              <button onClick={() => setZoom(z => Math.min(800, z * 1.25))} className="rounded p-1 text-zinc-400 hover:bg-white/5"><ZoomIn className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <Timeline
            doc={doc}
            zoom={zoom}
            tool={tool}
            snap={snap}
            mediaMap={mediaMap}
            onSeek={seek}
            onSelect={(id) => setDoc(d => ({ ...d, selectedId: id }))}
            onMoveClip={(id, start, trackId) => updateClip(id, c => { c.start = start; if (trackId) c.trackId = trackId; }, 'move')}
            onTrimClip={(id, edge, t) => trimClip(id, edge, t)}
            onSplit={(id) => splitAt(id, doc.playhead)}
            onTrackToggle={(id, key) => {
              const next = cloneDoc(doc);
              const t = trackOf(next, id);
              if (t) {
                if (key === 'muted') t.muted = !t.muted;
                if (key === 'locked') t.locked = !t.locked;
              }
              commit(key, next);
            }}
            onTextEdit={(id) => setTextDialogClip(id)}
            onAddTrack={(kind) => {
              const next = cloneDoc(doc);
              // Count existing tracks of this kind for the default label.
              const n = next.tracks.filter(t => t.kind === kind).length + 1;
              const height = kind === 'text' ? 32 : kind === 'audio' ? 40 : 48;
              const label = kind === 'video' ? `V${n}` : kind === 'audio' ? `A${n}` : `T${n}`;
              next.tracks.push({ id: tid(), kind, label, muted: false, locked: false, height });
              commit('add track', next);
            }}
            onRemoveTrack={(id) => {
              const next = cloneDoc(doc);
              const tr = next.tracks.find(t => t.id === id);
              if (!tr) return;
              // Don't allow removing the LAST track of each kind — there must
              // always be at least one V/A/T track for the editor to be usable.
              const sameKind = next.tracks.filter(t => t.kind === tr.kind);
              if (sameKind.length <= 1) { pushToast('Need at least one ' + tr.kind + ' track'); return; }
              next.tracks = next.tracks.filter(t => t.id !== id);
              // Remove any clips that were on this track.
              next.clips = next.clips.filter(c => c.trackId !== id);
              if (next.selectedId && !next.clips.find(c => c.id === next.selectedId)) next.selectedId = null;
              commit('remove track', next);
            }}
          />
        </div>

        <StudioSidebar width={280} label="Inspector" autoOpen={false}>
          {selectedClip ? <ClipInspector clip={selectedClip} media={selectedClip.kind !== 'text' ? mediaMap.get(selectedClip.mediaId) ?? null : null} onChange={(mut) => updateClip(selectedClip.id, mut, 'props')} onOpenText={() => selectedClip.kind === 'text' && setTextDialogClip(selectedClip.id)} onApplyGrade={(g) => applyGradeToClip(selectedClip.id, g)} onAllTransitions={applyTransitionsToAllCuts} playhead={doc.playhead} /> : (
            <StudioPanel title="Inspector">
              <div className="text-xs text-zinc-500">Select a clip on the timeline to edit its properties.</div>
            </StudioPanel>
          )}
          <StudioPanel title="Master">
            <StudioSlider label="Volume" value={Math.round(doc.master.volume * 100)} min={0} max={200} onChange={v => commit('master vol', { ...cloneDoc(doc), master: { ...doc.master, volume: v / 100 } })} suffix="%" />
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={doc.master.audioFade} onChange={e => commit('audio fade', { ...cloneDoc(doc), master: { ...doc.master, audioFade: e.target.checked } })} /> Audio fade in/out
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300" title="Automatically lower music (A2+) under voice/narration on the first audio track (A1)">
              <input type="checkbox" checked={!!doc.master.duck} onChange={e => commit('duck', { ...cloneDoc(doc), master: { ...doc.master, duck: e.target.checked } })} /> Duck music under voice
            </label>
          </StudioPanel>
        </StudioSidebar>
      </StudioBody>

      {/* FOCUSED ELEMENT inspector — opened by double-tapping an element on the
          preview. Full sheet on mobile, right-docked panel on desktop, with a
          "‹ Back" that returns to the timeline (selection preserved). This is the
          "double-click element → its settings; Back → timeline" product flow. */}
      {focusedId && (() => {
        const fc = doc.clips.find(c => c.id === focusedId);
        if (!fc) { return null; }
        const title = fc.kind === 'text' ? 'Text element'
          : (fc as VideoClip).transform && ((fc as VideoClip).transform!.scale !== 1 || (fc as VideoClip).transform!.x !== 0 || (fc as VideoClip).transform!.y !== 0) ? 'Logo / overlay'
          : fc.kind === 'audio' ? 'Audio clip' : 'Video clip';
        const subtitle = fc.kind === 'text' ? (fc as TextClip).text.slice(0, 40)
          : (mediaMap.get((fc as VideoClip | AudioClip).mediaId)?.name ?? '');
        return (
          <div className="absolute inset-0 z-40 flex flex-col bg-[#0a0b0e]/98 backdrop-blur-sm sm:left-auto sm:right-0 sm:w-[340px] sm:border-l sm:border-white/10 sm:shadow-2xl">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0f1115] px-3 py-2.5">
              <button onClick={() => setFocusedId(null)} className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm font-medium text-cyan-300 hover:bg-white/10" title="Back to timeline">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
                {subtitle && <div className="truncate text-[11px] text-zinc-500">{subtitle}</div>}
              </div>
              {fc.kind === 'text' && (
                <button onClick={() => setTextDialogClip(fc.id)} className="rounded-lg bg-cyan-500/15 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25">Edit text…</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              <ClipInspector
                clip={fc}
                media={fc.kind !== 'text' ? mediaMap.get((fc as VideoClip | AudioClip).mediaId) ?? null : null}
                onChange={(mut) => updateClip(fc.id, mut, 'props')}
                onOpenText={() => fc.kind === 'text' && setTextDialogClip(fc.id)}
                onApplyGrade={(g) => applyGradeToClip(fc.id, g)}
                onAllTransitions={applyTransitionsToAllCuts}
                playhead={doc.playhead}
              />
            </div>
          </div>
        );
      })()}

      {/* CAPTIONS editor — inline transcription correction + bulk restyle. Opens
          after auto-caption. Fix a mistranscription by typing in its field; click
          a row to jump the playhead there; restyle all captions with one tap. */}
      {captionsPanel && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#0a0b0e]/98 backdrop-blur-sm sm:left-auto sm:right-0 sm:w-[380px] sm:border-l sm:border-white/10 sm:shadow-2xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0f1115] px-3 py-2.5">
            <button onClick={() => setCaptionsPanel(false)} className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm font-medium text-cyan-300 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /> Back</button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-zinc-100">Captions</div>
              <div className="truncate text-[11px] text-zinc-500">{captionClips.length} lines · tap a word to fix it</div>
            </div>
          </div>
          <div className="shrink-0 border-b border-white/10 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Style all captions</span>
              {/* C4 preset system: save the current caption look + apply saved ones. */}
              <PresetBar<CaptionStyleValue>
                kind="video.captionStyle"
                label="My styles"
                capture={captureCaptionStyle}
                onApply={applyCaptionStyleValue}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CAPTION_STYLES.map(s => (
                <button key={s.id} onClick={() => applyCaptionStyle(s.id)} className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-zinc-200 hover:bg-cyan-500/20 hover:text-cyan-100">{s.name}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {captionClips.length === 0 && <div className="px-1 py-3 text-xs text-zinc-500">No captions yet. Use “Auto-subtitle” to generate them on your device.</div>}
            {captionClips.map(c => (
              <div key={c.id} className={cn('mb-1.5 rounded-lg border p-1.5', doc.selectedId === c.id ? 'border-cyan-400/50 bg-cyan-500/5' : 'border-white/5 bg-white/[0.02]')}>
                <button
                  onClick={() => { seek(c.start + 0.01); setDoc(d => ({ ...d, selectedId: c.id })); }}
                  className="mb-1 flex items-center gap-2 text-[10px] tabular-nums text-zinc-500 hover:text-cyan-300"
                  title="Jump to this caption"
                >
                  <Play className="h-2.5 w-2.5" /> {fmtT(c.start)} → {fmtT(clipEnd(c))}
                </button>
                <textarea
                  value={c.text}
                  onChange={e => updateClip(c.id, (cl) => { (cl as TextClip).text = e.target.value; }, 'edit caption')}
                  onFocus={() => { seek(c.start + 0.01); setDoc(d => ({ ...d, selectedId: c.id })); }}
                  rows={Math.min(3, Math.max(1, Math.ceil(c.text.length / 32)))}
                  className="w-full resize-none rounded bg-black/30 px-2 py-1 text-[13px] text-zinc-100 outline-none focus:ring-1 focus:ring-cyan-500/60"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/5 bg-[#0f1115] px-3 text-[11px] text-zinc-400">
        <span>{doc.width}×{doc.height} · {doc.fps}fps</span>
        <span>{doc.clips.length} clips on {doc.tracks.length} tracks</span>
        {selectedClip ? <span className="text-cyan-300 truncate">{selectedClip.kind === 'text' ? `Text · ${(selectedClip as TextClip).text.slice(0, 32)}` : selectedClip.kind === 'audio' ? `Audio · ${mediaMap.get((selectedClip as AudioClip).mediaId)?.name ?? ''}` : `Video · ${mediaMap.get((selectedClip as VideoClip).mediaId)?.name ?? ''}`}</span> : null}
        <span className="ml-auto">{fmtT(doc.duration)} total</span>
      </div>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
          {progress > 0 && <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>}
        </div>
      )}
      {toast && (
        <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>
      )}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-cyan-500/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-cyan-400/70 bg-[#0a0b0e]/80 px-12 py-10 shadow-2xl">
            <Upload className="h-10 w-10 text-cyan-300" />
            <div className="text-lg font-semibold text-zinc-100">Drop your media to import</div>
            <div className="text-xs text-zinc-400">Video, audio, or images · processed on your device — nothing uploads</div>
          </div>
        </div>
      )}
      {gate}

      {newDialog && (
        <NewDialog onCancel={() => setNewDialog(false)} onCreate={(preset, name) => {
          setRecovery(null); // fresh project supersedes the recover-last-session offer
          const next = NEW_DOC(preset);
          next.name = name;
          commit('new', next);
          setNewDialog(false);
        }} />
      )}
      {exportDialog && (
        <ExportDialog presetId={exportPreset} setPresetId={setExportPreset} onCancel={() => setExportDialog(false)} onExport={exportNow} />
      )}
      {openDialog && (
        <OpenDialog items={savedList} onCancel={() => setOpenDialog(false)} onPick={loadFromLibrary} />
      )}
      {templatesDialog && (
        <TemplatesGallery
          activeCategory={templateCategory}
          onCategory={setTemplateCategory}
          onPick={applyTemplate}
          onClose={() => setTemplatesDialog(false)}
        />
      )}
      {textDialogClip && (() => {
        const c = doc.clips.find(x => x.id === textDialogClip) as TextClip | undefined;
        if (!c) return null;
        return <TextDialog clip={c} fonts={FONTS} onCancel={() => setTextDialogClip(null)} onSave={(mut) => { updateClip(c.id, mut, 'text edit'); setTextDialogClip(null); }} />;
      })()}
    </StudioShell>
  );
}

// Shared text renderer — used by the live preview AND mirrored exactly by the
// export compositor (see engines/video/compositor.ts drawCompText) so captions
// look identical on screen and in the file. Handles the preset animation library
// (sampleTextAnim), manual per-text keyframes (grow/move by hand), character
// reveal (typewriter / word-by-word), blur-in, and the block transform.
function drawTextClip(ctx: CanvasRenderingContext2D, tx: TextClip, cw: number, ch: number, t: number) {
  const localT = (t - tx.start) / Math.max(tx.duration, 0.01);
  const u = cw / 1920;
  const anim = sampleTextAnim(tx.anim, localT, cw);
  // Manual keyframes layer on top of (multiply/add) the preset.
  const kfScale = tx.kf?.scale ? sampleAnimated(tx.kf.scale, localT) : 1;
  const kfAlpha = tx.kf?.opacity ? sampleAnimated(tx.kf.opacity, localT) / 100 : 1;
  const kfRot = tx.kf?.rotation ? (sampleAnimated(tx.kf.rotation, localT) * Math.PI) / 180 : 0;
  const kfDX = tx.kf?.posX ? sampleAnimated(tx.kf.posX, localT) * cw : 0;
  const kfDY = tx.kf?.posY ? sampleAnimated(tx.kf.posY, localT) * ch : 0;
  const alpha = Math.max(0, anim.alpha * kfAlpha);
  if (alpha <= 0) return;
  const scale = anim.scale * kfScale;
  const rotate = anim.rotate + kfRot;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (anim.blur > 0) ctx.filter = `blur(${anim.blur}px)`;
  ctx.font = `${tx.italic ? 'italic ' : ''}${tx.weight} ${tx.size * u}px ${tx.font}`;
  const freePos = tx.nx != null && tx.ny != null;
  ctx.textAlign = freePos ? 'center' : tx.align;
  ctx.textBaseline = 'middle';
  // Character reveal (typewriter/word-by-word) clips the visible text.
  const fullLines = tx.text.split('\n');
  let lines = fullLines;
  if (anim.reveal < 1) {
    if (tx.anim === 'word-by-word') {
      const words = tx.text.split(/(\s+)/);
      const nShow = Math.ceil(words.filter(w => w.trim()).length * anim.reveal);
      let shown = 0; const out: string[] = [];
      for (const w of words) { if (w.trim()) { if (shown >= nShow) break; shown++; } out.push(w); }
      lines = out.join('').split('\n');
    } else {
      const nChars = Math.ceil(tx.text.length * anim.reveal);
      lines = tx.text.slice(0, nChars).split('\n');
    }
  }
  const lh = tx.size * 1.25 * u;
  const totalH = fullLines.length * lh;
  let yBase = freePos
    ? tx.ny! * ch - totalH / 2 + lh / 2
    : tx.pos === 'top' ? ch * 0.12 + lh / 2
    : tx.pos === 'center' ? ch / 2 - totalH / 2 + lh / 2
    : ch - ch * 0.12 - totalH + lh / 2;
  const xBase = freePos ? tx.nx! * cw
    : tx.align === 'center' ? cw / 2 : tx.align === 'right' ? cw - 60 : 60;
  // Apply preset/keyframe transform around the text block center.
  const blockCX = xBase + anim.dx + kfDX;
  const blockCY = yBase + totalH / 2 - lh / 2 + anim.dy + kfDY;
  if (scale !== 1 || rotate !== 0) {
    ctx.translate(blockCX, blockCY);
    ctx.rotate(rotate);
    ctx.scale(scale, scale);
    ctx.translate(-blockCX, -blockCY);
  }
  const drawX = xBase + anim.dx + kfDX;
  const drawY0 = yBase + anim.dy + kfDY;
  for (let i = 0; i < lines.length; i++) {
    const yy = drawY0 + i * lh;
    if (tx.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, tx.outlineWidth * u);
      ctx.strokeStyle = tx.outlineColor;
      ctx.strokeText(lines[i], drawX, yy);
    }
    ctx.fillStyle = tx.color;
    ctx.fillText(lines[i], drawX, yy);
  }
  ctx.filter = 'none';
  ctx.restore();
}

function drawVideoFrame(ctx: CanvasRenderingContext2D, src: HTMLVideoElement | HTMLImageElement | ImageBitmap, dw: number, dh: number, v: VideoClip, localT = 0, alphaMul = 1) {
  const sw = src instanceof HTMLVideoElement ? src.videoWidth : (src as any).naturalWidth ?? (src as ImageBitmap).width;
  const sh = src instanceof HTMLVideoElement ? src.videoHeight : (src as any).naturalHeight ?? (src as ImageBitmap).height;
  if (!sw || !sh) return;
  const sr = sw / sh, dr = dw / dh;
  let tw = dw, th = dh, tx = 0, ty = 0;
  if (v.fit === 'contain') {
    if (sr > dr) { th = dw / sr; ty = (dh - th) / 2; }
    else { tw = dh * sr; tx = (dw - tw) / 2; }
  } else {
    if (sr > dr) { tw = dh * sr; tx = (dw - tw) / 2; }
    else { th = dw / sr; ty = (dh - th) / 2; }
  }
  const brightness = sampleClipParam(v, 'brightness', v.brightness, localT);
  const contrast = sampleClipParam(v, 'contrast', v.contrast, localT);
  const saturation = sampleClipParam(v, 'saturation', v.saturation, localT);
  const hue = sampleClipParam(v, 'hue', v.hue, localT);
  const opacity = sampleClipParam(v, 'opacity', v.opacity, localT);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (opacity / 100) * alphaMul));
  // PiP transform around the frame center — mirrors the export compositor's
  // drawClipFrame so preview == output. Each axis can be KEYFRAMED (posX/posY/
  // scale/rotation) for motion (pan, zoom, grow, spin); when a keyframe track
  // exists it overrides the static transform value, else we fall back to the
  // static v.transform so existing projects render unchanged.
  const baseTf = v.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
  const tfX = sampleClipParam(v, 'posX', baseTf.x, localT);
  const tfY = sampleClipParam(v, 'posY', baseTf.y, localT);
  const tfScale = sampleClipParam(v, 'scale', baseTf.scale, localT);
  const tfRot = sampleClipParam(v, 'rotation', baseTf.rotation, localT);
  if (tfScale !== 1 || tfX !== 0 || tfY !== 0 || tfRot !== 0 || v.flipH || v.flipV) {
    const cx = dw / 2 + tfX * dw;
    const cy = dh / 2 + tfY * dh;
    ctx.translate(cx, cy);
    ctx.rotate((tfRot * Math.PI) / 180);
    ctx.scale(tfScale * (v.flipH ? -1 : 1), tfScale * (v.flipV ? -1 : 1));
    ctx.translate(-dw / 2, -dh / 2);
  }
  // Effect CSS-filter fragment composes with the grade filter (blur/glow/b&w/…).
  const fxFrag = effectFilterFragment(v.effects, dw);
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)${fxFrag ? ' ' + fxFrag : ''}`;
  // Source-space crop (normalized) → drawImage source rect. Default = full frame.
  const cr = v.crop;
  const drawSrc = (img: any) => {
    if (cr && (cr.x !== 0 || cr.y !== 0 || cr.w !== 1 || cr.h !== 1)) {
      ctx.drawImage(img, cr.x * sw, cr.y * sh, cr.w * sw, cr.h * sh, tx, ty, tw, th);
    } else {
      ctx.drawImage(img, tx, ty, tw, th);
    }
  };
  if (v.chromaKey) {
    const keyed = chromaKeySource(src as any, v.chromaKey);
    drawSrc((keyed ?? (src as any)) as any);
  } else {
    drawSrc(src as any);
  }
  ctx.filter = 'none';
  const hasWheels = v.colorWheels && !isZeroWheels(v.colorWheels);
  const hasCurves = v.curves && (v.curves.master || v.curves.r || v.curves.g || v.curves.b);
  const hasLut = !!v.lut && (v.lutIntensity ?? 1) > 0;
  const hasPixFx = hasPixelEffects(v.effects);
  if (hasWheels || hasCurves || hasLut || hasPixFx) {
    try {
      // Clamp the read rect into the canvas. A negative-origin getImageData
      // (cover clips that overflow the frame) returns transparent-black pad
      // pixels that the grade would then write back, darkening the edge. The
      // export compositor clamps the same way — keep them pixel-identical.
      const dx = Math.max(0, Math.floor(tx));
      const dy = Math.max(0, Math.floor(ty));
      const dwInt = Math.min(dw - dx, Math.ceil(tw));
      const dhInt = Math.min(dh - dy, Math.ceil(th));
      if (dwInt > 0 && dhInt > 0) {
        const imgData = ctx.getImageData(dx, dy, dwInt, dhInt);
        if (hasWheels) applyColorWheelsToImageData(imgData.data, v.colorWheels!);
        if (hasCurves) applyCurveSet(imgData.data, v.curves!);
        if (hasLut) applyLut(imgData.data, v.lut!, v.lutIntensity ?? 1);
        // Pixel effects (vignette/grain/pixelate/sharpen/…). Seed grain on the
        // integer source time so it's stable per frame AND identical to export.
        if (hasPixFx) applyPixelEffects(imgData, v.effects, Math.round(localT * 1000));
        ctx.putImageData(imgData, dx, dy);
      }
    } catch {}
  }
  ctx.restore();
}

function Timeline({ doc, zoom, tool, snap, mediaMap, onSeek, onSelect, onMoveClip, onTrimClip, onSplit, onTrackToggle, onTextEdit, onAddTrack, onRemoveTrack }: {
  doc: DocState; zoom: number; tool: Tool; snap: boolean;
  mediaMap: Map<string, MediaItem>;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onMoveClip: (id: string, start: number, trackId?: string) => void;
  onTrimClip: (id: string, edge: 'l' | 'r', t: number) => void;
  onSplit: (id: string) => void;
  onTrackToggle: (id: string, key: 'muted' | 'locked') => void;
  onTextEdit: (id: string) => void;
  onAddTrack: (kind: TrackKind) => void;
  onRemoveTrack: (id: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<null | { type: 'move' | 'trim-l' | 'trim-r' | 'scrub'; id?: string; startMouse: number; startVal: number; trackStartY?: number }>(null);

  const totalSeconds = Math.max(20, Math.ceil(doc.duration + 5));
  const tlWidth = totalSeconds * zoom;
  const trackHeights = doc.tracks.map(t => t.height);
  const tlHeight = trackHeights.reduce((a, b) => a + b, 0);

  const xToT = (x: number) => x / zoom;
  const tToX = (t: number) => t * zoom;

  const onScrub: React.MouseEventHandler = (e) => {
    // Measure against the (non-scrolling) viewport container + its scrollLeft,
    // not e.currentTarget: the ruler/track rows live INSIDE the scroller, so
    // their own rect.left already bakes in scroll — adding scrollLeft on top of
    // that double-counts and the seek lands off-target once you scroll right.
    const host = ref.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const t = xToT(e.clientX - r.left + host.scrollLeft);
    onSeek(Math.max(0, t));
  };

  // Live drag feedback: the matched snap point (for the visible guide line) and a
  // floating tooltip showing the clip's new position/duration as it's dragged —
  // CapCut's signature "you can see exactly where it lands" feel. Held in state so
  // the guide + tooltip re-render on every move; the actual edit stays in `doc`.
  const [snapLine, setSnapLine] = React.useState<number | null>(null);
  const [dragTip, setDragTip] = React.useState<{ x: number; y: number; text: string } | null>(null);

  // Snap and report which guide point was hit (null = free placement) so the
  // caller can draw the alignment guide exactly where the edge locked.
  const snappedT = (t: number, excludeId?: string): { t: number; hit: number | null } => {
    if (!snap) return { t, hit: null };
    const snaps: number[] = [0, doc.playhead];
    for (const c of doc.clips) {
      if (excludeId && c.id === excludeId) continue;
      snaps.push(c.start, clipEnd(c));
    }
    let best = t, bestD = 0.25, hit: number | null = null;
    for (const s of snaps) {
      const d = Math.abs(s - t);
      if (d < bestD) { bestD = d; best = s; hit = s; }
    }
    return { t: best, hit };
  };

  const onPointerDownClip = (e: React.PointerEvent, c: TimelineClip, mode: 'move' | 'trim-l' | 'trim-r') => {
    e.stopPropagation();
    onSelect(c.id);
    if (tool === 'razor' && mode === 'move') {
      onSplit(c.id);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { type: mode, id: c.id, startMouse: e.clientX, startVal: mode === 'trim-r' ? c.start + clipDuration(c) : c.start };
  };

  // Place the tooltip near the cursor, in the scroll container's coordinate space.
  const tipAt = (e: React.PointerEvent, text: string) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setDragTip({ x: e.clientX - r.left + (ref.current?.scrollLeft ?? 0), y: e.clientY - r.top + (ref.current?.scrollTop ?? 0), text });
  };

  const onPointerMoveBg = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startMouse) / zoom;
    if (d.type === 'move' && d.id) {
      const s = snappedT(d.startVal + dx, d.id);
      const newStart = Math.max(0, s.t);
      // Cross-track move: figure out which track row the cursor is over and, if
      // it's a COMPATIBLE kind (video↔video, audio↔audio, text↔text), retarget
      // the clip there. Lets you drag a V2 clip down onto V1 (was impossible —
      // the move only changed start time, so dragging across tracks did nothing
      // and the OS treated the gesture as a file drag → import overlay).
      const c = doc.clips.find(x => x.id === d.id);
      let targetTrackId: string | undefined;
      const cont = ref.current;
      if (c && cont) {
        const r = cont.getBoundingClientRect();
        // 24px = sticky ruler height (h-6) above the track rows.
        const yIn = e.clientY - r.top + cont.scrollTop - 24;
        const row = trackY.find(t => yIn >= t.y && yIn < t.y + t.h);
        if (row && row.id !== c.trackId) {
          const fromKind = trackOf(doc, c.trackId)?.kind;
          const toKind = trackOf(doc, row.id)?.kind;
          if (fromKind && fromKind === toKind) targetTrackId = row.id;
        }
      }
      onMoveClip(d.id, newStart, targetTrackId);
      setSnapLine(s.hit);
      tipAt(e, c ? `${fmtT(newStart)} → ${fmtT(newStart + clipDuration(c))}` : fmtT(newStart));
    } else if (d.type === 'trim-l' && d.id) {
      const s = snappedT(d.startVal + dx, d.id);
      const t = Math.max(0, s.t);
      onTrimClip(d.id, 'l', t);
      setSnapLine(s.hit);
      const c = doc.clips.find(x => x.id === d.id);
      tipAt(e, c ? `−${fmtT(Math.max(0, c.start - t) || 0)} · ${fmtT(Math.max(0, clipEnd(c) - t))}` : fmtT(t));
    } else if (d.type === 'trim-r' && d.id) {
      const s = snappedT(d.startVal + dx, d.id);
      onTrimClip(d.id, 'r', s.t);
      setSnapLine(s.hit);
      const c = doc.clips.find(x => x.id === d.id);
      tipAt(e, c ? `${fmtT(Math.max(0, s.t - c.start))} long` : fmtT(s.t));
    } else if (d.type === 'scrub') {
      const r = (ref.current as HTMLElement).getBoundingClientRect();
      onSeek(Math.max(0, xToT(e.clientX - r.left + ref.current!.scrollLeft)));
    }
  };

  const onPointerUp = () => { drag.current = null; setSnapLine(null); setDragTip(null); };

  let yAccum = 0;
  const trackY: { id: string; y: number; h: number }[] = doc.tracks.map(t => {
    const r = { id: t.id, y: yAccum, h: t.height };
    yAccum += t.height;
    return r;
  });

  const ticks: { x: number; t: number; major: boolean }[] = [];
  const tickStep = zoom > 200 ? 0.5 : zoom > 60 ? 1 : zoom > 20 ? 5 : 10;
  for (let t = 0; t <= totalSeconds; t += tickStep) {
    ticks.push({ x: tToX(t), t, major: Math.round(t) % (tickStep * 5) === 0 });
  }

  return (
    // The timeline is a strip at the bottom — the PREVIEW monitor is the star
    // and must own the upper screen like a real editor. So the timeline takes a
    // clamped share of the height (never less than enough to show its tracks,
    // never so tall it crowds the monitor) instead of a fixed 288px that ate
    // ~40% of a laptop screen.
    <div className="flex h-[26vh] max-h-[300px] min-h-[172px] shrink-0 border-t border-white/5 bg-[#0a0b0e]">
      <div className="w-32 shrink-0 border-r border-white/5 bg-[#0f1115]">
        <div className="flex h-6 items-center gap-1 border-b border-white/5 px-1.5">
          <button
            type="button"
            onClick={() => onAddTrack('video')}
            title="Add video track"
            className="flex items-center gap-0.5 rounded px-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:bg-white/5 hover:text-white"
          ><Plus className="h-2.5 w-2.5" />V</button>
          <button
            type="button"
            onClick={() => onAddTrack('audio')}
            title="Add audio track"
            className="flex items-center gap-0.5 rounded px-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:bg-white/5 hover:text-white"
          ><Plus className="h-2.5 w-2.5" />A</button>
          <button
            type="button"
            onClick={() => onAddTrack('text')}
            title="Add text track"
            className="flex items-center gap-0.5 rounded px-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:bg-white/5 hover:text-white"
          ><Plus className="h-2.5 w-2.5" />T</button>
        </div>
        {doc.tracks.map(t => (
          <div key={t.id} style={{ height: t.height }} className="group flex items-center gap-1 border-b border-white/5 px-2">
            <button onClick={() => onTrackToggle(t.id, 'muted')} title="Mute" className={cn('rounded p-1 text-xs', t.muted ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-500 hover:bg-white/5')}>
              {t.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </button>
            <button onClick={() => onTrackToggle(t.id, 'locked')} title="Lock" className={cn('rounded p-1 text-xs', t.locked ? 'bg-yellow-500/20 text-yellow-300' : 'text-zinc-500 hover:bg-white/5')}>
              {t.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>
            <span className="flex-1 truncate text-[11px] font-medium text-zinc-300">{t.label}</span>
            <button
              onClick={() => onRemoveTrack(t.id)}
              title="Remove track"
              className="hidden rounded p-0.5 text-zinc-600 hover:bg-rose-500/20 hover:text-rose-300 group-hover:block"
            ><X className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      <div
        ref={ref}
        className="relative flex-1 overflow-auto"
        onPointerMove={onPointerMoveBg}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="relative" style={{ width: tlWidth, height: tlHeight + 24 }}>
          <div className="sticky top-0 z-10 flex h-6 border-b border-white/10 bg-[#0f1115]" onMouseDown={onScrub} onClick={onScrub}>
            {ticks.map(tk => (
              <div key={tk.x} className="absolute top-0 h-full" style={{ left: tk.x }}>
                <div className={cn('w-px', tk.major ? 'h-full bg-white/20' : 'h-1/2 bg-white/10')} />
                {tk.major && <div className="absolute left-1 top-0 text-[9px] tabular-nums text-zinc-500">{fmtT(tk.t)}</div>}
              </div>
            ))}
          </div>
          <div className="relative" style={{ marginTop: 0 }}>
            {trackY.map(({ id, y, h }) => (
              <div
                key={id}
                style={{ position: 'absolute', left: 0, top: y, width: tlWidth, height: h }}
                className="border-b border-white/5 bg-[#0c0d10]"
                // Click empty timeline space → deselect AND move the playhead
                // there (CapCut parity: the whole timeline background scrubs, not
                // just the thin ruler strip).
                onMouseDown={(e) => { onSelect(null); onScrub(e); }}
              />
            ))}

            {/* Template slot guides — dashed "drop your clip here" placeholders
                that make an applied template's structure visible. Each is
                consumed (removed) once media is dropped onto it. */}
            {(doc.slots ?? []).map(s => {
              const tr = trackY.find(t => t.id === s.trackId);
              if (!tr) return null;
              const x = tToX(s.start);
              const w = Math.max(8, tToX(s.duration));
              return (
                <div
                  key={`slot-${s.id}`}
                  style={{ position: 'absolute', left: x, top: tr.y, width: w, height: tr.h - 4 }}
                  className="flex flex-col justify-center rounded border border-dashed border-cyan-400/50 bg-cyan-400/5 px-2 pointer-events-none overflow-hidden"
                  title={s.hint}
                >
                  <span className="truncate text-[10px] font-medium text-cyan-200/90">{s.label}</span>
                  {s.hint && <span className="truncate text-[9px] text-cyan-200/50">{s.hint}</span>}
                </div>
              );
            })}

            {doc.clips.map(c => {
              const tr = trackY.find(t => t.id === c.trackId);
              if (!tr) return null;
              const x = tToX(c.start);
              const w = Math.max(8, tToX(clipDuration(c)));
              const isSel = doc.selectedId === c.id;
              const cls = c.kind === 'video' ? 'from-blue-500/40 to-blue-600/30 border-blue-400/40'
                : c.kind === 'audio' ? 'from-emerald-500/40 to-emerald-600/30 border-emerald-400/40'
                : 'from-amber-500/40 to-amber-600/30 border-amber-400/40';
              const item = c.kind !== 'text' ? mediaMap.get((c as VideoClip | AudioClip).mediaId) : null;
              return (
                <div
                  key={c.id}
                  style={{ position: 'absolute', left: x, top: tr.y, width: w, height: tr.h - 4 }}
                  className={cn(
                    'group flex items-center rounded border bg-gradient-to-br overflow-hidden cursor-grab',
                    cls,
                    isSel && 'ring-2 ring-cyan-400 shadow-lg',
                  )}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerDown={(e) => onPointerDownClip(e, c, 'move')}
                  onDoubleClick={() => c.kind === 'text' && onTextEdit(c.id)}
                >
                  <div
                    onPointerDown={(e) => onPointerDownClip(e, c, 'trim-l')}
                    className="h-full w-1.5 cursor-ew-resize bg-white/30 hover:bg-cyan-400"
                  />
                  <div className="relative flex-1 overflow-hidden px-1.5 text-[10px] font-medium text-white truncate">
                    {item?.thumb && c.kind === 'video' && (
                      <img src={item.thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
                    )}
                    {/* Waveform: peaks for the trimmed source span, drawn as a
                        mirrored amplitude band so audio clips read like audio. */}
                    {c.kind === 'audio' && item?.peaks && item.peaks.length > 1 && (() => {
                      const ac = c as AudioClip;
                      const total = Math.max(0.001, item.duration);
                      const p0 = Math.max(0, Math.min(1, ac.srcStart / total));
                      const p1 = Math.max(p0, Math.min(1, ac.srcEnd / total));
                      const n = item.peaks.length;
                      const a = Math.floor(p0 * n), b = Math.max(a + 1, Math.floor(p1 * n));
                      const span = item.peaks.slice(a, b);
                      const N = Math.min(span.length, Math.max(8, Math.floor(w)));
                      const step = span.length / N;
                      const pts: string[] = [];
                      for (let i = 0; i < N; i++) {
                        const v = span[Math.floor(i * step)] ?? 0;
                        const x = (i / (N - 1)) * 100;
                        pts.push(`${x.toFixed(2)},${(50 - v * 46).toFixed(2)}`);
                      }
                      for (let i = N - 1; i >= 0; i--) {
                        const v = span[Math.floor(i * step)] ?? 0;
                        const x = (i / (N - 1)) * 100;
                        pts.push(`${x.toFixed(2)},${(50 + v * 46).toFixed(2)}`);
                      }
                      return (
                        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polygon points={pts.join(' ')} fill="rgba(255,255,255,.45)" />
                        </svg>
                      );
                    })()}
                    <span className="relative">
                      {c.kind === 'text' ? (c as TextClip).text.slice(0, 40) : item?.name ?? c.kind}
                    </span>
                  </div>
                  <div
                    onPointerDown={(e) => onPointerDownClip(e, c, 'trim-r')}
                    className="h-full w-1.5 cursor-ew-resize bg-white/30 hover:bg-cyan-400"
                  />
                  {/* Keyframe diamonds — make animation VISIBLE on the timeline
                      (the audit's #1 video gap: keyframes existed in the model +
                      inspector but never showed on the clip). One diamond per
                      keyframe time across all animated params, along the bottom
                      edge of the clip. Amber so they read against the clip fill. */}
                  {c.kind === 'video' && (c as VideoClip).keyframes && (() => {
                    const kfs = (c as VideoClip).keyframes!;
                    const times = new Set<number>();
                    for (const k of Object.keys(kfs) as (keyof VideoClipKeyframes)[]) {
                      const ap = kfs[k]; if (ap) for (const p of ap.keyframes) times.add(Math.round(p.t * 1000) / 1000);
                    }
                    if (!times.size) return null;
                    const dur = Math.max(0.001, clipDuration(c));
                    return (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2.5">
                        {[...times].map((t, i) => (
                          <div key={i} title={`Keyframe @ ${t.toFixed(2)}s`}
                            style={{ position: 'absolute', left: `${Math.max(0, Math.min(1, t / dur)) * 100}%`, bottom: 1 }}
                            className="h-2 w-2 -translate-x-1/2 rotate-45 border border-amber-200 bg-amber-400 shadow" />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            <div
              style={{ position: 'absolute', left: tToX(doc.playhead), top: 0, height: tlHeight, width: 2 }}
              className="pointer-events-none bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.6)]"
            >
              <div className="absolute -left-1.5 -top-1 h-3 w-4 rounded-sm bg-cyan-400" />
            </div>

            {/* Snap alignment guide — a bright dashed line at the snap target so
                the user SEES the edge lock to a neighbor/playhead/start. */}
            {snapLine !== null && (
              <div
                style={{ position: 'absolute', left: tToX(snapLine), top: 0, height: tlHeight, width: 1 }}
                className="pointer-events-none border-l border-dashed border-fuchsia-400/90 shadow-[0_0_6px_rgba(232,121,249,.7)]"
              />
            )}

            {/* Live drag tooltip — new position / duration as the clip moves. */}
            {dragTip && (
              <div
                style={{ position: 'absolute', left: dragTip.x + 10, top: Math.max(0, dragTip.y - 26) }}
                className="pointer-events-none z-20 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-cyan-200 shadow-lg"
              >
                {dragTip.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClipInspector({ clip, media, onChange, onOpenText, onApplyGrade, onAllTransitions, playhead }: { clip: TimelineClip; media: MediaItem | null; onChange: (mut: (c: TimelineClip) => void) => void; onOpenText: () => void; onApplyGrade?: (gradeId: string) => void; onAllTransitions?: (id: TransitionId) => void; playhead?: number }) {
  if (clip.kind === 'video') {
    const c = clip;
    const matchedGrade = COLOR_GRADES.find(g => Math.abs(g.brightness - c.brightness) < 2 && Math.abs(g.contrast - c.contrast) < 2 && Math.abs(g.saturation - c.saturation) < 2 && Math.abs(g.hue - c.hue) < 3);
    const localT = Math.max(0, (playhead ?? 0) - c.start);
    return (
      <>
        <StudioPanel title="Clip">
          <div className="space-y-3">
            <div className="text-xs text-zinc-400">{media?.name}</div>
            <StudioSlider label="Speed" value={Math.round(c.speed * 100)} min={50} max={200} onChange={v => onChange(x => { (x as VideoClip).speed = v / 100; })} suffix="%" />
            <div className="flex gap-1">
              {([0.5, 1, 1.5, 2] as const).map(sp => (
                <button key={sp} onClick={() => onChange(x => { (x as VideoClip).speed = sp; })} className={cn('flex-1 rounded px-2 py-1 text-xs', Math.abs(c.speed - sp) < 0.001 ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{sp}×</button>
              ))}
            </div>
            <AnimatableSlider label="Opacity" value={c.opacity} min={0} max={100} suffix="%" paramName="opacity" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).opacity = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), opacity: kf }; })} />
            <div className="text-xs text-zinc-500">Fade (animates opacity)</div>
            <div className="grid grid-cols-3 gap-1">
              {([
                { id: 'in', label: 'Fade in' },
                { id: 'out', label: 'Fade out' },
                { id: 'both', label: 'Fade both' },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => onChange(x => {
                    const v = x as VideoClip;
                    // Keep the fade under half the clip so in+out don't overlap on
                    // short clips. Keyframes are sampled in clip-local seconds, so a
                    // re-trim just re-positions the existing curve via clipDuration.
                    const dur = clipDuration(v);
                    const fade = Math.min(0.7, dur / 2);
                    let kf: AnimatedParam<number> = makeStatic(v.opacity);
                    if (f.id === 'in' || f.id === 'both') {
                      kf = addKeyframe(kf, 0, 0, 'ease-out');
                      kf = addKeyframe(kf, fade, 100);
                    }
                    if (f.id === 'out' || f.id === 'both') {
                      kf = addKeyframe(kf, Math.max(fade, dur - fade), 100, 'ease-in');
                      kf = addKeyframe(kf, dur, 0);
                    }
                    v.opacity = 100;
                    v.keyframes = { ...(v.keyframes ?? {}), opacity: kf };
                  })}
                  className="rounded bg-white/5 px-1.5 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                >{f.label}</button>
              ))}
            </div>
            <StudioSlider label="Volume" value={Math.round(c.volume * 100)} min={0} max={200} onChange={v => onChange(x => { const vc = x as VideoClip; vc.volume = v / 100; if (v > 0) vc.mutedVolume = undefined; })} suffix="%" />
            <div className="flex gap-1">
              <button
                onClick={() => onChange(x => {
                  const vc = x as VideoClip;
                  if (vc.volume === 0) { vc.volume = vc.mutedVolume ?? 1; vc.mutedVolume = undefined; }
                  else { vc.mutedVolume = vc.volume; vc.volume = 0; }
                })}
                className={cn('flex items-center justify-center gap-1 rounded px-2 py-1 text-xs', c.volume === 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}
              >
                {c.volume === 0 ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {c.volume === 0 ? 'Muted' : 'Mute'}
              </button>
              {([0, 0.5, 1] as const).map(lvl => (
                <button key={lvl} onClick={() => onChange(x => { const vc = x as VideoClip; vc.volume = lvl; vc.mutedVolume = undefined; })} className={cn('flex-1 rounded px-2 py-1 text-xs', Math.abs(c.volume - lvl) < 0.001 ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{Math.round(lvl * 100)}%</button>
              ))}
            </div>
            <div className="text-xs text-zinc-500">Fit</div>
            <div className="flex gap-1">
              {(['contain', 'cover'] as const).map(f => (
                <button key={f} onClick={() => onChange(x => { (x as VideoClip).fit = f; })} className={cn('flex-1 rounded px-2 py-1 text-xs', c.fit === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
              ))}
            </div>
            <div className="text-xs text-zinc-500">Transition in (blends from the previous clip)</div>
            <div className="grid grid-cols-3 gap-1">
              {TRANSITION_LIST.map(tr => (
                <button key={tr.id} onClick={() => onChange(x => { (x as VideoClip).transition = tr.id; if (!(x as VideoClip).transDur) (x as VideoClip).transDur = 0.5; })} className={cn('rounded px-1.5 py-1 text-[10px]', (c.transition ?? 'none') === tr.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{tr.label}</button>
              ))}
            </div>
            {(c.transition && c.transition !== 'none') && (
              <StudioSlider label="Transition length" value={Math.round((c.transDur ?? 0.5) * 100)} min={20} max={200} onChange={v => onChange(x => { (x as VideoClip).transDur = v / 100; })} suffix=" cs" />
            )}
            {onAllTransitions && (
              <div className="flex gap-1">
                <button onClick={() => onAllTransitions((c.transition && c.transition !== 'none') ? c.transition : 'fade')} className="flex-1 rounded bg-cyan-500/15 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/25" title="Apply this transition to every cut on the timeline">Apply to all cuts</button>
                <button onClick={() => onAllTransitions('none')} className="rounded bg-white/5 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10" title="Remove every clip transition">Clear all</button>
              </div>
            )}
          </div>
        </StudioPanel>
        <StudioPanel title="Color grade">
          <div className="space-y-2">
            {onApplyGrade && (
              <select
                value={matchedGrade?.id ?? ''}
                onChange={e => onApplyGrade(e.target.value)}
                className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100"
              >
                <option value="" disabled>— pick a preset —</option>
                {(['neutral', 'cinematic', 'vibrant', 'vintage', 'mono', 'mood'] as ColorGrade['category'][]).map(cat => (
                  <optgroup key={cat} label={cat[0].toUpperCase() + cat.slice(1)}>
                    {COLOR_GRADES.filter(g => g.category === cat).map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            <div className="text-xs text-zinc-500">Quick looks (one tap)</div>
            <div className="grid grid-cols-3 gap-1">
              {([
                { id: 'punchy', label: 'Punchy', brightness: 104, contrast: 122, saturation: 130, hue: 0 },
                { id: 'bw', label: 'B&W', brightness: 102, contrast: 112, saturation: 0, hue: 0 },
                { id: 'warm', label: 'Warm', brightness: 104, contrast: 104, saturation: 112, hue: -12 },
                { id: 'cool', label: 'Cool', brightness: 100, contrast: 106, saturation: 108, hue: 14 },
                { id: 'faded', label: 'Faded', brightness: 108, contrast: 86, saturation: 82, hue: 0 },
                { id: 'reset', label: 'Reset color', brightness: 100, contrast: 100, saturation: 100, hue: 0 },
              ] as const).map(q => {
                const active = Math.abs(c.brightness - q.brightness) < 2 && Math.abs(c.contrast - q.contrast) < 2 && Math.abs(c.saturation - q.saturation) < 2 && Math.abs(c.hue - q.hue) < 3;
                return (
                  <button key={q.id} onClick={() => onChange(x => { const v = x as VideoClip; v.brightness = q.brightness; v.contrast = q.contrast; v.saturation = q.saturation; v.hue = q.hue; })} className={cn('rounded px-1.5 py-1 text-[10px]', active ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{q.label}</button>
                );
              })}
            </div>
            <AnimatableSlider label="Brightness" value={c.brightness} min={0} max={200} suffix="%" paramName="brightness" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).brightness = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), brightness: kf }; })} />
            <AnimatableSlider label="Contrast" value={c.contrast} min={0} max={200} suffix="%" paramName="contrast" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).contrast = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), contrast: kf }; })} />
            <AnimatableSlider label="Saturation" value={c.saturation} min={0} max={200} suffix="%" paramName="saturation" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).saturation = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), saturation: kf }; })} />
            <AnimatableSlider label="Hue" value={c.hue} min={-180} max={180} suffix="°" paramName="hue" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).hue = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), hue: kf }; })} />
          </div>
        </StudioPanel>
        <StudioPanel title="Motion / Transform" defaultOpen={!!c.transform && (c.transform.scale !== 1 || c.transform.x !== 0 || c.transform.y !== 0 || c.transform.rotation !== 0) || !!(c.keyframes?.posX || c.keyframes?.posY || c.keyframes?.scale || c.keyframes?.rotation)}>
          <div className="space-y-2">
            {(() => {
              const tf = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
              const setTf = (patch: Partial<typeof tf>) => onChange(x => { const cur = (x as VideoClip).transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }; (x as VideoClip).transform = { ...cur, ...patch }; });
              // Drop a 2-keyframe motion preset across the clip's full duration on
              // the given params. CRITICAL: video-clip keyframes are sampled in
              // SECONDS (localT = playhead - clip.start), NOT normalized — so the
              // end keyframe must sit at the clip's real duration or the motion
              // finishes in the first second and freezes. clipDuration(c) gives
              // the on-timeline seconds. Renders identically in preview + export
              // because both sample posX/posY/scale/rotation at the same localT.
              const dur = clipDuration(c);
              const applyMotion = (kfs: Partial<Record<'posX' | 'posY' | 'scale' | 'rotation', [number, number]>>) => onChange(x => {
                const v = x as VideoClip;
                const next = { ...(v.keyframes ?? {}) };
                for (const k of Object.keys(kfs) as (keyof typeof kfs)[]) {
                  const [a, b] = kfs[k]!;
                  next[k] = { defaultValue: a, keyframes: [{ t: 0, value: a, easing: 'ease-in-out' }, { t: dur, value: b, easing: 'ease-in-out' }] };
                }
                v.keyframes = next;
              });
              return (
                <>
                  <div className="grid grid-cols-2 gap-1 pb-1">
                    {([
                      ['Ken Burns in', () => applyMotion({ scale: [1, 1.25] })],
                      ['Ken Burns out', () => applyMotion({ scale: [1.25, 1] })],
                      ['Grow', () => applyMotion({ scale: [0.2, 1] })],
                      ['Shrink', () => applyMotion({ scale: [1, 0.2] })],
                      ['Spin', () => applyMotion({ rotation: [0, 360] })],
                      ['Fly in ←', () => applyMotion({ posX: [-0.6, 0] })],
                      ['Fly in →', () => applyMotion({ posX: [0.6, 0] })],
                      ['Pan up', () => applyMotion({ posY: [0.4, -0.4] })],
                    ] as const).map(([lbl, fn]) => (
                      <button key={lbl} onClick={fn} className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">{lbl}</button>
                    ))}
                  </div>
                  {/* Sliders operate in the renderer's NATIVE units (scale 0.05..4,
                      pos -1..1, rotation deg) so keyframes the slider stores are
                      sampled correctly by drawVideoFrame/compositor. A display
                      formatter shows them as friendly %/° without changing storage. */}
                  <AnimatableSlider label="Scale" value={tf.scale} min={0.05} max={4} step={0.01} format={v => `${Math.round(v * 100)}%`} paramName="scale" clip={c} localT={localT}
                    onChange={v => setTf({ scale: v })}
                    onAnimate={kf => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), scale: kf }; })} />
                  <AnimatableSlider label="Position X" value={tf.x} min={-1} max={1} step={0.01} format={v => `${Math.round(v * 100)}%`} paramName="posX" clip={c} localT={localT}
                    onChange={v => setTf({ x: v })}
                    onAnimate={kf => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), posX: kf }; })} />
                  <AnimatableSlider label="Position Y" value={tf.y} min={-1} max={1} step={0.01} format={v => `${Math.round(v * 100)}%`} paramName="posY" clip={c} localT={localT}
                    onChange={v => setTf({ y: v })}
                    onAnimate={kf => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), posY: kf }; })} />
                  <AnimatableSlider label="Rotation" value={tf.rotation} min={-180} max={180} suffix="°" paramName="rotation" clip={c} localT={localT}
                    onChange={v => setTf({ rotation: v })}
                    onAnimate={kf => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), rotation: kf }; })} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => onChange(x => { const v = x as VideoClip; v.flipH = !v.flipH; })} className={`rounded px-2 py-1 text-xs ${c.flipH ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>Flip horizontal</button>
                    <button onClick={() => onChange(x => { const v = x as VideoClip; v.flipV = !v.flipV; })} className={`rounded px-2 py-1 text-xs ${c.flipV ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>Flip vertical</button>
                  </div>
                  <button onClick={() => onChange(x => { const v = x as VideoClip; v.transform = undefined; v.flipH = false; v.flipV = false; const k = { ...(v.keyframes ?? {}) }; delete k.posX; delete k.posY; delete k.scale; delete k.rotation; v.keyframes = k; })} className="w-full rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10">Reset motion</button>
                </>
              );
            })()}
          </div>
        </StudioPanel>
        <StudioPanel title="Effects" defaultOpen={!!(c.effects && c.effects.length)}>
          <div className="space-y-2">
            {(c.effects ?? []).map((e, i) => (
              <div key={i} className="rounded border border-white/10 bg-white/5 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-200">
                    <input type="checkbox" checked={e.enabled} onChange={ev => onChange(x => { const v = x as VideoClip; v.effects = (v.effects ?? []).map((o, j) => j === i ? { ...o, enabled: ev.target.checked } : o); })} /> {VIDEO_EFFECT_LABELS[e.type]}
                  </label>
                  <button onClick={() => onChange(x => { const v = x as VideoClip; v.effects = (v.effects ?? []).filter((_, j) => j !== i); })} className="grid h-4 w-4 place-items-center rounded text-[9px] text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300">×</button>
                </div>
                {e.enabled && <StudioSlider label="Amount" value={e.amount} min={0} max={100} onChange={v => onChange(x => { const vc = x as VideoClip; vc.effects = (vc.effects ?? []).map((o, j) => j === i ? { ...o, amount: v } : o); })} suffix="%" />}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(VIDEO_EFFECT_LABELS) as VideoEffectType[]).filter(tp => !(c.effects ?? []).some(e => e.type === tp)).map(tp => (
                <button key={tp} onClick={() => onChange(x => { const v = x as VideoClip; v.effects = [...(v.effects ?? []), { type: tp, enabled: true, amount: VIDEO_EFFECT_DEFAULT_AMOUNT[tp] }]; })} className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">+ {VIDEO_EFFECT_LABELS[tp]}</button>
              ))}
            </div>
          </div>
        </StudioPanel>
        <StudioPanel title="Crop" defaultOpen={!!c.crop}>
          <div className="space-y-2">
            {(() => {
              const cr = c.crop ?? { x: 0, y: 0, w: 1, h: 1 };
              const setCr = (patch: Partial<typeof cr>) => onChange(x => { const v = x as VideoClip; const cur = v.crop ?? { x: 0, y: 0, w: 1, h: 1 }; v.crop = { ...cur, ...patch }; });
              return (
                <>
                  <StudioSlider label="Left" value={Math.round(cr.x * 100)} min={0} max={90} onChange={v => setCr({ x: v / 100, w: Math.min(cr.w, 1 - v / 100) })} suffix="%" />
                  <StudioSlider label="Top" value={Math.round(cr.y * 100)} min={0} max={90} onChange={v => setCr({ y: v / 100, h: Math.min(cr.h, 1 - v / 100) })} suffix="%" />
                  <StudioSlider label="Width" value={Math.round(cr.w * 100)} min={10} max={100} onChange={v => setCr({ w: Math.min(v / 100, 1 - cr.x) })} suffix="%" />
                  <StudioSlider label="Height" value={Math.round(cr.h * 100)} min={10} max={100} onChange={v => setCr({ h: Math.min(v / 100, 1 - cr.y) })} suffix="%" />
                  <button onClick={() => onChange(x => { (x as VideoClip).crop = undefined; })} className="w-full rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10">Reset crop</button>
                </>
              );
            })()}
          </div>
        </StudioPanel>
        <StudioPanel title="Chroma key (green screen)" defaultOpen={!!c.chromaKey}>
          <div className="space-y-2">
            {(() => {
              const ck = c.chromaKey;
              const setCk = (patch: Partial<NonNullable<VideoClip['chromaKey']>>) => onChange(x => { const cur = (x as VideoClip).chromaKey ?? { color: '#00ff00', similarity: 0.35, smoothness: 0.1, spill: 0.5 }; (x as VideoClip).chromaKey = { ...cur, ...patch }; });
              if (!ck) return (
                <button onClick={() => setCk({})} className="w-full rounded bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10">Enable — remove a green/blue screen</button>
              );
              return (
                <>
                  <label className="flex items-center justify-between text-xs text-zinc-400">Key color<input type="color" value={ck.color} onChange={e => setCk({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent" /></label>
                  <StudioSlider label="Similarity" value={Math.round(ck.similarity * 100)} min={1} max={100} onChange={v => setCk({ similarity: v / 100 })} suffix="%" />
                  <StudioSlider label="Edge softness" value={Math.round(ck.smoothness * 100)} min={0} max={60} onChange={v => setCk({ smoothness: v / 100 })} suffix="%" />
                  <StudioSlider label="Spill removal" value={Math.round(ck.spill * 100)} min={0} max={100} onChange={v => setCk({ spill: v / 100 })} suffix="%" />
                  <button onClick={() => onChange(x => { (x as VideoClip).chromaKey = undefined; })} className="w-full rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10">Disable key</button>
                </>
              );
            })()}
          </div>
        </StudioPanel>
        <StudioPanel title="Color Wheels" defaultOpen={!!c.colorWheels && !isZeroWheels(c.colorWheels)}>
          <ColorWheelsPanel
            value={c.colorWheels ?? ZERO_WHEELS}
            onChange={(w) => onChange(x => { (x as VideoClip).colorWheels = w; })}
            title=""
          />
        </StudioPanel>
        <StudioPanel title="RGB Curves" defaultOpen={!!c.curves}>
          <RgbCurvesPanel
            value={c.curves ?? {}}
            onChange={(curves) => onChange(x => { (x as VideoClip).curves = curves; })}
            title=""
          />
        </StudioPanel>
      </>
    );
  }
  if (clip.kind === 'audio') {
    const c = clip;
    const dur = clipDuration(c);
    const localT = Math.max(0, (playhead ?? 0) - c.start);
    const automated = !!c.volumeKf && c.volumeKf.keyframes.length > 0;
    const curVol = automated ? sampleAnimated(c.volumeKf!, localT) : c.volume;
    const addVolKf = () => onChange(x => {
      const a = x as AudioClip;
      const base = a.volumeKf ?? makeStatic(a.volume);
      a.volumeKf = addKeyframe(base, localT, curVol, 'linear');
    });
    const setEffects = (fx: AudioEffect[]) => onChange(x => { (x as AudioClip).effects = fx; });
    const fx = c.effects ?? [];
    return (
      <>
      <StudioPanel title="Audio">
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">{media?.name}</div>
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span className="flex items-center gap-1.5">Volume {automated && <span className="rounded bg-cyan-500/20 px-1 text-[9px] font-semibold text-cyan-300">{c.volumeKf!.keyframes.length}KF</span>}</span>
            <span className="flex items-center gap-1">
              <button onClick={addVolKf} title="Add volume keyframe at playhead — automate (duck/lift) the level" className="grid h-4 w-4 place-items-center rounded bg-white/5 text-[9px] hover:bg-cyan-500/20 hover:text-cyan-300">◆</button>
              {automated && <button onClick={() => onChange(x => { (x as AudioClip).volumeKf = undefined; })} title="Clear automation" className="grid h-4 w-4 place-items-center rounded bg-white/5 text-[9px] hover:bg-rose-500/20 hover:text-rose-300">×</button>}
              <span className="ml-1 tabular-nums text-zinc-300">{Math.round(curVol * 100)}%</span>
            </span>
          </div>
          <input type="range" min={0} max={200} value={Math.round(curVol * 100)} onChange={e => { const v = parseFloat(e.target.value) / 100; if (automated) onChange(x => { (x as AudioClip).volumeKf = addKeyframe(c.volumeKf!, localT, v, 'linear'); }); else onChange(x => { (x as AudioClip).volume = v; }); }} className="h-1 w-full" />
          {automated && <div className="text-[9px] text-cyan-300/70">Automation on — drag the slider at different playhead times to duck/lift.</div>}
          <StudioSlider label="Speed" value={Math.round(c.speed * 100)} min={50} max={200} onChange={v => onChange(x => { (x as AudioClip).speed = v / 100; })} suffix="%" />
          <StudioSlider label="Fade in" value={c.fadeIn} min={0} max={5} step={0.1} onChange={v => onChange(x => { (x as AudioClip).fadeIn = v; })} suffix="s" />
          <StudioSlider label="Fade out" value={c.fadeOut} min={0} max={5} step={0.1} onChange={v => onChange(x => { (x as AudioClip).fadeOut = v; })} suffix="s" />
          <div className="grid grid-cols-3 gap-1">
            <button onClick={() => onChange(x => { (x as AudioClip).fadeIn = Math.min(1, dur); })} title="Quick 1s fade-in" className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">Fade in 1s</button>
            <button onClick={() => onChange(x => { (x as AudioClip).fadeOut = Math.min(1, dur); })} title="Quick 1s fade-out" className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">Fade out 1s</button>
            <button onClick={() => onChange(x => { const a = x as AudioClip; const f = Math.min(1, dur / 2); a.fadeIn = f; a.fadeOut = f; })} title="Quick fade in + out" className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">Fade both</button>
          </div>
          {(() => {
            const normalized = fx.some(e => e.type === 'compressor');
            return (
              <label className="flex items-center justify-between text-[10px] text-zinc-300">
                <span>Normalize <span className="text-zinc-500">(level out loudness)</span></span>
                <input type="checkbox" checked={normalized} onChange={e => { if (e.target.checked) setEffects([...fx, { type: 'compressor', enabled: true, ...AUDIO_EFFECT_DEFAULTS['compressor'] }]); else setEffects(fx.filter(o => o.type !== 'compressor')); }} />
              </label>
            );
          })()}
        </div>
      </StudioPanel>
      <StudioPanel title="Audio effects" defaultOpen={fx.length > 0}>
        <div className="space-y-2">
          {fx.map((e, i) => (
            <AudioEffectRow key={i} fx={e} onChange={n => setEffects(fx.map((o, j) => j === i ? n : o))} onRemove={() => setEffects(fx.filter((_, j) => j !== i))} />
          ))}
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(AUDIO_EFFECT_LABELS) as AudioEffectType[]).filter(tp => !fx.some(e => e.type === tp)).map(tp => (
              <button key={tp} onClick={() => setEffects([...fx, { type: tp, enabled: true, ...AUDIO_EFFECT_DEFAULTS[tp] }])} className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">+ {AUDIO_EFFECT_LABELS[tp]}</button>
            ))}
          </div>
        </div>
      </StudioPanel>
      </>
    );
  }
  const c = clip;
  return (
    <StudioPanel title="Text">
      <div className="space-y-3">
        <StudioButton size="sm" variant="primary" onClick={onOpenText}><TypeIcon className="h-3 w-3" /> Edit text…</StudioButton>
        <StudioSlider label="Duration" value={c.duration} min={0.5} max={20} step={0.1} onChange={v => onChange(x => { (x as TextClip).duration = v; })} suffix="s" />
        <div className="text-xs text-zinc-500">Position</div>
        <div className="flex gap-1">
          {(['top', 'center', 'bottom'] as const).map(p => (
            <button key={p} onClick={() => onChange(x => { const tc = x as TextClip; tc.pos = p; tc.nx = undefined; tc.ny = undefined; })} className={cn('flex-1 rounded px-2 py-1 text-xs', c.pos === p && c.nx == null ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{p}</button>
          ))}
        </div>
        <div className="text-xs text-zinc-500">Animation</div>
        <div className="grid grid-cols-3 gap-1">
          {TEXT_ANIMATIONS.map(a => (
            <button key={a.id} onClick={() => onChange(x => { (x as TextClip).anim = a.id; })} className={cn('rounded px-1.5 py-1 text-[10px]', c.anim === a.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{a.label}</button>
          ))}
        </div>
        <div className="text-xs text-zinc-500 pt-1">Hand-animate (keyframes over the clip)</div>
        <div className="grid grid-cols-2 gap-1">
          {(() => {
            const setKf = (patch: Partial<NonNullable<TextClip['kf']>>) => onChange(x => { const tc = x as TextClip; tc.kf = { ...(tc.kf ?? {}), ...patch }; });
            // Text keyframes are sampled in NORMALIZED localT (0..1), so end at t:1.
            const ramp = (a: number, b: number) => ({ defaultValue: a, keyframes: [{ t: 0, value: a, easing: 'ease-in-out' as const }, { t: 1, value: b, easing: 'ease-in-out' as const }] });
            return ([
              ['Grow over time', () => setKf({ scale: ramp(0.5, 1.6) })],
              ['Shrink', () => setKf({ scale: ramp(1.6, 0.6) })],
              ['Spin', () => setKf({ rotation: ramp(0, 360) })],
              ['Drift up', () => setKf({ posY: ramp(0.15, -0.15) })],
              ['Pulse in', () => setKf({ opacity: ramp(0, 100) })],
              ['Clear', () => onChange(x => { (x as TextClip).kf = undefined; })],
            ] as const).map(([lbl, fn]) => (
              <button key={lbl} onClick={fn} className="rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20">{lbl}</button>
            ));
          })()}
        </div>
      </div>
    </StudioPanel>
  );
}

function NewDialog({ onCancel, onCreate }: { onCancel: () => void; onCreate: (preset: typeof PRESETS[0], name: string) => void }) {
  const [presetId, setPresetId] = React.useState(PRESETS[0].id);
  const [name, setName] = React.useState('Untitled');
  return (
    <Dialog title="New Project" onCancel={onCancel} onConfirm={() => onCreate(PRESETS.find(p => p.id === presetId) ?? PRESETS[0], name)} confirmLabel="Create">
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} /></Field>
      <Field label="Resolution">
        <div className="grid grid-cols-2 gap-1">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => setPresetId(p.id)} className={cn('rounded px-2 py-1.5 text-xs', presetId === p.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{p.label}</button>
          ))}
        </div>
      </Field>
    </Dialog>
  );
}

function ExportDialog({ presetId, setPresetId, onCancel, onExport }: { presetId: string; setPresetId: (v: string) => void; onCancel: () => void; onExport: () => void }) {
  const isPro = useIsPro();
  return (
    <Dialog title="Export Video" onCancel={onCancel} onConfirm={onExport} confirmLabel="Render & Download">
      <Field label="Resolution">
        <div className="grid grid-cols-2 gap-1">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => setPresetId(p.id)} className={cn('relative rounded px-2 py-1.5 text-xs', presetId === p.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>
              {p.label}
              <span className="absolute right-1 top-1"><ProBadge toolKey={POLICY_KEY} lever="output-resolution" value={p.h} isPro={isPro} compact /></span>
            </button>
          ))}
        </div>
      </Field>
      <div className="rounded bg-amber-500/10 p-2 text-xs text-amber-200">Rendering uses your CPU and may take several minutes for long videos.</div>
    </Dialog>
  );
}

function OpenDialog({ items, onCancel, onPick }: { items: StudioProject[]; onCancel: () => void; onPick: (id: string) => void }) {
  return (
    <Dialog title="Library" onCancel={onCancel} onConfirm={onCancel} confirmLabel="Close">
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {items.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects yet</div>}
        {items.map(p => (
          <button key={p.id} onClick={() => onPick(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
            <Film className="h-3.5 w-3.5 text-zinc-400" />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function TextDialog({ clip, fonts, onCancel, onSave }: { clip: TextClip; fonts: string[]; onCancel: () => void; onSave: (mut: (c: TimelineClip) => void) => void }) {
  const [t, setT] = React.useState({ ...clip });
  return (
    <Dialog title="Title" wide onCancel={onCancel} onConfirm={() => onSave(c => { Object.assign(c, t); })} confirmLabel="Apply">
      <div className="space-y-3">
        <Field label="Text"><textarea rows={3} value={t.text} onChange={e => setT({ ...t, text: e.target.value })} className={INPUT_CLS} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Font"><select value={t.font} onChange={e => setT({ ...t, font: e.target.value })} className={INPUT_CLS}>{fonts.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}</select></Field>
          <Field label="Size"><input type="number" value={t.size} onChange={e => setT({ ...t, size: +e.target.value })} className={INPUT_CLS} /></Field>
          <Field label="Color"><input type="color" value={t.color} onChange={e => setT({ ...t, color: e.target.value })} className="h-8 w-full rounded" /></Field>
          <Field label="Weight"><select value={t.weight} onChange={e => setT({ ...t, weight: +e.target.value })} className={INPUT_CLS}>{[400, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}</select></Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={t.outline} onChange={e => setT({ ...t, outline: e.target.checked })} /> Outline
        </label>
        {t.outline && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Outline color"><input type="color" value={t.outlineColor} onChange={e => setT({ ...t, outlineColor: e.target.value })} className="h-8 w-full rounded" /></Field>
            <Field label="Outline width"><input type="number" value={t.outlineWidth} onChange={e => setT({ ...t, outlineWidth: +e.target.value })} className={INPUT_CLS} /></Field>
          </div>
        )}
      </div>
    </Dialog>
  );
}

const INPUT_CLS = 'w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1 text-xs text-zinc-400"><span>{label}</span>{children}</label>
);

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK', wide }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string; wide?: boolean }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width={wide ? 'lg' : 'sm'}>{children}</SharedDialog>;
}

interface DocStateLite extends Omit<DocState, 'selectedId' | 'playhead'> {
  mediaRefs: { id: string; name: string; kind: 'video' | 'audio' | 'image'; duration: number; width: number; height: number; thumb?: string }[];
}

function AudioEffectRow({ fx, onChange, onRemove }: { fx: AudioEffect; onChange: (n: AudioEffect) => void; onRemove: () => void }) {
  const set = (patch: Partial<AudioEffect>) => onChange({ ...fx, ...patch });
  const S = ({ label, k, min, max, step = 1, suffix }: { label: string; k: keyof AudioEffect; min: number; max: number; step?: number; suffix?: string }) => (
    <StudioSlider label={label} value={(fx[k] as number) ?? 0} min={min} max={max} step={step} onChange={v => set({ [k]: v } as Partial<AudioEffect>)} suffix={suffix} />
  );
  return (
    <div className="rounded border border-white/10 bg-white/5 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-200">
          <input type="checkbox" checked={fx.enabled} onChange={e => set({ enabled: e.target.checked })} /> {AUDIO_EFFECT_LABELS[fx.type]}
        </label>
        <button onClick={onRemove} className="grid h-4 w-4 place-items-center rounded text-[9px] text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300">×</button>
      </div>
      {fx.enabled && (
        <div className="space-y-1">
          {fx.type === 'eq' && <><S label="Low" k="low" min={-24} max={24} suffix="dB" /><S label="Mid" k="mid" min={-24} max={24} suffix="dB" /><S label="High" k="high" min={-24} max={24} suffix="dB" /></>}
          {(fx.type === 'lowpass' || fx.type === 'highpass') && <><S label="Frequency" k="freq" min={40} max={16000} step={10} suffix="Hz" /><S label="Resonance" k="q" min={0.1} max={12} step={0.1} /></>}
          {fx.type === 'reverb' && <><S label="Amount" k="amount" min={0} max={1} step={0.01} /><S label="Room size" k="time" min={0.2} max={5} step={0.1} suffix="s" /></>}
          {fx.type === 'echo' && <><S label="Delay" k="time" min={0.05} max={1.5} step={0.01} suffix="s" /><S label="Feedback" k="feedback" min={0} max={0.9} step={0.01} /><S label="Mix" k="amount" min={0} max={1} step={0.01} /></>}
          {fx.type === 'compressor' && <><S label="Threshold" k="threshold" min={-60} max={0} suffix="dB" /><S label="Ratio" k="ratio" min={1} max={20} /></>}
          {fx.type === 'pitch' && <S label="Pitch" k="semitones" min={-12} max={12} suffix="st" />}
        </div>
      )}
    </div>
  );
}

function AnimatableSlider({ label, value, min, max, suffix, step, format, paramName, clip, localT, onChange, onAnimate }: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  /** Range step. Defaults to 1; pass <1 for normalized params (scale/position). */
  step?: number;
  /** Custom value display (e.g. show normalized scale as a %). Overrides round+suffix. */
  format?: (v: number) => string;
  paramName: keyof VideoClipKeyframes;
  clip: VideoClip;
  localT: number;
  onChange: (v: number) => void;
  onAnimate: (kf: AnimatedParam<number>) => void;
}) {
  // Delegates to the shared C1 KeyframeSlider (lib/studios/keyframe-slider).
  // Maps its single onChange(nextParam, sampled) back to this call site's
  // static onChange(v) + keyframed onAnimate(kf): if the param has ≥1 KF it's
  // an animation update; a 1-KF "static" result writes the plain value.
  const kf = clip.keyframes?.[paramName];
  return (
    <KeyframeSlider
      label={label} min={min} max={max} step={step} suffix={suffix} format={format}
      param={kf} staticValue={value} time={localT}
      onChange={(next, sampled) => {
        // ≥1 keyframe → it's an animation (store on the clip's keyframe map).
        // 0 keyframes → a pure static value drag (no animation).
        if (next.keyframes.length >= 1) onAnimate(next);
        else onChange(sampled);
      }}
    />
  );
}

const CATEGORY_LABELS: Record<VideoTemplateCategory | 'all', string> = {
  all: 'All',
  social: 'Social',
  business: 'Business',
  lifestyle: 'Lifestyle',
  travel: 'Travel',
  gaming: 'Gaming',
  tutorial: 'Tutorial',
  celebration: 'Celebration',
  music: 'Music',
};

function TemplatesGallery({ activeCategory, onCategory, onPick, onClose }: {
  activeCategory: VideoTemplateCategory | 'all';
  onCategory: (c: VideoTemplateCategory | 'all') => void;
  onPick: (t: VideoTemplate) => void;
  onClose: () => void;
}) {
  const visible = activeCategory === 'all'
    ? VIDEO_TEMPLATES
    : VIDEO_TEMPLATES.filter(t => t.category === activeCategory);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0b0e]/95 backdrop-blur">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f1115] px-4">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-semibold text-zinc-100">Templates</span>
          <span className="text-xs text-zinc-500">{visible.length} ready-to-use</span>
        </div>
        <button onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-48 shrink-0 border-r border-white/5 bg-[#0f1115] p-2">
          {(['all', 'social', 'business', 'lifestyle', 'travel', 'gaming', 'tutorial', 'celebration', 'music'] as const).map(c => {
            const count = c === 'all' ? VIDEO_TEMPLATES.length : VIDEO_TEMPLATES.filter(t => t.category === c).length;
            return (
              <button
                key={c}
                onClick={() => onCategory(c)}
                className={cn(
                  'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm',
                  activeCategory === c ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300 hover:bg-white/5',
                )}
              >
                <span>{CATEGORY_LABELS[c]}</span>
                <span className="text-[10px] text-zinc-500">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(t => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                className="group flex flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[.02] text-left transition hover:border-cyan-400/50 hover:bg-white/5"
              >
                <div
                  className="relative h-32 w-full"
                  style={{ backgroundImage: `url("${thumbDataUri(t)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                >
                  <div className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {t.resolution.h > t.resolution.w ? '9:16' : t.resolution.h === t.resolution.w ? '1:1' : '16:9'}
                  </div>
                </div>
                <div className="flex-1 p-3">
                  <div className="text-sm font-semibold text-zinc-100">{t.name}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-cyan-300">{t.category} · {t.duration}s</div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{t.description}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                    <span>{t.slots.length} clips</span>
                    {t.colorGrade && <span>· grade</span>}
                    {t.texts.length > 0 && <span>· {t.texts.length} titles</span>}
                    {t.musicGenre && <span>· {t.musicGenre} {t.musicBpm}bpm</span>}
                  </div>
                </div>
                <div className="border-t border-white/5 bg-cyan-500/0 px-3 py-2 text-center text-xs font-medium text-cyan-300 transition group-hover:bg-cyan-500/10">
                  Use this template →
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
