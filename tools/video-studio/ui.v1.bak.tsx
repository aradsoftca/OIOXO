'use client';

/**
 * Video Studio — a real timeline (NLE) video editor, 100% in the browser.
 *
 * A horizontal timeline with a draggable playhead, clip blocks you can drag to
 * reorder and trim by their edges, a text-overlay track and a music track,
 * split-at-playhead, zoom, and a live WYSIWYG preview. The sequence + overlays
 * are rendered in ONE ffmpeg.wasm pass by engines/video/editor — no server.
 */

import * as React from 'react';
import {
  Loader2, Download, Plus, Trash2, Film, Scissors, Copy, Type as TypeIcon,
  Play, Pause, Volume2, VolumeX, Music, ZoomIn, ZoomOut, Sliders,
} from 'lucide-react';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { getVideoInfo } from '@/engines/video';
import { concatClips } from '@/engines/video/editor';

interface UIClip {
  id: string; file: File; name: string; duration: number; width: number; height: number;
  start: number; end: number; speed: number;
  volume?: number; brightness?: number; contrast?: number; saturation?: number; thumb?: string;
}
interface TextBlock { id: string; text: string; pos: 'top' | 'center' | 'bottom'; tStart: number; tEnd: number; color: string; }
type Sel = { type: 'clip' | 'text'; id: string } | null;

type Drag =
  | { kind: 'play' }
  | { kind: 'cmove'; id: string }
  | { kind: 'ctrim'; id: string; edge: 'l' | 'r'; ox: number; os: number; oe: number }
  | { kind: 'tmove'; id: string; ox: number; os: number; oe: number }
  | { kind: 'ttrim'; id: string; edge: 'l' | 'r'; ox: number; os: number; oe: number };

let _cid = 0, _tid = 0;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const TEXT_COLORS = ['#ffffff', '#ffe600', '#ff4d4d', '#4dd2ff', '#000000'];
const FORMATS: { id: string; label: string; dims: [number, number] | null }[] = [
  { id: 'orig', label: 'Original', dims: null },
  { id: '16:9', label: '16:9', dims: [1280, 720] },
  { id: '9:16', label: '9:16', dims: [720, 1280] },
  { id: '1:1', label: '1:1', dims: [1080, 1080] },
  { id: '4:5', label: '4:5', dims: [1080, 1350] },
];
const fmtT = (s: number) => {
  if (!Number.isFinite(s)) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
const outDur = (c: UIClip) => Math.max(0, c.end - c.start) / (c.speed || 1);

interface Seg { clip: UIClip; offset: number; dur: number }
function segmentsOf(clips: UIClip[]): { segs: Seg[]; total: number } {
  let off = 0; const segs: Seg[] = [];
  for (const clip of clips) { const dur = outDur(clip); segs.push({ clip, offset: off, dur }); off += dur; }
  return { segs, total: off };
}

async function renderTitlePng(text: string, color: string, outW: number): Promise<Blob> {
  const fontSize = Math.max(28, Math.round(outW * 0.06));
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const w = Math.ceil(meas.measureText(text).width) + fontSize;
  const h = Math.ceil(fontSize * 1.7);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = fontSize * 0.14;
  ctx.strokeStyle = color === '#000000' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.65)';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

async function makeThumb(file: File): Promise<string | undefined> {
  try {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.src = url; v.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('x')); });
    v.currentTime = Math.min(0.5, (v.duration || 1) * 0.1);
    await new Promise<void>((res) => { v.onseeked = () => res(); setTimeout(res, 800); });
    const cw = 160, ch = Math.round((v.videoHeight / v.videoWidth) * cw) || 90;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    c.getContext('2d')!.drawImage(v, 0, 0, cw, ch);
    URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return undefined; }
}

