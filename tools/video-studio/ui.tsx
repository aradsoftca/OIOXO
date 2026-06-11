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
  ColorWheelsPanel, RgbCurvesPanel,
  type ColorWheels, type CurveSet, ZERO_WHEELS, isZeroWheels,
  applyColorWheelsToImageData, applyCurveSet,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
  EmptyState, pushToast,
  SharedDialog,
} from '@/lib/studios';

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
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  opacity: number;
  fit: 'contain' | 'cover';
  transition?: 'none' | 'fade' | 'slide' | 'wipe';
  transDur?: number;
  chromaKey?: { color: string; similarity: number; smoothness: number; spill: number };
  keyframes?: VideoClipKeyframes;
  colorWheels?: ColorWheels;
  curves?: CurveSet;
  /** PiP transform around the frame center. x/y normalized to frame (0 = centered),
   *  scale 1 = fit, rotation in degrees. Used for picture-in-picture / split / Ken Burns. */
  transform?: { x: number; y: number; scale: number; rotation: number };
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
  anim: 'none' | 'fade' | 'slide-up' | 'pop';
  align: CanvasTextAlign;
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
  master: { volume: number; audioFade: boolean };
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
        try {
        let duration = 0, width = 0, height = 0;
        if (kind === 'video') {
          try {
            if (!playerRef.current) playerRef.current = new WebCodecsPlayer();
            const playerId = `M${_id + 1}`;
            const info = await playerRef.current.addClip(playerId, f);
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
        next.push({
          id: `M${++_id}`,
          file: f, name: f.name, kind,
          duration, width, height, thumb, url,
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
  };

  const applyTemplate = (tpl: VideoTemplate) => {
    setRecovery(null); // committing to a template supersedes the recover-last-session offer
    const next = NEW_DOC({ id: tpl.id, label: tpl.name, w: tpl.resolution.w, h: tpl.resolution.h, fps: tpl.resolution.fps });
    next.name = tpl.name;
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
    if (tpl.colorGrade && tpl.colorGrade !== 'original') {
      next.master.audioFade = true;
    }
    commit(`apply template: ${tpl.name}`, next);
    setTemplatesDialog(false);
    toastFor(`Template "${tpl.name}" loaded — drop your media in`);
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
          pos: 'bottom', anim: 'fade', align: 'center',
        });
        added++;
      }
      commit(`auto-caption (${added})`, next);
      toastFor(`Added ${added} captions — on-device, nothing uploaded`);
    } catch (e) {
      toastFor((e as Error).message || 'Captioning failed');
    } finally {
      setBusy(''); setProgress(0);
    }
  };

  const updateClip = (id: string, mut: (c: TimelineClip) => void, label = 'edit clip') => {
    const next = cloneDoc(doc);
    const c = next.clips.find(x => x.id === id);
    if (!c) return;
    mut(c);
    if (c.start < 0) c.start = 0;
    commit(label, next);
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

  const drawPreviewFrame = React.useCallback((t: number) => {
    const c = previewRef.current;
    if (!c) return;
    const lowTier = device.current.tier === 'low';
    const maxW = lowTier ? Math.min(doc.width, 1280) : doc.width;
    const scale = maxW / doc.width;
    c.width = Math.round(doc.width * scale);
    c.height = Math.round(doc.height * scale);
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
      let transAlpha = 1;
      if (inTrans) {
        const prev = trackClips[ai - 1];
        const pItem = mediaMap.get(prev.mediaId);
        if (pItem) {
          const pLocalT = clipDuration(prev);
          if (pItem.kind === 'image') { const im = new Image(); im.src = pItem.url; if (im.complete) drawVideoFrame(ctx, im, c.width, c.height, prev, pLocalT); }
          else { const pv = getMediaEl(pItem) as HTMLVideoElement; if (pv.readyState >= 2) drawVideoFrame(ctx, pv, c.width, c.height, prev, pLocalT); }
        }
        if (active.transition === 'fade') transAlpha = Math.min(1, (t - active.start) / transDur);
      }
      if (item.kind === 'image') {
        const img = new Image();
        img.src = item.url;
        if (img.complete) drawVideoFrame(ctx, img, c.width, c.height, active, 0, transAlpha);
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
            drawVideoFrame(ctx2, bitmap as any, cc.width, cc.height, active, localT, transAlpha);
          });
        } else {
          const v = getMediaEl(item) as HTMLVideoElement;
          if (Math.abs(v.currentTime - local) > 0.2 && !isNaN(v.duration)) {
            try { v.currentTime = Math.min(Math.max(local, 0), v.duration); } catch {}
          }
          if (v.readyState >= 2) drawVideoFrame(ctx, v, c.width, c.height, active, localT, transAlpha);
        }
      }
    }

    const textTrack = doc.tracks.find(tr => tr.kind === 'text');
    if (textTrack) {
      const txts = doc.clips.filter(cl => cl.trackId === textTrack.id && cl.kind === 'text' && t >= cl.start && t < clipEnd(cl)) as TextClip[];
      for (const tx of txts) {
        const localT = (t - tx.start) / Math.max(tx.duration, 0.01);
        let alpha = 1;
        let off = 0;
        if (tx.anim === 'fade') alpha = Math.min(1, Math.min(localT * 4, (1 - localT) * 4));
        if (tx.anim === 'slide-up') off = (1 - Math.min(1, localT * 6)) * 40;
        if (tx.anim === 'pop') alpha = Math.min(1, localT * 8);
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = `${tx.italic ? 'italic ' : ''}${tx.weight} ${tx.size * (c.width / 1920)}px ${tx.font}`;
        ctx.textAlign = tx.align;
        ctx.textBaseline = 'middle';
        const lines = tx.text.split('\n');
        const lh = tx.size * 1.25 * (c.width / 1920);
        const totalH = lines.length * lh;
        let yBase = tx.pos === 'top' ? c.height * 0.12 + lh / 2
          : tx.pos === 'center' ? c.height / 2 - totalH / 2 + lh / 2
          : c.height - c.height * 0.12 - totalH + lh / 2;
        yBase += off;
        const xBase = tx.align === 'center' ? c.width / 2 : tx.align === 'right' ? c.width - 60 : 60;
        for (let i = 0; i < lines.length; i++) {
          const yy = yBase + i * lh;
          if (tx.outline) {
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, tx.outlineWidth * (c.width / 1920));
            ctx.strokeStyle = tx.outlineColor;
            ctx.strokeText(lines[i], xBase, yy);
          }
          ctx.fillStyle = tx.color;
          ctx.fillText(lines[i], xBase, yy);
        }
        ctx.restore();
      }
    }
  }, [doc, mediaMap]);

  const throttledDraw = useRafThrottle(drawPreviewFrame);
  React.useEffect(() => { throttledDraw(doc.playhead); }, [doc.playhead, throttledDraw]);

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
        <StudioSidebar side="left" width={240}>
          <StudioPanel title="Media">
            <label className="mb-2 flex h-16 cursor-pointer items-center justify-center rounded border border-dashed border-white/15 text-xs text-zinc-500 hover:bg-white/5">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Drop files here
              <input type="file" accept="video/*,audio/*,image/*" multiple className="hidden" onChange={e => e.target.files && ingestFiles(e.target.files)} />
            </label>
            <div className="space-y-1">
              {media.map(m => (
                <button
                  key={m.id}
                  onDoubleClick={() => addClipFromMedia(m.id)}
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
                  <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200 opacity-0 transition-opacity group-hover:opacity-100">
                    <Plus className="h-3 w-3" /> Add
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
                <StudioButton size="sm" variant="soft" onClick={addTextClip}><TypeIcon className="h-3 w-3" /> Text title</StudioButton>
                <StudioButton size="sm" variant="soft" onClick={() => void autoCaption()} title="Transcribe speech on your device and add captions"><Sparkles className="h-3 w-3" /> Auto-caption</StudioButton>
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
                className="block max-h-full max-w-full rounded border border-white/10 shadow-2xl"
                style={{ aspectRatio: `${doc.width}/${doc.height}`, height: '100%', width: '100%', objectFit: 'contain' }}
              />
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
            onTrimClip={(id, edge, t) => updateClip(id, c => {
              if (c.kind === 'text') {
                if (edge === 'l') { const old = c.start; const newDur = c.duration + (old - t); if (newDur > 0.05) { c.start = t; c.duration = newDur; } }
                else { c.duration = Math.max(0.05, t - c.start); }
              } else {
                if (edge === 'l') {
                  const delta = t - c.start;
                  const newSrcStart = c.srcStart + delta * c.speed;
                  if (newSrcStart < c.srcEnd - 0.05 && t < clipEnd(c) - 0.05) { c.start = t; c.srcStart = newSrcStart; }
                } else {
                  const newSrcEnd = c.srcStart + (t - c.start) * c.speed;
                  if (newSrcEnd > c.srcStart + 0.05) c.srcEnd = newSrcEnd;
                }
              }
            }, 'trim')}
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

        <StudioSidebar width={280}>
          {selectedClip ? <ClipInspector clip={selectedClip} media={selectedClip.kind !== 'text' ? mediaMap.get(selectedClip.mediaId) ?? null : null} onChange={(mut) => updateClip(selectedClip.id, mut, 'props')} onOpenText={() => selectedClip.kind === 'text' && setTextDialogClip(selectedClip.id)} onApplyGrade={(g) => applyGradeToClip(selectedClip.id, g)} playhead={doc.playhead} /> : (
            <StudioPanel title="Inspector">
              <div className="text-xs text-zinc-500">Select a clip on the timeline to edit its properties.</div>
            </StudioPanel>
          )}
          <StudioPanel title="Master">
            <StudioSlider label="Volume" value={Math.round(doc.master.volume * 100)} min={0} max={200} onChange={v => commit('master vol', { ...cloneDoc(doc), master: { ...doc.master, volume: v / 100 } })} suffix="%" />
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={doc.master.audioFade} onChange={e => commit('audio fade', { ...cloneDoc(doc), master: { ...doc.master, audioFade: e.target.checked } })} /> Audio fade in/out
            </label>
          </StudioPanel>
        </StudioSidebar>
      </StudioBody>

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
  // drawClipFrame so preview == output.
  const tf = v.transform;
  if (tf && (tf.scale !== 1 || tf.x !== 0 || tf.y !== 0 || tf.rotation !== 0)) {
    const cx = dw / 2 + tf.x * dw;
    const cy = dh / 2 + tf.y * dh;
    ctx.translate(cx, cy);
    ctx.rotate((tf.rotation * Math.PI) / 180);
    ctx.scale(tf.scale, tf.scale);
    ctx.translate(-dw / 2, -dh / 2);
  }
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;
  if (v.chromaKey) {
    const keyed = chromaKeySource(src as any, v.chromaKey);
    ctx.drawImage((keyed ?? (src as any)) as any, tx, ty, tw, th);
  } else {
    ctx.drawImage(src as any, tx, ty, tw, th);
  }
  ctx.filter = 'none';
  const hasWheels = v.colorWheels && !isZeroWheels(v.colorWheels);
  const hasCurves = v.curves && (v.curves.master || v.curves.r || v.curves.g || v.curves.b);
  if (hasWheels || hasCurves) {
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
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = xToT(e.clientX - r.left + (ref.current?.scrollLeft ?? 0));
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
      onMoveClip(d.id, newStart);
      setSnapLine(s.hit);
      const c = doc.clips.find(x => x.id === d.id);
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
                onClick={() => onSelect(null)}
              />
            ))}

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
                  onPointerDown={(e) => onPointerDownClip(e, c, 'move')}
                  onDoubleClick={() => c.kind === 'text' && onTextEdit(c.id)}
                >
                  <div
                    onPointerDown={(e) => onPointerDownClip(e, c, 'trim-l')}
                    className="h-full w-1.5 cursor-ew-resize bg-white/30 hover:bg-cyan-400"
                  />
                  <div className="flex-1 overflow-hidden px-1.5 text-[10px] font-medium text-white truncate">
                    {item?.thumb && c.kind === 'video' && (
                      <img src={item.thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
                    )}
                    <span className="relative">
                      {c.kind === 'text' ? (c as TextClip).text.slice(0, 40) : item?.name ?? c.kind}
                    </span>
                  </div>
                  <div
                    onPointerDown={(e) => onPointerDownClip(e, c, 'trim-r')}
                    className="h-full w-1.5 cursor-ew-resize bg-white/30 hover:bg-cyan-400"
                  />
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

function ClipInspector({ clip, media, onChange, onOpenText, onApplyGrade, playhead }: { clip: TimelineClip; media: MediaItem | null; onChange: (mut: (c: TimelineClip) => void) => void; onOpenText: () => void; onApplyGrade?: (gradeId: string) => void; playhead?: number }) {
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
            <AnimatableSlider label="Opacity" value={c.opacity} min={0} max={100} suffix="%" paramName="opacity" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).opacity = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), opacity: kf }; })} />
            <StudioSlider label="Volume" value={Math.round(c.volume * 100)} min={0} max={200} onChange={v => onChange(x => { (x as VideoClip).volume = v / 100; })} suffix="%" />
            <div className="text-xs text-zinc-500">Fit</div>
            <div className="flex gap-1">
              {(['contain', 'cover'] as const).map(f => (
                <button key={f} onClick={() => onChange(x => { (x as VideoClip).fit = f; })} className={cn('flex-1 rounded px-2 py-1 text-xs', c.fit === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
              ))}
            </div>
            <div className="text-xs text-zinc-500">Transition in (blends from the previous clip)</div>
            <div className="flex gap-1">
              {(['none', 'fade', 'slide', 'wipe'] as const).map(tr => (
                <button key={tr} onClick={() => onChange(x => { (x as VideoClip).transition = tr; if (!(x as VideoClip).transDur) (x as VideoClip).transDur = 0.5; })} className={cn('flex-1 rounded px-2 py-1 text-xs', (c.transition ?? 'none') === tr ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{tr}</button>
              ))}
            </div>
            {(c.transition && c.transition !== 'none') && (
              <StudioSlider label="Transition length" value={Math.round((c.transDur ?? 0.5) * 100)} min={20} max={200} onChange={v => onChange(x => { (x as VideoClip).transDur = v / 100; })} suffix=" cs" />
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
            <AnimatableSlider label="Brightness" value={c.brightness} min={0} max={200} suffix="%" paramName="brightness" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).brightness = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), brightness: kf }; })} />
            <AnimatableSlider label="Contrast" value={c.contrast} min={0} max={200} suffix="%" paramName="contrast" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).contrast = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), contrast: kf }; })} />
            <AnimatableSlider label="Saturation" value={c.saturation} min={0} max={200} suffix="%" paramName="saturation" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).saturation = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), saturation: kf }; })} />
            <AnimatableSlider label="Hue" value={c.hue} min={-180} max={180} suffix="°" paramName="hue" clip={c} localT={localT} onChange={v => onChange(x => { (x as VideoClip).hue = v; })} onAnimate={(kf) => onChange(x => { (x as VideoClip).keyframes = { ...((x as VideoClip).keyframes ?? {}), hue: kf }; })} />
          </div>
        </StudioPanel>
        <StudioPanel title="Transform (PiP)" defaultOpen={!!c.transform && (c.transform.scale !== 1 || c.transform.x !== 0 || c.transform.y !== 0 || c.transform.rotation !== 0)}>
          <div className="space-y-2">
            {(() => {
              const tf = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
              const setTf = (patch: Partial<typeof tf>) => onChange(x => { const cur = (x as VideoClip).transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }; (x as VideoClip).transform = { ...cur, ...patch }; });
              return (
                <>
                  <StudioSlider label="Scale" value={Math.round(tf.scale * 100)} min={5} max={400} onChange={v => setTf({ scale: v / 100 })} suffix="%" />
                  <StudioSlider label="Position X" value={Math.round(tf.x * 100)} min={-100} max={100} onChange={v => setTf({ x: v / 100 })} suffix="%" />
                  <StudioSlider label="Position Y" value={Math.round(tf.y * 100)} min={-100} max={100} onChange={v => setTf({ y: v / 100 })} suffix="%" />
                  <StudioSlider label="Rotation" value={tf.rotation} min={-180} max={180} onChange={v => setTf({ rotation: v })} suffix="°" />
                  <button onClick={() => onChange(x => { (x as VideoClip).transform = undefined; })} className="w-full rounded bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10">Reset transform</button>
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
    return (
      <StudioPanel title="Audio">
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">{media?.name}</div>
          <StudioSlider label="Volume" value={Math.round(c.volume * 100)} min={0} max={200} onChange={v => onChange(x => { (x as AudioClip).volume = v / 100; })} suffix="%" />
          <StudioSlider label="Speed" value={Math.round(c.speed * 100)} min={50} max={200} onChange={v => onChange(x => { (x as AudioClip).speed = v / 100; })} suffix="%" />
          <StudioSlider label="Fade in" value={c.fadeIn} min={0} max={5} step={0.1} onChange={v => onChange(x => { (x as AudioClip).fadeIn = v; })} suffix="s" />
          <StudioSlider label="Fade out" value={c.fadeOut} min={0} max={5} step={0.1} onChange={v => onChange(x => { (x as AudioClip).fadeOut = v; })} suffix="s" />
        </div>
      </StudioPanel>
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
            <button key={p} onClick={() => onChange(x => { (x as TextClip).pos = p; })} className={cn('flex-1 rounded px-2 py-1 text-xs', c.pos === p ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{p}</button>
          ))}
        </div>
        <div className="text-xs text-zinc-500">Animation</div>
        <div className="grid grid-cols-2 gap-1">
          {(['none', 'fade', 'slide-up', 'pop'] as const).map(a => (
            <button key={a} onClick={() => onChange(x => { (x as TextClip).anim = a; })} className={cn('rounded px-2 py-1 text-xs', c.anim === a ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{a}</button>
          ))}
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

function AnimatableSlider({ label, value, min, max, suffix, paramName, clip, localT, onChange, onAnimate }: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  paramName: keyof VideoClipKeyframes;
  clip: VideoClip;
  localT: number;
  onChange: (v: number) => void;
  onAnimate: (kf: AnimatedParam<number>) => void;
}) {
  const kf = clip.keyframes?.[paramName];
  const animated = !!kf && kf.keyframes.length > 0;
  const sampledVal = animated ? sampleAnimated(kf, localT) : value;
  const addKf = () => {
    const base: AnimatedParam<number> = kf ?? makeStatic(value);
    const next = addKeyframe(base, localT, sampledVal, 'ease-in-out');
    onAnimate(next);
  };
  const clearKf = () => {
    onAnimate(makeStatic(value));
  };
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          {label}
          {animated && <span className="rounded bg-cyan-500/20 px-1 text-[9px] font-semibold text-cyan-300">{kf!.keyframes.length}KF</span>}
        </span>
        <span className="flex items-center gap-1">
          <button onClick={addKf} title="Add keyframe at playhead" className="grid h-4 w-4 place-items-center rounded bg-white/5 text-[9px] hover:bg-cyan-500/20 hover:text-cyan-300">◆</button>
          {animated && <button onClick={clearKf} title="Clear keyframes" className="grid h-4 w-4 place-items-center rounded bg-white/5 text-[9px] hover:bg-rose-500/20 hover:text-rose-300">×</button>}
          <span className="ml-1 tabular-nums text-zinc-300">{Math.round(animated ? sampledVal : value)}{suffix}</span>
        </span>
      </div>
      <input
        type="range" min={min} max={max} value={animated ? sampledVal : value}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (animated) {
            const next = addKeyframe(kf!, localT, v, 'ease-in-out');
            onAnimate(next);
          } else {
            onChange(v);
          }
        }}
        className="h-1 w-full"
      />
    </div>
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
