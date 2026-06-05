'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Video, VideoOff, Mic, MicOff, Phone, Copy, Check, Loader2, ShieldCheck,
  Send, MessageSquare, Square, Sparkles, MonitorPlay, Hand, Captions, PencilLine,
  Users, Layout, FileText, Pin, MoreHorizontal, X, Wand2, Smile,
} from 'lucide-react';
import { joinMesh, type Mesh, type MeshPeerInfo } from '@/lib/p2p/mesh';
import type { MediaState } from '@/lib/p2p/media';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { encodeWire, decodeWire, isWire } from '@/lib/appstudio/protocol';
import { ReactionLayer, ReactionPicker, useReactionFloaters } from '@/lib/appstudio/reactions';
import { Whiteboard, type Stroke } from '@/lib/appstudio/whiteboard';
import { summarizeConversation } from '@/lib/appstudio/ai-summary';
import { startCaptions, type CaptionsSession } from '@/lib/appstudio/captions-asr';
import { checkLever, freeCap } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { useSessionCap } from '@/lib/limits/use-session-cap';
import { FreeCapHint } from '@/components/limits/ProBadge';

const POLICY_KEY = 'call';

type Panel = 'chat' | 'people' | 'board' | 'captions' | 'summary' | null;
type Layout = 'grid' | 'spotlight' | 'theater';

interface RemoteFlags { handUp: boolean; recording: boolean }