export default function VideoStudioTool() {
  const [clips, setClips] = React.useState<UIClip[]>([]);
  const [texts, setTexts] = React.useState<TextBlock[]>([]);
  const [sel, setSel] = React.useState<Sel>(null);
  const [playhead, setPlayhead] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [pxPerSec, setPxPerSec] = React.useState(90);
  const [mute, setMute] = React.useState(false);
  const [format, setFormat] = React.useState('orig');
  const [fit, setFit] = React.useState<'contain' | 'cover'>('contain');
  const [transition, setTransition] = React.useState<'none' | 'fade' | 'slide' | 'wipe'>('none');
  const [music, setMusic] = React.useState<File | null>(null);
  const [musicVol, setMusicVol] = React.useState(0.5);
  const [audioFade, setAudioFade] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<{ url: string; name: string } | null>(null);

  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const musicRef = React.useRef<HTMLInputElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const laneRef = React.useRef<HTMLDivElement | null>(null);
  const urls = React.useRef<Map<string, string>>(new Map());
  const loadedRef = React.useRef<string | null>(null);
  const playingRef = React.useRef(false);
  const dragRef = React.useRef<Drag | null>(null);
  const clipsRef = React.useRef<UIClip[]>([]); clipsRef.current = clips;
  const { guard, gate } = useUsageGate('video');

  const ensureUrl = React.useCallback((c: UIClip) => {
    let u = urls.current.get(c.id);
    if (!u) { u = URL.createObjectURL(c.file); urls.current.set(c.id, u); }
    return u;
  }, []);

  React.useEffect(() => () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current.clear();
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result]);

  const { segs, total } = React.useMemo(() => segmentsOf(clips), [clips]);
  const dims = FORMATS.find((f) => f.id === format)?.dims;
  const previewAR = dims ? `${dims[0]} / ${dims[1]}` : (clips[0] ? `${clips[0].width} / ${clips[0].height}` : '16 / 9');

  // ---- preview engine ------------------------------------------------------
  const segAt = React.useCallback((t: number, list = clipsRef.current): Seg | null => {
    const { segs: s, total: tot } = segmentsOf(list);
    if (!s.length) return null;
    if (t >= tot) return s[s.length - 1];
    return s.find((g) => t >= g.offset && t < g.offset + g.dur) || s[0];
  }, []);

  const applyPreview = React.useCallback((t: number, autoplay: boolean) => {
    const v = videoRef.current; if (!v) return;
    const seg = segAt(t); if (!seg) { v.pause(); return; }
    const local = seg.clip.start + Math.max(0, t - seg.offset) * (seg.clip.speed || 1);
    if (loadedRef.current !== seg.clip.id) {
      loadedRef.current = seg.clip.id;
      v.src = ensureUrl(seg.clip);
      v.playbackRate = seg.clip.speed || 1; v.muted = mute;
      const onMeta = () => {
        try { v.currentTime = Math.min(local, (v.duration || seg.clip.end) - 0.01); } catch { /* */ }
        if (autoplay) void v.play().catch(() => {});
        v.removeEventListener('loadedmetadata', onMeta);
      };
      v.addEventListener('loadedmetadata', onMeta);
      v.load();
    } else {
      v.playbackRate = seg.clip.speed || 1; v.muted = mute;
      try { v.currentTime = local; } catch { /* */ }
      if (autoplay) void v.play().catch(() => {});
    }
  }, [segAt, ensureUrl, mute]);

  // rAF loop drives the playhead from the <video> clock while playing.
  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!playingRef.current) return;
      const v = videoRef.current; if (!v) return;
      const list = clipsRef.current;
      const { segs: s, total: tot } = segmentsOf(list);
      const cur = s.find((g) => g.clip.id === loadedRef.current);
      if (!cur) return;
      if (v.currentTime >= cur.clip.end - 0.05) {
        const nextT = cur.offset + cur.dur + 0.001;
        if (nextT < tot - 0.02) { applyPreview(nextT, true); setPlayhead(nextT); }
        else { v.pause(); playingRef.current = false; setPlaying(false); setPlayhead(tot); }
        return;
      }
      const ph = cur.offset + (v.currentTime - cur.clip.start) / (cur.clip.speed || 1);
      setPlayhead(Math.min(ph, tot));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyPreview]);

  const seekTo = React.useCallback((t: number) => {
    const tt = Math.max(0, Math.min(t, total));
    setPlayhead(tt);
    applyPreview(tt, playingRef.current);
  }, [applyPreview, total]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v || !clips.length) return;
    if (playingRef.current) { v.pause(); playingRef.current = false; setPlaying(false); return; }
    playingRef.current = true; setPlaying(true);
    const t = playhead >= total - 0.05 ? 0 : playhead;
    setPlayhead(t); applyPreview(t, true);
  };

  // ---- clip management -----------------------------------------------------
  const addFiles = async (files: FileList | File[]) => {
    setError('');
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name)) continue;
      try {
        const { info, url } = await getVideoInfo(file);
        URL.revokeObjectURL(url);
        const id = `c${++_cid}`;
        setClips((cs) => [...cs, { id, file, name: file.name, duration: info.duration, width: info.width, height: info.height, start: 0, end: info.duration, speed: 1, volume: 1 }]);
        void makeThumb(file).then((thumb) => { if (thumb) setClips((cs) => cs.map((c) => c.id === id ? { ...c, thumb } : c)); });
      } catch { setError(`Could not read ${file.name}.`); }
    }
  };
  const patchClip = (id: string, p: Partial<UIClip>) => setClips((cs) => cs.map((c) => c.id === id ? { ...c, ...p } : c));
  const patchText = (id: string, p: Partial<TextBlock>) => setTexts((ts) => ts.map((t) => t.id === id ? { ...t, ...p } : t));

  const removeSel = () => {
    if (!sel) return;
    if (sel.type === 'clip') {
      const u = urls.current.get(sel.id); if (u) { URL.revokeObjectURL(u); urls.current.delete(sel.id); }
      if (loadedRef.current === sel.id) loadedRef.current = null;
      setClips((cs) => cs.filter((c) => c.id !== sel.id));
    } else setTexts((ts) => ts.filter((t) => t.id !== sel.id));
    setSel(null);
  };
  const duplicateSel = () => {
    if (sel?.type === 'clip') {
      setClips((cs) => { const i = cs.findIndex((c) => c.id === sel.id); if (i < 0) return cs; const n = [...cs]; n.splice(i + 1, 0, { ...cs[i], id: `c${++_cid}` }); return n; });
    } else if (sel?.type === 'text') {
      setTexts((ts) => { const t = ts.find((x) => x.id === sel.id); return t ? [...ts, { ...t, id: `t${++_tid}`, tStart: t.tStart + 1, tEnd: t.tEnd + 1 }] : ts; });
    }
  };
  const splitAtPlayhead = () => {
    const seg = segs.find((g) => playhead > g.offset + 0.05 && playhead < g.offset + g.dur - 0.05);
    if (!seg) return;
    const c = seg.clip;
    const srcCut = c.start + (playhead - seg.offset) * (c.speed || 1);
    setClips((cs) => {
      const i = cs.findIndex((x) => x.id === c.id); if (i < 0) return cs;
      const left = { ...c, end: srcCut };
      const right = { ...c, id: `c${++_cid}`, start: srcCut };
      const n = [...cs]; n.splice(i, 1, left, right); return n;
    });
  };
  const addText = () => {
    const id = `t${++_tid}`;
    setTexts((ts) => [...ts, { id, text: 'Your text', pos: 'bottom', tStart: Math.min(playhead, Math.max(0, total - 2)), tEnd: Math.min(playhead + 2.5, total || 2.5), color: '#ffffff' }]);
    setSel({ type: 'text', id });
  };

  // ---- timeline drag -------------------------------------------------------
  const xToSec = React.useCallback((clientX: number) => {
    const lane = laneRef.current; if (!lane) return 0;
    const r = lane.getBoundingClientRect();
    return (clientX - r.left + lane.scrollLeft) / pxPerSec;
  }, [pxPerSec]);

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const sec = xToSec(e.clientX);
      if (d.kind === 'play') { seekTo(sec); return; }
      if (d.kind === 'cmove') {
        // live reorder: drop the dragged clip into the slot under the pointer
        const list = clipsRef.current; const di = list.findIndex((c) => c.id === d.id); if (di < 0) return;
        const { segs: s } = segmentsOf(list);
        let target = s.length - 1;
        for (let i = 0; i < s.length; i++) { if (sec < s[i].offset + s[i].dur / 2) { target = i; break; } }
        if (target !== di) setClips((cs) => { const n = [...cs]; const [m] = n.splice(di, 1); n.splice(target, 0, m); return n; });
        return;
      }
      if (d.kind === 'ctrim') {
        const dxSec = (e.clientX - d.ox) / pxPerSec;
        setClips((cs) => cs.map((c) => {
          if (c.id !== d.id) return c;
          const sp = c.speed || 1;
          if (d.edge === 'l') return { ...c, start: Math.max(0, Math.min(d.os + dxSec * sp, c.end - 0.1)) };
          return { ...c, end: Math.min(c.duration, Math.max(d.oe + dxSec * sp, c.start + 0.1)) };
        }));
        return;
      }
      if (d.kind === 'tmove') {
        const dxSec = (e.clientX - d.ox) / pxPerSec; const len = d.oe - d.os;
        const start = Math.max(0, Math.min(d.os + dxSec, (total || len) - len));
        patchText(d.id, { tStart: start, tEnd: start + len });
        return;
      }
      if (d.kind === 'ttrim') {
        const dxSec = (e.clientX - d.ox) / pxPerSec;
        if (d.edge === 'l') patchText(d.id, { tStart: Math.max(0, Math.min(d.os + dxSec, d.oe - 0.2)) });
        else patchText(d.id, { tEnd: Math.max(d.os + 0.2, d.oe + dxSec) });
        return;
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [xToSec, pxPerSec, seekTo, total]);

  const startDrag = (e: React.PointerEvent, d: Drag) => { e.stopPropagation(); dragRef.current = d; };

  // ---- export --------------------------------------------------------------
  const exportVideo = async () => {
    if (!clips.length) return;
    const biggest = Math.max(...clips.map((c) => c.file.size));
    if (!(await guard({ bytes: biggest }))) return;
    setBusy(true); setError(''); setResult(null); setRatio(0);
    try {
      const [W, H] = dims ?? [clips[0].width, clips[0].height];
      const overlays = await Promise.all(
        texts.filter((t) => t.text.trim()).map(async (t) => ({ png: await renderTitlePng(t.text.trim(), t.color, W), pos: t.pos, start: t.tStart, end: t.tEnd })),
      );
      const blob = await concatClips(
        clips.map((c) => ({ file: c.file, start: c.start, end: c.end, speed: c.speed, volume: c.volume, brightness: c.brightness, contrast: c.contrast, saturation: c.saturation })),
        { width: W, height: H, fps: 30, mute, fit, transition, transDur: 0.5, music: music ?? undefined, musicVolume: musicVol, overlays, audioFade, onProgress: setRatio },
      );
      setResult({ url: URL.createObjectURL(blob), name: 'video-studio.mp4' });
    } catch (e) {
      setError((e as Error).message || 'Export failed. If a clip has no audio, enable “Mute”.');
    } finally { setBusy(false); }
  };

  const selClip = sel?.type === 'clip' ? clips.find((c) => c.id === sel.id) : null;
  const selText = sel?.type === 'text' ? texts.find((t) => t.id === sel.id) : null;
  const activeTexts = texts.filter((t) => playhead >= t.tStart && playhead <= t.tEnd && t.text.trim());
  const laneWidth = Math.max((total || 0) * pxPerSec + 40, 600);

  const tbtn = 'flex items-center gap-1.5 border border-black/[0.1] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40';

  return (
    <div className="space-y-3">
      {gate}

      {!clips.length ? (
        <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files) void addFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center gap-2 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-16 text-center">
          <Film className="h-9 w-9 text-[var(--color-cat-video)]" />
          <button type="button" onClick={() => fileRef.current?.click()} className="text-[16px] font-bold hover:underline">Add video clips</button>
          <div className="max-w-md text-[12px] text-[var(--color-fg-muted)]">Drop clips onto a real timeline — drag to reorder, trim the edges, split at the playhead, add text and music, pick a format, then export one video. Everything renders on your device.</div>
          <input ref={fileRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      ) : (
        <>
          {/* preview */}
          <div className="mx-auto w-full max-w-[760px]">
            <div className="relative mx-auto flex items-center justify-center overflow-hidden bg-black" style={{ aspectRatio: previewAR, maxHeight: '46vh' }}>
              <video ref={videoRef} playsInline className="h-full w-full" style={{ objectFit: fit === 'cover' ? 'cover' : 'contain' }} />
              {activeTexts.map((t) => (
                <div key={t.id} className="pointer-events-none absolute inset-x-0 flex justify-center px-[5%]"
                  style={{ top: t.pos === 'top' ? '6%' : t.pos === 'center' ? '46%' : 'auto', bottom: t.pos === 'bottom' ? '7%' : 'auto' }}>
                  <span className="text-center font-black leading-tight" style={{ color: t.color, fontSize: 'clamp(14px, 4.5vw, 34px)', WebkitTextStroke: `1px ${t.color === '#000000' ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.7)'}` }}>{t.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={togglePlay} className="grid h-10 w-10 place-items-center bg-[var(--color-cat-video)] text-white transition hover:brightness-110">{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
              <span className="font-mono text-[12px] tabular-nums text-[var(--color-fg-muted)]">{fmtT(playhead)} <span className="text-[var(--color-fg-subtle)]">/ {fmtT(total)}</span></span>
              <button type="button" onClick={() => { setMute((m) => { if (videoRef.current) videoRef.current.muted = !m; return !m; }); }} className="ml-auto grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]" title="Mute preview">{mute ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPxPerSec((z) => Math.max(24, z - 24))} className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><ZoomOut className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPxPerSec((z) => Math.min(260, z + 24))} className="grid h-9 w-9 place-items-center text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"><ZoomIn className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 border-y border-black/[0.08] py-2">
            <button type="button" className={tbtn} onClick={() => fileRef.current?.click()}><Plus className="h-3.5 w-3.5" /> Media</button>
            <button type="button" className={tbtn} onClick={addText}><TypeIcon className="h-3.5 w-3.5" /> Text</button>
            <button type="button" className={tbtn} onClick={splitAtPlayhead}><Scissors className="h-3.5 w-3.5" /> Split</button>
            <button type="button" className={tbtn} onClick={duplicateSel} disabled={!sel}><Copy className="h-3.5 w-3.5" /> Duplicate</button>
            <button type="button" className={tbtn} onClick={removeSel} disabled={!sel}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            <span className="mx-1 h-5 w-px bg-black/[0.12]" />
            <button type="button" className={tbtn} onClick={() => musicRef.current?.click()}><Music className="h-3.5 w-3.5" /> {music ? 'Music ✓' : 'Music'}</button>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="border border-black/[0.1] bg-transparent px-2 py-1.5 text-[11px] font-semibold">{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
            <select value={fit} onChange={(e) => setFit(e.target.value as 'contain' | 'cover')} className="border border-black/[0.1] bg-transparent px-2 py-1.5 text-[11px] font-semibold"><option value="contain">Fit</option><option value="cover">Fill</option></select>
            <select value={transition} onChange={(e) => setTransition(e.target.value as 'none' | 'fade' | 'slide' | 'wipe')} className="border border-black/[0.1] bg-transparent px-2 py-1.5 text-[11px] font-semibold">{(['none', 'fade', 'slide', 'wipe'] as const).map((t) => <option key={t} value={t}>{t === 'none' ? 'No transition' : t}</option>)}</select>
            <label className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--color-fg-muted)]"><input type="checkbox" checked={audioFade} onChange={(e) => setAudioFade(e.target.checked)} /> Audio fade</label>
            <button type="button" onClick={exportVideo} disabled={busy} className="ml-auto flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{busy ? `Rendering ${Math.round(ratio * 100)}%` : 'Export'}
            </button>
            <input ref={fileRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
            <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setMusic(f); e.target.value = ''; }} />
          </div>

          {/* timeline */}
          <div ref={laneRef} className="relative select-none overflow-x-auto border border-black/[0.08] bg-[var(--color-surface-1)]"
            onPointerDown={(e) => { setSel(null); startDrag(e, { kind: 'play' }); seekTo(xToSec(e.clientX)); }}>
            <div className="relative" style={{ width: laneWidth }}>
              {/* ruler */}
              <Ruler total={total} pxPerSec={pxPerSec} />

              {/* TEXT track */}
              <TrackLabel>Text</TrackLabel>
              <div className="relative mx-0 h-9 border-b border-black/[0.06]" style={{ width: laneWidth }}>
                {texts.map((t) => (
                  <div key={t.id} onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'text', id: t.id }); startDrag(e, { kind: 'tmove', id: t.id, ox: e.clientX, os: t.tStart, oe: t.tEnd }); }}
                    className={`absolute top-1 flex h-7 cursor-grab items-center overflow-hidden rounded px-2 text-[10px] font-bold text-white ${sel?.id === t.id ? 'ring-2 ring-white' : ''}`}
                    style={{ left: t.tStart * pxPerSec, width: Math.max(20, (t.tEnd - t.tStart) * pxPerSec), background: 'var(--color-cat-text)' }}>
                    <span onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'text', id: t.id }); startDrag(e, { kind: 'ttrim', id: t.id, edge: 'l', ox: e.clientX, os: t.tStart, oe: t.tEnd }); }} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/20" />
                    <span className="truncate pl-1.5">{t.text}</span>
                    <span onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'text', id: t.id }); startDrag(e, { kind: 'ttrim', id: t.id, edge: 'r', ox: e.clientX, os: t.tStart, oe: t.tEnd }); }} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/20" />
                  </div>
                ))}
              </div>

              {/* VIDEO track */}
              <TrackLabel>Video</TrackLabel>
              <div className="relative h-16 border-b border-black/[0.06]" style={{ width: laneWidth }}>
                {segs.map(({ clip: c, offset, dur }) => (
                  <div key={c.id} onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'clip', id: c.id }); startDrag(e, { kind: 'cmove', id: c.id }); }}
                    className={`absolute top-1.5 h-[52px] cursor-grab overflow-hidden rounded border ${sel?.id === c.id ? 'border-white ring-2 ring-[var(--color-cat-video)]' : 'border-black/20'}`}
                    style={{ left: offset * pxPerSec, width: Math.max(28, dur * pxPerSec), background: c.thumb ? `center/cover url(${c.thumb})` : 'var(--color-cat-video)' }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute bottom-0.5 left-1 right-2 truncate text-[10px] font-semibold text-white">{c.name}</span>
                    {c.speed !== 1 && <span className="absolute right-1 top-0.5 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{c.speed}×</span>}
                    <span onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'clip', id: c.id }); startDrag(e, { kind: 'ctrim', id: c.id, edge: 'l', ox: e.clientX, os: c.start, oe: c.end }); }} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" />
                    <span onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'clip', id: c.id }); startDrag(e, { kind: 'ctrim', id: c.id, edge: 'r', ox: e.clientX, os: c.start, oe: c.end }); }} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" />
                  </div>
                ))}
              </div>

              {/* MUSIC track */}
              <TrackLabel>Music</TrackLabel>
              <div className="relative h-8" style={{ width: laneWidth }}>
                {music && total > 0 && (
                  <div className="absolute left-0 top-1 flex h-6 items-center gap-1 overflow-hidden rounded px-2 text-[10px] font-semibold text-white" style={{ width: total * pxPerSec, background: 'var(--color-cat-audio)' }}>
                    <Music className="h-3 w-3" /> <span className="truncate">{music.name}</span>
                  </div>
                )}
              </div>

              {/* playhead */}
              <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-[var(--color-cat-video)]" style={{ left: playhead * pxPerSec }}>
                <div className="absolute -left-1.5 -top-0 h-3 w-3 rounded-b-sm bg-[var(--color-cat-video)]" />
              </div>
            </div>
          </div>

          {/* inspector */}
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            {selClip ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]"><Sliders className="h-3.5 w-3.5" /> Clip · <span className="truncate normal-case tracking-normal text-[var(--color-fg)]">{selClip.name}</span></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
                  <label className="flex items-center gap-1.5">In<input type="range" min={0} max={selClip.duration} step={0.05} value={selClip.start} onChange={(e) => patchClip(selClip.id, { start: Math.min(+e.target.value, selClip.end - 0.1) })} className="flex-1" /><span className="w-10 font-mono">{selClip.start.toFixed(1)}</span></label>
                  <label className="flex items-center gap-1.5">Out<input type="range" min={0} max={selClip.duration} step={0.05} value={selClip.end} onChange={(e) => patchClip(selClip.id, { end: Math.max(+e.target.value, selClip.start + 0.1) })} className="flex-1" /><span className="w-10 font-mono">{selClip.end.toFixed(1)}</span></label>
                  <label className="flex items-center gap-1.5">Speed<select value={selClip.speed} onChange={(e) => patchClip(selClip.id, { speed: +e.target.value })} className="border border-black/[0.12] bg-transparent px-1.5 py-0.5">{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
                  <label className="flex items-center gap-1.5">Vol<input type="range" min={0} max={2} step={0.05} value={selClip.volume ?? 1} onChange={(e) => patchClip(selClip.id, { volume: +e.target.value })} className="flex-1" /><span className="w-10 font-mono">{Math.round((selClip.volume ?? 1) * 100)}%</span></label>
                  <label className="flex items-center gap-1.5">Bright<input type="range" min={0} max={200} value={selClip.brightness ?? 100} onChange={(e) => patchClip(selClip.id, { brightness: +e.target.value })} className="flex-1" /></label>
                  <label className="flex items-center gap-1.5">Contrast<input type="range" min={0} max={200} value={selClip.contrast ?? 100} onChange={(e) => patchClip(selClip.id, { contrast: +e.target.value })} className="flex-1" /></label>
                  <label className="flex items-center gap-1.5">Sat<input type="range" min={0} max={300} value={selClip.saturation ?? 100} onChange={(e) => patchClip(selClip.id, { saturation: +e.target.value })} className="flex-1" /></label>
                </div>
              </div>
            ) : selText ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]"><TypeIcon className="h-3.5 w-3.5" /> Text</div>
                <input value={selText.text} onChange={(e) => patchText(selText.id, { text: e.target.value })} className="w-full border border-black/[0.1] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1">{(['top', 'center', 'bottom'] as const).map((p) => <button key={p} type="button" onClick={() => patchText(selText.id, { pos: p })} className={`border px-2 py-1 capitalize ${selText.pos === p ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)]/10' : 'border-black/[0.1] text-[var(--color-fg-muted)]'}`}>{p}</button>)}</div>
                  <div className="flex items-center gap-1.5">{TEXT_COLORS.map((col) => <button key={col} type="button" onClick={() => patchText(selText.id, { color: col })} className={`h-6 w-6 rounded-full border-2 ${selText.color === col ? 'border-[var(--color-fg)]' : 'border-black/15'}`} style={{ background: col }} />)}</div>
                  <span className="font-mono text-[var(--color-fg-subtle)]">{selText.tStart.toFixed(1)}s → {selText.tEnd.toFixed(1)}s</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-fg-muted)]">
                <span>Select a clip or text block to edit it. Drag blocks to reorder, drag their edges to trim.</span>
                {music && <label className="ml-auto flex items-center gap-2">Music vol<input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(+e.target.value)} /><button type="button" onClick={() => setMusic(null)} className="text-[var(--color-fg-subtle)] hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></label>}
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={mute} onChange={(e) => { setMute(e.target.checked); if (videoRef.current) videoRef.current.muted = e.target.checked; }} /> Mute clip audio</label>
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {result && (
        <div className="space-y-2 border border-[var(--color-cat-video)]/40 bg-[var(--color-cat-video)]/5 p-4">
          <video src={result.url} controls className="max-h-80 w-full bg-black" />
          <a href={result.url} download={result.name} className="flex w-fit items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"><Download className="h-3.5 w-3.5" /> Download video</a>
        </div>
      )}
    </div>
  );
}

function TrackLabel({ children }: { children: React.ReactNode }) {
  return <div className="sticky left-0 z-10 bg-[var(--color-surface-2)]/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">{children}</div>;
}

function Ruler({ total, pxPerSec }: { total: number; pxPerSec: number }) {
  const step = pxPerSec < 50 ? 5 : pxPerSec < 110 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= Math.max(total, 4); t += step) ticks.push(t);
  return (
    <div className="relative h-5 border-b border-black/[0.08] bg-[var(--color-surface-2)]/50">
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full border-l border-black/[0.12] pl-1 text-[9px] font-mono text-[var(--color-fg-subtle)]" style={{ left: t * pxPerSec }}>{fmtT(t).replace(/\.00$/, '')}</div>
      ))}
    </div>
  );
}