function drawContain(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  if (!v.videoWidth) return;
  const vr = v.videoWidth / v.videoHeight;
  let dw = w, dh = h;
  if (vr > w / h) dh = w / vr; else dw = h * vr;
  ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

interface ChatLine { mine: boolean; text: string; name: string; ts: number }
interface CaptionLine { text: string; name: string; ts: number; final: boolean }
interface ChapterMark { ts: number; label: string }

export default function CallStudio() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const [room] = React.useState(() => joinCode || Math.random().toString(36).slice(2, 10));
  const audioOnly = params.get('audio') === '1';

  const [state, setState] = React.useState<MediaState>('connecting');
  const [started, setStarted] = React.useState(false);
  const [camOn, setCamOn] = React.useState(!audioOnly);
  const [micOn, setMicOn] = React.useState(true);
  const [screenOn, setScreenOn] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [bg, setBg] = React.useState<'off' | 'blur' | 'image'>('off');
  const [bgBusy, setBgBusy] = React.useState(false);
  const [name, setName] = React.useState('');
  const [layout, setLayout] = React.useState<Layout>('spotlight');
  const [panel, setPanel] = React.useState<Panel>('chat');
  const [chat, setChat] = React.useState<ChatLine[]>([]);
  const [msg, setMsg] = React.useState('');
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [handUp, setHandUp] = React.useState(false);
  const [strokes, setStrokes] = React.useState<Stroke[]>([]);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [chapters, setChapters] = React.useState<ChapterMark[]>([]);
  const [captionsOn, setCaptionsOn] = React.useState(false);
  const [captions, setCaptions] = React.useState<CaptionLine[]>([]);
  const [summary, setSummary] = React.useState<string>('');
  const [summarizing, setSummarizing] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const startedAtRef = React.useRef(0);
  const [remotes, setRemotes] = React.useState<MeshPeerInfo[]>([]);
  const [remoteFlags, setRemoteFlags] = React.useState<Map<string, RemoteFlags>>(new Map());
  const [spotlightId, setSpotlightId] = React.useState<string | null>(null);

  const localRef = React.useRef<HTMLVideoElement>(null);
  const rawVideoRef = React.useRef<HTMLVideoElement>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recRafRef = React.useRef(0);
  const recCtxRef = React.useRef<AudioContext | null>(null);
  const vbgRef = React.useRef<import('@/lib/p2p/virtual-bg').VirtualBg | null>(null);
  const bgImgRef = React.useRef<HTMLImageElement | null>(null);
  const bgFileRef = React.useRef<HTMLInputElement>(null);
  const camStreamRef = React.useRef<MediaStream | null>(null);
  const screenStreamRef = React.useRef<MediaStream | null>(null);
  const meshRef = React.useRef<Mesh | null>(null);
  const wmStopRef = React.useRef<(() => void) | null>(null);
  const selfIdRef = React.useRef<string>('');
  const tileVideoRefs = React.useRef<Map<string, HTMLVideoElement>>(new Map());
  const captionsRef = React.useRef<CaptionsSession | null>(null);
  const [captionsBusy, setCaptionsBusy] = React.useState(false);
  const [captionsErr, setCaptionsErr] = React.useState<string>('');
  const nameRef = React.useRef('');
  nameRef.current = name || (role === 's' ? 'Host' : 'Guest');
  const { guard, gate } = useUsageGate('call');
  const { floaters, push: pushReaction } = useReactionFloaters();
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const recDeadlineRef = React.useRef<number | null>(null);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/call?r=${room}${audioOnly ? '&audio=1' : ''}` : '';

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  React.useEffect(() => {
    if (!captionsOn) {
      captionsRef.current?.stop();
      captionsRef.current = null;
      return;
    }
    const stream = camStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) return;
    let cancelled = false;
    setCaptionsBusy(true);
    setCaptionsErr('');
    (async () => {
      try {
        const sess = await startCaptions(stream, {
          onFinal: (text) => {
            const ts = Date.now();
            setCaptions((c) => [...c, { text, name: nameRef.current, ts, final: true }]);
            meshRef.current?.send(encodeWire({ t: 'caption', text, name: nameRef.current, final: true }));
          },
          onError: (e) => setCaptionsErr(e.message),
        });
        if (cancelled) sess.stop();
        else captionsRef.current = sess;
      } catch (e) {
        setCaptionsErr((e as Error).message);
      } finally {
        if (!cancelled) setCaptionsBusy(false);
      }
    })();
    return () => { cancelled = true; captionsRef.current?.stop(); captionsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsOn, started]);

  React.useEffect(() => () => {
    try { wmStopRef.current?.(); } catch { /* */ }
    meshRef.current?.close();
    try { captionsRef.current?.stop(); } catch { /* */ }
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { recorderRef.current?.stop(); } catch { /* */ }
    cancelAnimationFrame(recRafRef.current);
    try { recCtxRef.current?.close(); } catch { /* */ }
    try { vbgRef.current?.stop(); } catch { /* */ }
  }, []);

  // Local 1s ticker for the UI elapsed counter. NOT used for cap enforcement —
  // that lives in the server-attested useSessionCap below.
  React.useEffect(() => {
    if (!started || state !== 'connected') return;
    startedAtRef.current ||= Date.now();
    const id = window.setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [started, state]);

  // Server-attested cross-tab session cap. Free users share ONE budget across
  // every tab + every reload + every cookie clear (composite identity).
  useSessionCap(POLICY_KEY, {
    active: started && state === 'connected',
    onExpired: () => {
      const cap = freeCap(POLICY_KEY, 'session-minutes');
      const hit = checkLever(POLICY_KEY, 'session-minutes', cap + 0.01, false);
      if (hit) policyGate.fire(hit);
      hangup();
    },
  });

  React.useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [chat, captions]);

  const setFlag = (peerId: string, key: keyof RemoteFlags, val: boolean) => {
    setRemoteFlags((prev) => {
      const next = new Map(prev);
      const cur = next.get(peerId) ?? { handUp: false, recording: false };
      next.set(peerId, { ...cur, [key]: val });
      return next;
    });
  };

  const handleIncoming = (fromId: string, fromName: string, text: string) => {
    if (text === 'rec:1' || text === 'rec:0') { setFlag(fromId, 'recording', text === 'rec:1'); return; }
    if (isWire(text)) {
      const m = decodeWire(text);
      if (!m) return;
      // Cap peer-controlled strings before pushing to React state — a hostile
      // peer can otherwise freeze the receiver with a 10MB string, or OOM
      // the tab with millions of wb strokes / captions / chat lines.
      if (m.t === 'chat') {
        const safeText = typeof m.text === 'string' ? (m.text.length > 10_000 ? m.text.slice(0, 10_000) + '…' : m.text) : '';
        const safeName = typeof m.name === 'string' ? m.name.slice(0, 64) : '';
        setChat((c) => [...c, { mine: false, text: safeText, name: safeName || fromName, ts: m.ts || Date.now() }].slice(-500));
      }
      else if (m.t === 'rxn') pushReaction(typeof m.emoji === 'string' ? m.emoji.slice(0, 16) : '');
      else if (m.t === 'hand') setFlag(fromId, 'handUp', m.up);
      else if (m.t === 'wb') setStrokes((s) => s.length >= 50_000 ? s : [...s, m.stroke]);
      else if (m.t === 'wb-clear') setStrokes([]);
      else if (m.t === 'caption') {
        const safeText = typeof m.text === 'string' ? (m.text.length > 2_000 ? m.text.slice(0, 2_000) + '…' : m.text) : '';
        const safeName = typeof m.name === 'string' ? m.name.slice(0, 64) : '';
        setCaptions((c) => [...c, { text: safeText, name: safeName || fromName, ts: Date.now(), final: !!m.final }].slice(-200));
      }
      else if (m.t === 'rec') setFlag(fromId, 'recording', m.on);
      return;
    }
    // Plain-text (non-wire) fallback chat — same caps so a peer can't slip
    // a 10MB string past by skipping the wire framing.
    const safeText = text.length > 10_000 ? text.slice(0, 10_000) + '…' : text;
    setChat((c) => [...c, { mine: false, text: safeText, name: fromName, ts: Date.now() }].slice(-500));
  };

  const start = async () => {
    if (role === 's' && !(await guard())) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: !audioOnly, audio: true });
      camStreamRef.current = stream;
      if (localRef.current) { localRef.current.srcObject = stream; localRef.current.muted = true; void localRef.current.play().catch(() => {}); }
      setStarted(true);
      const { isWatermarkOn } = await import('@/lib/watermark/config');
      const { watermarkVideoStream } = await import('@/lib/watermark/stream-overlay');
      const wrapped = await watermarkVideoStream(stream, await isWatermarkOn());
      wmStopRef.current = wrapped.stop;
      meshRef.current = joinMesh(room, nameRef.current, wrapped.stream, {
        onSelfId: (id) => { selfIdRef.current = id; },
        onRoster: (list) => {
          const cap = freeCap(POLICY_KEY, 'participants');
          const allowedCount = isPro ? list.length : Math.max(0, cap - 1);
          const trimmed = isPro ? list : list.slice(0, allowedCount);
          if (!isPro && list.length > allowedCount) {
            const hit = checkLever(POLICY_KEY, 'participants', list.length + 1, false);
            if (hit) policyGate.fire(hit);
          }
          setRemotes(trimmed);
          if (trimmed.some((p) => p.state === 'connected')) setState('connected');
          else if (trimmed.length > 0) setState('connecting');
          if (!spotlightId && trimmed.length > 0) setSpotlightId(trimmed[0].id);
        },
        onPeerStream: (peerId) => {
          if (!spotlightId) setSpotlightId(peerId);
        },
        onPeerLeft: (peerId) => {
          if (spotlightId === peerId) setSpotlightId(null);
          setRemoteFlags((prev) => { const n = new Map(prev); n.delete(peerId); return n; });
        },
        onMessage: handleIncoming,
      });
    } catch { /* permission denied */ }
  };

  const sendChat = (text: string) => {
    const v = text.trim();
    if (!v || state !== 'connected') return;
    const ts = Date.now();
    meshRef.current?.send(encodeWire({ t: 'chat', text: v, name: nameRef.current, ts }));
    setChat((c) => [...c, { mine: true, text: v, name: nameRef.current, ts }]);
    setMsg('');
    setShowEmoji(false);
  };

  const sendReaction = (emoji: string) => {
    if (state !== 'connected') return;
    pushReaction(emoji);
    meshRef.current?.send(encodeWire({ t: 'rxn', emoji, name: nameRef.current }));
  };

  const toggleHand = () => {
    const next = !handUp;
    setHandUp(next);
    meshRef.current?.send(encodeWire({ t: 'hand', up: next, name: nameRef.current }));
  };

  const addStroke = (s: Stroke) => {
    setStrokes((arr) => [...arr, s]);
    meshRef.current?.send(encodeWire({ t: 'wb', stroke: s }));
  };
  const clearBoard = () => {
    setStrokes([]);
    meshRef.current?.send(encodeWire({ t: 'wb-clear' }));
  };

  const addChapter = (label: string) => {
    setChapters((c) => [...c, { ts: Date.now() - startedAtRef.current, label: label || 'Chapter' }]);
  };

  const startRec = () => {
    try {
      const ctx = new AudioContext(); recCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      const addAudio = (s: MediaStream | null) => {
        const at = s?.getAudioTracks() ?? [];
        if (at.length) { try { ctx.createMediaStreamSource(new MediaStream(at)).connect(dest); } catch { /* */ } }
      };
      addAudio(camStreamRef.current);
      for (const r of remotes) addAudio(r.stream ?? null);

      let tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()];
      if (!audioOnly) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280; canvas.height = 720;
        const cctx = canvas.getContext('2d')!;
        const els = remotes.map((r) => ({ peer: r, el: tileVideoRefs.current.get(r.id) })).filter((x): x is { peer: MeshPeerInfo; el: HTMLVideoElement } => !!x.el);
        const draw = () => {
          cctx.fillStyle = '#000'; cctx.fillRect(0, 0, canvas.width, canvas.height);
          if (els.length === 0 && localRef.current?.videoWidth) {
            drawContain(cctx, localRef.current, 0, 0, canvas.width, canvas.height);
          } else if (els.length === 1) {
            drawContain(cctx, els[0].el, 0, 0, canvas.width, canvas.height);
            if (localRef.current?.videoWidth) {
              const w = canvas.width * 0.24, h = w * (localRef.current.videoHeight / localRef.current.videoWidth);
              cctx.drawImage(localRef.current, canvas.width - w - 24, canvas.height - h - 24, w, h);
            }
          } else {
            const cols = Math.ceil(Math.sqrt(els.length + 1));
            const rows = Math.ceil((els.length + 1) / cols);
            const cw = canvas.width / cols, ch = canvas.height / rows;
            els.forEach((x, i) => { const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch; drawContain(cctx, x.el, cx, cy, cw, ch); });
            if (localRef.current?.videoWidth) { const i = els.length; const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch; drawContain(cctx, localRef.current, cx, cy, cw, ch); }
          }
          recRafRef.current = requestAnimationFrame(draw);
        };
        draw();
        tracks = [...canvas.captureStream(30).getVideoTracks(), ...tracks];
      }

      const mime = !audioOnly && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
        : !audioOnly && MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        cancelAnimationFrame(recRafRef.current);
        try { recCtxRef.current?.close(); } catch { /* */ } recCtxRef.current = null;
        const blob = new Blob(chunks, { type: audioOnly ? 'audio/webm' : 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${audioOnly ? 'voice' : 'call'}-${Date.now()}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        // 60s defer — 5s was too short on slow mobile networks where the
        // download dialog opens after a few seconds; the browser then aborts
        // the save because the blob URL is already gone.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        if (chapters.length) {
          const text = chapters.map((c) => `${(c.ts / 1000).toFixed(0)}s · ${c.label}`).join('\n');
          const cb = new Blob([text], { type: 'text/plain' });
          const cu = URL.createObjectURL(cb);
          const ca = document.createElement('a'); ca.href = cu; ca.download = `call-${Date.now()}-chapters.txt`;
          document.body.appendChild(ca); ca.click(); ca.remove();
          setTimeout(() => URL.revokeObjectURL(cu), 60_000);
        }
      };
      // Mid-recording error path: codec drop, OOM, background throttle. Without
      // a handler, a long call recording would silently truncate to whatever
      // was buffered, with no indication to the user that something went wrong.
      rec.onerror = () => {
        cancelAnimationFrame(recRafRef.current);
        try { recCtxRef.current?.close(); } catch { /* */ } recCtxRef.current = null;
        setRecording(false);
        recDeadlineRef.current = null;
      };
      recorderRef.current = rec; rec.start(); setRecording(true);
      meshRef.current?.send(encodeWire({ t: 'rec', on: true }));
      if (!isPro) {
        const cap = freeCap(POLICY_KEY, 'recording-minutes');
        if (Number.isFinite(cap)) {
          recDeadlineRef.current = Date.now() + cap * 60_000;
          window.setTimeout(() => {
            if (recDeadlineRef.current && Date.now() >= recDeadlineRef.current) {
              const hit = checkLever(POLICY_KEY, 'recording-minutes', cap + 0.01, false);
              if (hit) policyGate.fire(hit);
              stopRec();
            }
          }, cap * 60_000 + 200);
        }
      }
    } catch { /* recording unsupported */ }
  };
  const stopRec = () => { try { recorderRef.current?.stop(); } catch { /* */ } setRecording(false); recDeadlineRef.current = null; meshRef.current?.send(encodeWire({ t: 'rec', on: false })); };
  const toggleRec = () => (recording ? stopRec() : startRec());

  const toggleScreen = async () => {
    if (audioOnly) return;
    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camTrack = camStreamRef.current?.getVideoTracks()[0] ?? null;
      meshRef.current?.replaceVideoTrack(camTrack);
      if (localRef.current && camStreamRef.current) {
        localRef.current.srcObject = camStreamRef.current;
        void localRef.current.play().catch(() => {});
      }
      setScreenOn(false);
      return;
    }
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      screenStreamRef.current = ds;
      const vt = ds.getVideoTracks()[0] ?? null;
      vt?.addEventListener('ended', () => { void toggleScreen(); });
      meshRef.current?.replaceVideoTrack(vt);
      if (localRef.current) { localRef.current.srcObject = ds; void localRef.current.play().catch(() => {}); }
      setScreenOn(true);
    } catch { /* cancelled */ }
  };

  const applyBg = async (next: 'off' | 'blur' | 'image') => {
    if (audioOnly || !camStreamRef.current) return;
    const rawTrack = camStreamRef.current.getVideoTracks()[0] ?? null;
    if (next === 'off') {
      setBg('off');
      vbgRef.current?.stop(); vbgRef.current = null;
      meshRef.current?.replaceVideoTrack(rawTrack);
      if (localRef.current) { localRef.current.srcObject = camStreamRef.current; void localRef.current.play().catch(() => {}); }
      return;
    }
    setBgBusy(true);
    try {
      if (rawVideoRef.current && rawVideoRef.current.srcObject !== camStreamRef.current) {
        rawVideoRef.current.srcObject = camStreamRef.current;
        await rawVideoRef.current.play().catch(() => {});
      }
      if (!vbgRef.current) {
        const { createVirtualBackground } = await import('@/lib/p2p/virtual-bg');
        vbgRef.current = await createVirtualBackground(rawVideoRef.current!, next === 'image' ? 'image' : 'blur');
        if (bgImgRef.current) vbgRef.current.setImage(bgImgRef.current);
        const vt = vbgRef.current.stream.getVideoTracks()[0] ?? null;
        meshRef.current?.replaceVideoTrack(vt);
        if (localRef.current) { localRef.current.srcObject = vbgRef.current.stream; void localRef.current.play().catch(() => {}); }
      } else {
        vbgRef.current.setMode(next === 'image' ? 'image' : 'blur');
      }
      setBg(next);
    } catch { setBg('off'); }
    finally { setBgBusy(false); }
  };

  const pickBgImage = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      bgImgRef.current = img; vbgRef.current?.setImage(img); void applyBg('image');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); };
    img.src = url;
  };

  const toggleCam = () => { const t = camStreamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); } };
  const toggleMic = () => { const t = camStreamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); } };
  const hangup = () => {
    // Stop EVERY long-lived resource. Previously this only stopped the mesh
    // and the camera/screen streams — if the user had recording on, captions
    // on, virtual background on, or the watermark overlay running, those
    // kept executing in the background AFTER hang-up because the summary
    // path stays on the page (no navigation = no unmount cleanup).
    meshRef.current?.close();
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { recorderRef.current?.stop(); } catch { /* may already be inactive */ }
    setRecording(false);
    cancelAnimationFrame(recRafRef.current);
    try { recCtxRef.current?.close(); } catch { /* */ } recCtxRef.current = null;
    try { captionsRef.current?.stop(); } catch { /* */ } captionsRef.current = null;
    try { vbgRef.current?.stop(); } catch { /* */ }
    try { wmStopRef.current?.(); } catch { /* */ } wmStopRef.current = null;
    setState('closed');
    if (chat.length >= 2) { void runSummary(); }
    else { window.location.href = '/call'; }
  };
  const copy = () => {
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const runSummary = async () => {
    setSummarizing(true);
    setPanel('summary');
    try {
      const lines = chat.map((c) => ({ name: c.mine ? 'You' : c.name, text: c.text }));
      setSummary(await summarizeConversation(lines));
    } catch (e) {
      setSummary(`Couldn't summarize (${(e as Error).message}). On-device AI needs a WebGPU browser.`);
    } finally {
      setSummarizing(false);
    }
  };

  const elapsedLabel = (() => {
    const s = Math.floor(elapsed / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  })();

  return (
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-[1500px] flex-col gap-3 p-3 sm:p-4">
      {gate}
      {policyGate.element}

      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.08] pb-3">
        <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-video)] text-white">
          {audioOnly ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold tracking-tight">Call Studio</h1>
          <p className="truncate text-[11px] text-[var(--color-fg-muted)]">
            {audioOnly ? 'Voice call' : 'Video call'} · End-to-end encrypted · {state === 'connected' ? `Connected · ${elapsedLabel}` : state === 'connecting' ? 'Connecting…' : state === 'failed' ? 'Connection failed' : 'Idle'}
            {' '}<FreeCapHint toolKey={POLICY_KEY} lever="participants" isPro={isPro} />
          </p>
        </div>
        {started && state === 'connected' && (
          <div className="hidden items-center gap-1 sm:flex">
            <button type="button" onClick={() => setLayout('grid')} className={`grid h-8 w-8 place-items-center text-xs ${layout === 'grid' ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`} title="Grid">
              <Layout className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setLayout('spotlight')} className={`grid h-8 w-8 place-items-center text-xs ${layout === 'spotlight' ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`} title="Spotlight (active speaker)">
              <span className="text-[10px] font-bold">★</span>
            </button>
            <button type="button" onClick={() => setLayout('theater')} className={`grid h-8 w-8 place-items-center text-xs ${layout === 'theater' ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`} title="Theater (presenter only)">
              <MonitorPlay className="h-4 w-4" />
            </button>
          </div>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-28 border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-right text-[12px] focus:outline-none" />
      </header>

      {!started ? (
        <PreCallSetup
          role={role}
          audioOnly={audioOnly}
          link={link}
          qr={qr}
          copied={copied}
          onStart={start}
          onCopy={copy}
        />
      ) : (
        <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[1fr_320px]">
          <div className={`relative overflow-hidden border border-black/[0.08] ${audioOnly ? 'bg-gradient-to-b from-[#1a1f2e] to-black' : 'bg-black'}`}>
            {!audioOnly && (
              <VideoStage
                layout={layout}
                remotes={remotes}
                flags={remoteFlags}
                spotlightId={spotlightId}
                onPickSpotlight={(id) => { setSpotlightId(id); setLayout('spotlight'); }}
                localRef={localRef}
                myName={nameRef.current}
                myHand={handUp}
                tileRefs={tileVideoRefs}
              />
            )}
            {audioOnly && (
              <AudioStage remotes={remotes} flags={remoteFlags} myHand={handUp} myName={nameRef.current} />
            )}
            {state !== 'connected' && remotes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/70">
                <Loader2 className="h-8 w-8 animate-spin" />
                <div className="max-w-sm text-[13px]">
                  {state === 'failed' ? "Couldn't connect — try Incognito or another browser. VPNs or ad-blockers can block WebRTC."
                   : role === 's' ? 'Share the link — waiting for people to join…' : 'Connecting…'}
                </div>
              </div>
            )}
            {!audioOnly && <video ref={rawVideoRef} className="pointer-events-none absolute h-px w-px opacity-0" playsInline muted />}

            <ReactionLayer floaters={floaters} />

            {recording && (
              <div className="absolute left-3 top-3 flex items-center gap-1.5 bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC
              </div>
            )}

            {captionsOn && captions.length > 0 && (
              <div className="pointer-events-none absolute inset-x-6 bottom-24 flex flex-col items-center gap-1 text-center">
                {captions.slice(-2).map((c, i) => (
                  <span key={i} className="max-w-2xl rounded bg-black/70 px-3 py-1.5 text-[14px] text-white shadow-lg backdrop-blur">
                    {c.name}: {c.text}
                  </span>
                ))}
              </div>
            )}

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
              <button type="button" onClick={toggleMic} className={`grid h-11 w-11 place-items-center text-white ${micOn ? 'bg-black/55' : 'bg-red-600'}`} title="Mic">
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              {!audioOnly && (
                <button type="button" onClick={toggleCam} className={`grid h-11 w-11 place-items-center text-white ${camOn ? 'bg-black/55' : 'bg-red-600'}`} title="Camera">
                  {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              )}
              {!audioOnly && (
                <button type="button" onClick={toggleScreen} className={`grid h-11 w-11 place-items-center text-white ${screenOn ? 'bg-cyan-600' : 'bg-black/55'}`} title="Share screen">
                  <MonitorPlay className="h-5 w-5" />
                </button>
              )}
              <button type="button" onClick={toggleHand} className={`grid h-11 w-11 place-items-center text-white ${handUp ? 'bg-yellow-500 text-black' : 'bg-black/55'}`} title="Raise hand">
                <Hand className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setShowEmoji((s) => !s)} className="grid h-11 w-11 place-items-center bg-black/55 text-white" title="Reactions">
                <Smile className="h-5 w-5" />
              </button>
              <button type="button" onClick={toggleRec} className={`grid h-11 w-11 place-items-center text-white ${recording ? 'bg-red-600' : 'bg-black/55'}`} title={recording ? 'Stop recording' : 'Record'}>
                {recording ? <Square className="h-4 w-4" /> : <span className="h-3 w-3 rounded-full bg-red-500" />}
              </button>
              {recording && (
                <button type="button" onClick={() => addChapter(prompt('Chapter name?') || 'Chapter')} className="grid h-11 px-3 place-items-center bg-black/55 text-white text-[11px] font-semibold" title="Mark chapter">
                  <Pin className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={hangup} className="grid h-11 w-11 place-items-center bg-red-600 text-white" title="Hang up">
                <Phone className="h-5 w-5 rotate-[135deg]" />
              </button>
            </div>

            {showEmoji && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded bg-black/85 p-2 shadow-2xl backdrop-blur">
                <ReactionPicker onPick={(e) => { sendReaction(e); setShowEmoji(false); }} />
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {([
                ['chat', MessageSquare, 'Chat'],
                ['people', Users, 'People'],
                ['board', PencilLine, 'Board'],
                ['captions', Captions, 'Captions'],
                ['summary', FileText, 'Summary'],
              ] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPanel(panel === id ? null : id)}
                  className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-semibold transition ${panel === id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] bg-[var(--color-surface-1)] text-[var(--color-fg)]'}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {panel === 'chat' && (
              <ChatPanel
                chat={chat}
                msg={msg}
                setMsg={setMsg}
                state={state}
                onSend={() => sendChat(msg)}
                onReact={sendReaction}
                chatEndRef={chatEndRef}
              />
            )}

            {panel === 'people' && (
              <PeoplePanel role={role} state={state} link={link} qr={qr} copied={copied} onCopy={copy} handUp={handUp} remotes={remotes} flags={remoteFlags} myName={nameRef.current} />
            )}

            {panel === 'board' && (
              <div className="flex-1 overflow-y-auto border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
                <Whiteboard strokes={strokes} onAddStroke={addStroke} onClear={clearBoard} height={420} />
              </div>
            )}

            {panel === 'captions' && (
              <CaptionsPanel
                on={captionsOn}
                busy={captionsBusy}
                err={captionsErr}
                onToggle={() => setCaptionsOn((v) => !v)}
                lines={captions}
                onClear={() => setCaptions([])}
              />
            )}

            {panel === 'summary' && (
              <SummaryPanel summary={summary} busy={summarizing} onRun={runSummary} chapters={chapters} />
            )}

            {!audioOnly && panel === 'chat' && (
              <BgPanel bg={bg} bgBusy={bgBusy} onPick={applyBg} fileRef={bgFileRef} onImage={pickBgImage} />
            )}

            <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-2 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
              <span>P2P encrypted — audio, video, chat, whiteboard, and reactions never pass through our servers.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function PreCallSetup({ role, audioOnly, link, qr, copied, onStart, onCopy }: {
  role: 's' | 'r'; audioOnly: boolean; link: string; qr: string; copied: boolean; onStart: () => void; onCopy: () => void;
}) {
  return (
    <div className="grid place-items-center flex-1">
      <div className="w-full max-w-lg border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center">
        {audioOnly ? <Phone className="mx-auto h-12 w-12 text-[var(--color-cat-video)]" /> : <Video className="mx-auto h-12 w-12 text-[var(--color-cat-video)]" />}
        <h2 className="mt-3 text-[20px] font-bold tracking-tight">{role === 's' ? `Start a ${audioOnly ? 'voice ' : ''}call` : 'Join the call'}</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-[var(--color-fg-muted)]">
          {role === 's'
            ? 'Start the call, then share the link that appears. Layouts, screen share, whiteboard, captions, reactions, and AI summary are all on-device.'
            : 'You were invited to a call. Tap join and the connection forms peer-to-peer.'}
        </p>
        <button type="button" onClick={onStart} className="mx-auto mt-5 flex items-center gap-2 bg-[var(--color-cat-video)] px-6 py-3 text-[14px] font-semibold text-white transition hover:brightness-110">
          {audioOnly ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />} {role === 's' ? `Start ${audioOnly ? 'voice ' : ''}call` : 'Join'}
        </button>
        {role === 's' && (
          <div className="mt-6 border-t border-black/[0.06] pt-5">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invite link (also after you start)</div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" className="mx-auto mb-3 h-32 w-32 border border-black/[0.06] bg-white p-1" />
            )}
            <button type="button" onClick={onCopy} className="mx-auto flex items-center gap-2 bg-black/[0.05] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition hover:bg-black/[0.1]">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel({ chat, msg, setMsg, state, onSend, onReact, chatEndRef }: {
  chat: ChatLine[]; msg: string; setMsg: (s: string) => void; state: MediaState; onSend: () => void; onReact: (e: string) => void; chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex min-h-[280px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
      <div className="max-h-72 flex-1 space-y-1.5 overflow-y-auto p-3">
        {chat.length === 0 && (
          <p className="text-[12px] text-[var(--color-fg-subtle)]">{state === 'connected' ? 'Say hi — chat, react, or raise your hand.' : 'Chat opens once you are connected.'}</p>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : ''}`}>
            <span className={`max-w-[85%] break-words px-2.5 py-1.5 text-[13px] leading-snug ${m.mine ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`}>{m.text}</span>
            <span className="mt-0.5 px-1 text-[9px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div className="border-t border-black/[0.06] px-2 py-1.5">
        <ReactionPicker compact onPick={onReact} />
      </div>
      <div className="flex items-center gap-2 border-t border-black/[0.06] p-2">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }} disabled={state !== 'connected'} placeholder={state === 'connected' ? 'Message…' : 'Connecting…'} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] focus:outline-none disabled:opacity-50" />
        <button type="button" onClick={onSend} disabled={!msg.trim() || state !== 'connected'} className="grid h-8 w-8 shrink-0 place-items-center bg-[var(--color-cat-video)] text-white transition hover:brightness-110 disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function PeoplePanel({ role, state, link, qr, copied, onCopy, handUp, remotes, flags, myName }: {
  role: 's' | 'r'; state: MediaState; link: string; qr: string; copied: boolean; onCopy: () => void; handUp: boolean; remotes: MeshPeerInfo[]; flags: Map<string, RemoteFlags>; myName: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        In the call · {remotes.length + 1}
      </div>
      <div className="flex items-center justify-between rounded bg-black/[0.04] px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-cat-video)] text-[11px] font-bold text-white">{myName.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="text-[12px] font-semibold">{myName} <span className="text-[10px] font-normal text-[var(--color-fg-subtle)]">(you{role === 's' ? ' · host' : ''})</span></div>
          </div>
        </div>
        {handUp && <Hand className="h-3.5 w-3.5 text-yellow-500" />}
      </div>
      {remotes.map((r) => {
        const f = flags.get(r.id);
        const color = ['#10b981', '#a855f7', '#f59e0b', '#06b6d4', '#ef4444', '#ec4899'][[...r.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];
        return (
          <div key={r.id} className="flex items-center justify-between rounded bg-black/[0.04] px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{r.name.slice(0, 1).toUpperCase()}</div>
              <div className="text-[12px] font-semibold">{r.name} {r.state !== 'connected' && <span className="text-[10px] font-normal text-[var(--color-fg-subtle)]">({r.state})</span>}</div>
            </div>
            <div className="flex items-center gap-1">
              {f?.handUp && <Hand className="h-3.5 w-3.5 text-yellow-500" />}
              {f?.recording && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
            </div>
          </div>
        );
      })}
      {state !== 'connected' && remotes.length === 0 && (
        <div className="rounded bg-black/[0.04] px-2 py-1.5 text-[11px] text-[var(--color-fg-subtle)]">No one else here yet. Share the link below.</div>
      )}
      {role === 's' && (
        <div className="mt-2 border-t border-black/[0.06] pt-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invite more</div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" className="mx-auto my-2 h-28 w-28 border border-black/[0.06] bg-white p-1" />
          )}
          <button type="button" onClick={onCopy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2 text-[11px] font-bold uppercase tracking-wider text-white">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[9px] text-[var(--color-fg-muted)]">{link}</div>
        </div>
      )}
    </div>
  );
}

function CaptionsPanel({ on, busy, err, onToggle, lines, onClear }: { on: boolean; busy: boolean; err: string; onToggle: () => void; lines: CaptionLine[]; onClear: () => void }) {
  return (
    <div className="flex min-h-[280px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Captions {busy && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onClear} className="rounded bg-black/[0.04] px-2 py-1 text-[10px]">Clear</button>
          <button type="button" onClick={onToggle} className={`rounded px-2 py-1 text-[10px] font-semibold ${on ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.04]'}`}>{on ? 'On' : 'Off'}</button>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3 text-[12px]">
        {err && (
          <div className="rounded border border-amber-500/30 bg-amber-50/30 px-2 py-1.5 text-[11px] text-amber-700">{err}</div>
        )}
        {lines.length === 0 && !err && (
          <div className="text-[11px] text-[var(--color-fg-subtle)]">
            {busy ? 'Loading speech recognition model (one-time download)…' : on ? 'Listening for speech…' : 'Captions are off. Turn them on for live transcription. Speech-to-text runs on your device — nothing is uploaded.'}
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{l.name}</span>
            <p className="text-[12px] leading-relaxed">{l.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryPanel({ summary, busy, onRun, chapters }: { summary: string; busy: boolean; onRun: () => void; chapters: ChapterMark[] }) {
  return (
    <div className="flex min-h-[280px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">AI Summary</span>
        <button type="button" onClick={onRun} disabled={busy} className="flex items-center gap-1.5 rounded bg-[var(--color-cat-video)] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} {busy ? 'Summarizing…' : 'Summarize call'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-[12px] leading-relaxed">
        {summary ? (
          <p className="whitespace-pre-wrap text-[var(--color-fg)]">{summary}</p>
        ) : (
          <p className="text-[var(--color-fg-subtle)]">Click <strong>Summarize call</strong> to produce a concise summary of the chat using the on-device AI. Requires a WebGPU browser.</p>
        )}
        {chapters.length > 0 && (
          <div className="mt-4 border-t border-black/[0.06] pt-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Chapters</div>
            <ul className="space-y-1">
              {chapters.map((c, i) => (
                <li key={i} className="text-[11px]"><span className="font-mono text-[var(--color-fg-subtle)]">{(c.ts / 1000).toFixed(0)}s</span> · {c.label}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function BgPanel({ bg, bgBusy, onPick, fileRef, onImage }: {
  bg: 'off' | 'blur' | 'image'; bgBusy: boolean; onPick: (k: 'off' | 'blur' | 'image') => void;
  fileRef: React.RefObject<HTMLInputElement | null>; onImage: (f: File) => void;
}) {
  return (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
      <div className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
        <Sparkles className="h-3 w-3" /> Background {bgBusy && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {([['off', 'None'], ['blur', 'Blur'], ['image', 'Image']] as const).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === 'image' ? fileRef.current?.click() : onPick(k))}
            className={`py-1.5 text-[11px] font-semibold transition ${bg === k ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.04] text-[var(--color-fg)] hover:bg-black/[0.08]'}`}
          >
            {lbl}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ''; }} />
    </div>
  );
}

function PeerTile({ peer, flags, isSpotlight, onClick, tileRefs }: {
  peer: MeshPeerInfo; flags?: RemoteFlags; isSpotlight: boolean; onClick: () => void; tileRefs: React.RefObject<Map<string, HTMLVideoElement>>;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    tileRefs.current?.set(peer.id, v);
    if (peer.stream && v.srcObject !== peer.stream) {
      v.srcObject = peer.stream;
      void v.play().catch(() => {});
    }
    return () => { tileRefs.current?.delete(peer.id); };
  }, [peer.id, peer.stream, tileRefs]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative h-full w-full overflow-hidden bg-black text-left ${isSpotlight ? 'ring-2 ring-yellow-400' : ''}`}
    >
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline />
      {peer.state !== 'connected' && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
        {peer.name}
        {flags?.handUp && <Hand className="h-2.5 w-2.5 text-yellow-400" />}
        {flags?.recording && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
      </div>
    </button>
  );
}

function VideoStage({ layout, remotes, flags, spotlightId, onPickSpotlight, localRef, myName, myHand, tileRefs }: {
  layout: Layout; remotes: MeshPeerInfo[]; flags: Map<string, RemoteFlags>; spotlightId: string | null; onPickSpotlight: (id: string) => void;
  localRef: React.RefObject<HTMLVideoElement | null>; myName: string; myHand: boolean; tileRefs: React.RefObject<Map<string, HTMLVideoElement>>;
}) {
  const connected = remotes.filter((r) => r.state === 'connected' || r.stream);
  const spotlightPeer = connected.find((r) => r.id === spotlightId) ?? connected[0];

  if (connected.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <video ref={localRef} className="h-full w-full max-w-2xl object-contain" playsInline muted />
      </div>
    );
  }

  if (layout === 'theater' && spotlightPeer) {
    return (
      <div className="absolute inset-0">
        <PeerTile peer={spotlightPeer} flags={flags.get(spotlightPeer.id)} isSpotlight onClick={() => {}} tileRefs={tileRefs} />
      </div>
    );
  }

  if (layout === 'spotlight' && spotlightPeer) {
    const others = connected.filter((p) => p.id !== spotlightPeer.id);
    return (
      <div className="absolute inset-0 flex flex-col gap-2 p-2">
        <div className="flex-1 min-h-0">
          <PeerTile peer={spotlightPeer} flags={flags.get(spotlightPeer.id)} isSpotlight onClick={() => {}} tileRefs={tileRefs} />
        </div>
        {others.length > 0 || true ? (
          <div className="flex h-24 shrink-0 gap-2 overflow-x-auto">
            <LocalTile localRef={localRef} myName={myName} myHand={myHand} />
            {others.map((p) => (
              <div key={p.id} className="aspect-video h-full shrink-0">
                <PeerTile peer={p} flags={flags.get(p.id)} isSpotlight={false} onClick={() => onPickSpotlight(p.id)} tileRefs={tileRefs} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const total = connected.length + 1;
  const cols = total <= 2 ? 2 : total <= 4 ? 2 : 3;
  return (
    <div className="absolute inset-0 grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      <LocalTile localRef={localRef} myName={myName} myHand={myHand} />
      {connected.map((p) => (
        <PeerTile key={p.id} peer={p} flags={flags.get(p.id)} isSpotlight={false} onClick={() => onPickSpotlight(p.id)} tileRefs={tileRefs} />
      ))}
    </div>
  );
}

function LocalTile({ localRef, myName, myHand }: { localRef: React.RefObject<HTMLVideoElement | null>; myName: string; myHand: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video ref={localRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
        {myName} (you)
        {myHand && <Hand className="h-2.5 w-2.5 text-yellow-400" />}
      </div>
    </div>
  );
}

function AudioStage({ remotes, flags, myHand, myName }: { remotes: MeshPeerInfo[]; flags: Map<string, RemoteFlags>; myHand: boolean; myName: string }) {
  const connected = remotes.filter((r) => r.state === 'connected' || r.stream);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-white/90">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <VoiceAvatar name={myName} hand={myHand} self />
        {connected.map((r) => (
          <VoiceAvatar key={r.id} name={r.name} hand={flags.get(r.id)?.handUp ?? false} self={false} stream={r.stream} />
        ))}
      </div>
      <div className="text-[12px] font-medium">{connected.length === 0 ? 'Waiting…' : `Voice call · ${connected.length + 1} people`}</div>
    </div>
  );
}

function VoiceAvatar({ name, hand, self, stream }: { name: string; hand: boolean; self: boolean; stream?: MediaStream }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  React.useEffect(() => {
    if (!self && audioRef.current && stream) { audioRef.current.srcObject = stream; void audioRef.current.play().catch(() => {}); }
  }, [self, stream]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative grid h-20 w-20 place-items-center rounded-full bg-[var(--color-cat-video)]/30 text-2xl font-bold">
        {name.slice(0, 1).toUpperCase()}
        {hand && <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-yellow-500 text-black"><Hand className="h-3 w-3" /></span>}
      </div>
      <div className="text-[12px]">{name}{self ? ' (you)' : ''}</div>
      {!self && <audio ref={audioRef} className="hidden" autoPlay />}
    </div>
  );
}
