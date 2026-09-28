'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Video, VideoOff, Mic, MicOff, Phone, Copy, Check, Loader2, ShieldCheck,
  Send, MessageSquare, Square, Sparkles, MonitorPlay, Hand, Captions, PencilLine,
  Users, Layout, FileText, Pin, Wand2, Smile, Keyboard, FlipHorizontal2,
} from 'lucide-react';
import { joinMesh, type Mesh, type MeshPeerInfo } from '@/lib/p2p/mesh';
import { useRoomCode } from '@/lib/p2p/use-room-code';
import type { MediaState } from '@/lib/p2p/media';
import { meterStream, type AudioMeter } from '@/lib/p2p/audio-level';
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
  // client-only (avoids hydration mismatch); keep the existing short code format
  const room = useRoomCode(joinCode, () => Math.random().toString(36).slice(2, 10));
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
  // Set of peer ids currently talking (drives the audio-ring + auto-promote).
  const [speakingIds, setSpeakingIds] = React.useState<Set<string>>(new Set());
  // Local "you" speaking state — drives the on-air ring and the muted nudge.
  const [iAmSpeaking, setIAmSpeaking] = React.useState(false);
  const [mutedNudge, setMutedNudge] = React.useState(false);
  // Hold-spacebar push-to-talk: while held we un-mute, on release we re-mute,
  // but only if the mic was muted to begin with (so it can't mute an open mic).
  const [ptt, setPtt] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [mirror, setMirror] = React.useState(true);
  // Pin (local-only) — keeps a tile spotlit even when someone else talks.
  const pinnedRef = React.useRef(false);

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
  // Live audio meters: one for the local mic, one per remote peer stream.
  const localMeterRef = React.useRef<AudioMeter | null>(null);
  const remoteMetersRef = React.useRef<Map<string, AudioMeter>>(new Map());
  const speakRafRef = React.useRef(0);
  const pttPrevMicRef = React.useRef(true);
  const micOnRef = React.useRef(true);
  micOnRef.current = micOn;
  const [captionsBusy, setCaptionsBusy] = React.useState(false);
  const [captionsErr, setCaptionsErr] = React.useState<string>('');
  const nameRef = React.useRef('');
  nameRef.current = name || (role === 's' ? 'Host' : 'Guest');
  const { guard, gate } = useUsageGate('call');
  const { floaters, push: pushReaction } = useReactionFloaters();
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const recDeadlineRef = React.useRef<number | null>(null);

  // --- Green room (pre-join) state: live self-preview + mic test + device pick.
  const [lobbyStream, setLobbyStream] = React.useState<MediaStream | null>(null);
  const [lobbyErr, setLobbyErr] = React.useState<'denied' | 'none' | ''>('');
  const [micLevel, setMicLevel] = React.useState(0);
  const [devices, setDevices] = React.useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] });
  const [camId, setCamId] = React.useState<string>('');
  const [micId, setMicId] = React.useState<string>('');
  const lobbyVideoRef = React.useRef<HTMLVideoElement>(null);
  const lobbyMeterRef = React.useRef<AudioMeter | null>(null);
  const lobbyRafRef = React.useRef(0);
  // Set once start() hands the preview stream to the live call, so the lobby
  // cleanup effect does NOT stop the very tracks the call is now using.
  const lobbyHandedOffRef = React.useRef(false);

  const link = room && typeof window !== 'undefined' ? `${window.location.origin}/call?r=${room}${audioOnly ? '&audio=1' : ''}` : '';

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  // --- Acquire the GREEN-ROOM preview the moment the lobby mounts, so the user
  //     sees themselves + tests their mic BEFORE anyone else sees them. The same
  //     stream is handed to start() so joining is instant (no second prompt).
  const openLobby = React.useCallback(async (over?: { cam?: string; mic?: string }) => {
    setLobbyErr('');
    try {
      const constraints: MediaStreamConstraints = {
        audio: (over?.mic ?? micId) ? { deviceId: { exact: over?.mic ?? micId } } : true,
        video: audioOnly ? false : (over?.cam ?? camId) ? { deviceId: { exact: over?.cam ?? camId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Swap: stop the previous preview stream so device switches don't leak cams.
      setLobbyStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return stream; });
      // Populate device pickers now that permission is granted (labels appear).
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({ cams: list.filter((d) => d.kind === 'videoinput'), mics: list.filter((d) => d.kind === 'audioinput') });
        if (!camId) setCamId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '');
        if (!micId) setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? '');
      } catch { /* enumerate can fail pre-permission on some browsers */ }
    } catch (e) {
      setLobbyErr((e as DOMException)?.name === 'NotFoundError' ? 'none' : 'denied');
    }
  }, [audioOnly, camId, micId]);

  React.useEffect(() => {
    if (started) return;
    void openLobby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire the preview <video> + animated mic meter to the lobby stream.
  React.useEffect(() => {
    if (!lobbyStream) return;
    if (lobbyVideoRef.current) { lobbyVideoRef.current.srcObject = lobbyStream; void lobbyVideoRef.current.play().catch(() => {}); }
    lobbyMeterRef.current?.stop();
    lobbyMeterRef.current = meterStream(lobbyStream);
    const tick = () => { setMicLevel(lobbyMeterRef.current?.level() ?? 0); lobbyRafRef.current = requestAnimationFrame(tick); };
    lobbyRafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(lobbyRafRef.current); lobbyMeterRef.current?.stop(); lobbyMeterRef.current = null; };
  }, [lobbyStream]);

  // If the user never starts, release the preview camera/mic on unmount. Skip
  // when start() already handed this stream to the live call (it owns it now).
  React.useEffect(() => () => {
    if (!lobbyHandedOffRef.current) lobbyStream?.getTracks().forEach((t) => t.stop());
  }, [lobbyStream]);

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

  // --- Active-speaker + "muted while talking" detection. One rAF loop reads the
  //     local mic meter and every remote stream's meter, then:
  //       • glows the tile of whoever is talking (audio-ring),
  //       • auto-promotes the talker to spotlight (unless a tile is pinned),
  //       • nudges YOU if your voice is detected while the mic is muted.
  React.useEffect(() => {
    if (!started) return;
    // Local meter reads the RAW mic (camStreamRef), independent of the muted
    // track.enabled flag — so we can detect you talking *while muted*.
    if (camStreamRef.current && !localMeterRef.current) {
      localMeterRef.current = meterStream(camStreamRef.current);
    }
    let lastNudge = 0;
    const loop = () => {
      // Keep a meter alive for every connected remote stream.
      const live = new Set<string>();
      for (const r of remotes) {
        if (!r.stream) continue;
        live.add(r.id);
        if (!remoteMetersRef.current.has(r.id)) {
          try { remoteMetersRef.current.set(r.id, meterStream(r.stream)); } catch { /* */ }
        }
      }
      for (const [id, m] of remoteMetersRef.current) {
        if (!live.has(id)) { m.stop(); remoteMetersRef.current.delete(id); }
      }

      const talking = new Set<string>();
      let loudest = ''; let loudestLvl = 0;
      for (const [id, m] of remoteMetersRef.current) {
        const lvl = m.level();
        if (m.speaking()) talking.add(id);
        if (lvl > loudestLvl) { loudestLvl = lvl; loudest = id; }
      }
      setSpeakingIds((prev) => {
        if (prev.size === talking.size && [...talking].every((x) => prev.has(x))) return prev;
        return talking;
      });

      // Auto-promote the loudest active remote speaker (never override a pin).
      if (!pinnedRef.current && loudest && loudestLvl > 0.12) {
        setSpotlightId((cur) => (cur === loudest ? cur : loudest));
      }

      // Local: am I talking? + muted-while-talking nudge.
      const lm = localMeterRef.current;
      if (lm) {
        const speaking = lm.speaking();
        setIAmSpeaking((prev) => (prev === speaking ? prev : speaking));
        if (speaking && !micOnRef.current) {
          const now = performance.now();
          if (now - lastNudge > 4000) { lastNudge = now; setMutedNudge(true); setTimeout(() => setMutedNudge(false), 2600); }
        }
      }
      speakRafRef.current = requestAnimationFrame(loop);
    };
    speakRafRef.current = requestAnimationFrame(loop);
    const remoteMeters = remoteMetersRef.current;
    return () => {
      cancelAnimationFrame(speakRafRef.current);
      for (const m of remoteMeters.values()) m.stop();
      remoteMeters.clear();
      localMeterRef.current?.stop(); localMeterRef.current = null;
    };
  }, [started, remotes]);

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
      // Reuse the green-room preview stream so there's no second camera prompt
      // and joining is instant. Fall back to a fresh getUserMedia only if the
      // lobby never acquired one (e.g. user navigated in oddly).
      let stream = lobbyStream;
      if (!stream || stream.getTracks().every((t) => t.readyState === 'ended')) {
        stream = await navigator.mediaDevices.getUserMedia({ video: !audioOnly, audio: true });
      }
      lobbyHandedOffRef.current = true;
      setLobbyStream(null); // hand ownership to the call; don't double-stop it
      lobbyMeterRef.current?.stop(); lobbyMeterRef.current = null;
      cancelAnimationFrame(lobbyRafRef.current);
      camStreamRef.current = stream;
      // Honour the choices made in the green room.
      const at = stream.getAudioTracks()[0]; if (at) { at.enabled = micOn; }
      const vt = stream.getVideoTracks()[0]; if (vt) { vt.enabled = camOn; }
      if (localRef.current) { localRef.current.srcObject = stream; localRef.current.muted = true; void localRef.current.play().catch(() => {}); }
      setStarted(true);
      const { isWatermarkOn } = await import('@/lib/watermark/config');
      const { watermarkVideoStream } = await import('@/lib/watermark/stream-overlay');
      const wrapped = await watermarkVideoStream(stream, await isWatermarkOn());
      wmStopRef.current = wrapped.stop;
      // Local tile shows the WATERMARKED stream so the recording compositor
      // (startRec draws localRef) captures the brand mark on free sessions —
      // it previously recorded the raw `stream`, leaking a clean .webm.
      if (localRef.current && wrapped.stream !== stream) {
        localRef.current.srcObject = wrapped.stream;
        void localRef.current.play().catch(() => {});
      }
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
      // Carry a background chosen in the green room into the live call.
      if (!audioOnly && bg !== 'off') { void applyBg(bg); }
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

  const setMic = (on: boolean) => { const t = camStreamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = on; setMicOn(on); } };
  const setCam = (on: boolean) => { const t = camStreamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = on; setCamOn(on); } };
  const toggleCam = () => setCam(!camOn);
  const toggleMic = () => setMic(!micOn);

  // --- Mid-call device switch (camera/mic) without dropping the connection:
  //     grab the new device, splice its track into the live stream, and
  //     re-publish to every peer via replaceVideoTrack / the audio sender.
  const switchDevice = async (kind: 'cam' | 'mic', deviceId: string) => {
    if (!camStreamRef.current) return;
    try {
      const cs = camStreamRef.current;
      if (kind === 'cam') {
        if (audioOnly) return;
        const ns = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
        const nt = ns.getVideoTracks()[0]; if (!nt) return;
        nt.enabled = camOn;
        cs.getVideoTracks().forEach((t) => { cs.removeTrack(t); t.stop(); });
        cs.addTrack(nt);
        setCamId(deviceId);
        // Only push the raw track when no virtual-background pipeline owns the feed.
        if (bg === 'off') meshRef.current?.replaceVideoTrack(nt);
        if (localRef.current && bg === 'off') { localRef.current.srcObject = cs; void localRef.current.play().catch(() => {}); }
      } else {
        const ns = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        const nt = ns.getAudioTracks()[0]; if (!nt) return;
        nt.enabled = micOn;
        cs.getAudioTracks().forEach((t) => { cs.removeTrack(t); t.stop(); });
        cs.addTrack(nt);
        setMicId(deviceId);
        meshRef.current?.replaceAudioTrack?.(nt);
        // Re-point the local meter at the new mic so speaker/nudge detection works.
        localMeterRef.current?.stop();
        localMeterRef.current = meterStream(cs);
      }
    } catch { /* device busy / denied */ }
  };
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

  // --- Keyboard shortcuts + push-to-talk. High-frequency actions get the keys
  //     users expect from Meet/Zoom; hold-Space temporarily un-mutes (and only
  //     re-mutes on release if you started muted, so it can't silence an open
  //     mic). Typing in chat/name fields is never hijacked.
  React.useEffect(() => {
    if (!started) return;
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); toggleMic(); return; }
      if (meta && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); if (!audioOnly) toggleCam(); return; }
      if (!meta && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); toggleHand(); return; }
      if (!meta && e.key === '?') { e.preventDefault(); setShowShortcuts((s) => !s); return; }
      if (e.code === 'Space' && !meta && !e.repeat) {
        // Push-to-talk only matters when muted; otherwise leave Space alone.
        if (!micOnRef.current) {
          e.preventDefault();
          pttPrevMicRef.current = false;
          setPtt(true);
          setMic(true);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && ptt) {
        e.preventDefault();
        setPtt(false);
        if (!pttPrevMicRef.current) setMic(false); // restore the muted state
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, audioOnly, micOn, camOn, handUp, ptt]);

  const elapsedLabel = (() => {
    const s = Math.floor(elapsed / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  })();

  return (
    // Grounded app window (light) — contained on the page, not floating in cream.
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-[1500px] flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-surface-2)] p-3 shadow-lg sm:p-4">
      {gate}
      {policyGate.element}

      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.08] pb-3">
        <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-video)] text-white">
          {audioOnly ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold tracking-tight">Video Call</h1>
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
            <button type="button" onClick={() => { setLayout('spotlight'); pinnedRef.current = false; }} className={`grid h-8 w-8 place-items-center text-xs ${layout === 'spotlight' ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`} title="Spotlight — auto-follows whoever is speaking (click a tile to pin)">
              <span className="text-[11px] font-bold">★</span>
            </button>
            <button type="button" onClick={() => setLayout('theater')} className={`grid h-8 w-8 place-items-center text-xs ${layout === 'theater' ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`} title="Theater (presenter only)">
              <MonitorPlay className="h-4 w-4" />
            </button>
          </div>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-28 border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-right text-[12px] focus:outline-none" />
      </header>

      {!started ? (
        <GreenRoom
          role={role}
          audioOnly={audioOnly}
          link={link}
          qr={qr}
          copied={copied}
          onStart={start}
          onCopy={copy}
          lobbyVideoRef={lobbyVideoRef}
          hasStream={!!lobbyStream}
          lobbyErr={lobbyErr}
          onRetry={() => openLobby()}
          micLevel={micLevel}
          micOn={micOn}
          camOn={camOn}
          onToggleMic={() => setMicOn((v) => { const n = !v; const t = lobbyStream?.getAudioTracks()[0]; if (t) t.enabled = n; return n; })}
          onToggleCam={() => setCamOn((v) => { const n = !v; const t = lobbyStream?.getVideoTracks()[0]; if (t) t.enabled = n; return n; })}
          mirror={mirror}
          onToggleMirror={() => setMirror((m) => !m)}
          bg={bg}
          onPickBg={(k) => setBg(k)}
          devices={devices}
          camId={camId}
          micId={micId}
          onSwitchCam={(id) => { setCamId(id); void openLobby({ cam: id }); }}
          onSwitchMic={(id) => { setMicId(id); void openLobby({ mic: id }); }}
          name={name}
          onName={setName}
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
                onPickSpotlight={(id) => { setSpotlightId(id); pinnedRef.current = true; setLayout('spotlight'); }}
                localRef={localRef}
                myName={nameRef.current}
                myHand={handUp}
                tileRefs={tileVideoRefs}
                speakingIds={speakingIds}
                iAmSpeaking={iAmSpeaking && micOn}
                mirror={mirror}
                camOn={camOn}
              />
            )}
            {audioOnly && (
              <AudioStage remotes={remotes} flags={remoteFlags} myHand={handUp} myName={nameRef.current} speakingIds={speakingIds} iAmSpeaking={iAmSpeaking && micOn} />
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

            {/* Push-to-talk "on air" ring while Space is held. */}
            {ptt && (
              <div className="pointer-events-none absolute inset-0 ring-[3px] ring-inset ring-green-400/90 animate-pulse" />
            )}

            {/* "You're muted" nudge — fires when your voice is detected while muted. */}
            {mutedNudge && (
              <div className="pointer-events-none absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-[13px] font-semibold text-white shadow-2xl backdrop-blur">
                <MicOff className="h-4 w-4 text-red-400" /> You&rsquo;re muted &mdash; others can&rsquo;t hear you
              </div>
            )}

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

            <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-full bg-black/30 p-1.5 backdrop-blur">
              <button type="button" onClick={toggleMic} className={`relative grid h-11 w-11 shrink-0 place-items-center text-white transition-transform active:scale-90 ${micOn ? 'bg-black/55' : 'bg-red-600'}`} title="Mic (Ctrl/Cmd+D)">
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                {/* Live "you're talking" ring — soft glow while your voice is detected. */}
                {micOn && iAmSpeaking && <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-green-400 ring-offset-0 animate-pulse" />}
              </button>
              {!audioOnly && (
                <button type="button" onClick={toggleCam} className={`grid h-11 w-11 shrink-0 place-items-center text-white transition-transform active:scale-90 ${camOn ? 'bg-black/55' : 'bg-red-600'}`} title="Camera (Ctrl/Cmd+E)">
                  {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              )}
              {!audioOnly && (
                <button type="button" onClick={toggleScreen} className={`grid h-11 w-11 shrink-0 place-items-center text-white transition-transform active:scale-90 ${screenOn ? 'bg-cyan-600' : 'bg-black/55'}`} title="Share screen">
                  <MonitorPlay className="h-5 w-5" />
                </button>
              )}
              <button type="button" onClick={toggleHand} className={`grid h-11 w-11 shrink-0 place-items-center text-white transition-transform active:scale-90 ${handUp ? 'bg-yellow-500 text-black' : 'bg-black/55'}`} title="Raise hand (R)">
                <Hand className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setShowEmoji((s) => !s)} className="grid h-11 w-11 shrink-0 place-items-center bg-black/55 text-white transition-transform active:scale-90" title="Reactions">
                <Smile className="h-5 w-5" />
              </button>
              <button type="button" onClick={toggleRec} className={`grid h-11 w-11 shrink-0 place-items-center text-white transition-transform active:scale-90 ${recording ? 'bg-red-600' : 'bg-black/55'}`} title={recording ? 'Stop recording' : 'Record'}>
                {recording ? <Square className="h-4 w-4" /> : <span className="h-3 w-3 rounded-full bg-red-500" />}
              </button>
              {recording && (
                <button type="button" onClick={() => addChapter(prompt('Chapter name?') || 'Chapter')} className="grid h-11 shrink-0 place-items-center bg-black/55 px-3 text-[11px] font-semibold text-white" title="Mark chapter">
                  <Pin className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => setShowShortcuts((s) => !s)} className="hidden h-11 w-11 shrink-0 place-items-center bg-black/55 text-white transition-transform active:scale-90 sm:grid" title="Keyboard shortcuts (?)">
                <Keyboard className="h-5 w-5" />
              </button>
              {/* Hangup is deliberately separated to the far right (divider + gap) so
                  you never fat-finger it while reaching for mute — the #1 call UX bug. */}
              <span className="mx-0.5 h-7 w-px shrink-0 bg-white/20" />
              <button type="button" onClick={hangup} className="grid h-11 w-14 shrink-0 place-items-center bg-red-600 text-white transition-transform hover:bg-red-500 active:scale-90" title="Hang up">
                <Phone className="h-5 w-5 rotate-[135deg]" />
              </button>
            </div>

            {showShortcuts && (
              <button type="button" onClick={() => setShowShortcuts(false)} className="absolute inset-0 z-20 grid cursor-default place-items-center bg-black/50 backdrop-blur-sm" title="">
                <div className="w-[min(92%,360px)] rounded bg-[var(--color-surface-1)] p-5 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]"><Keyboard className="h-4 w-4" /> Keyboard shortcuts</div>
                  <ul className="space-y-2 text-[13px]">
                    {([
                      ['Ctrl / Cmd + D', 'Mute / unmute'],
                      ['Ctrl / Cmd + E', 'Camera on / off'],
                      ['Hold Space', 'Push-to-talk (while muted)'],
                      ['R', 'Raise / lower hand'],
                      ['?', 'Toggle this panel'],
                    ] as const).map(([k, v]) => (
                      <li key={k} className="flex items-center justify-between gap-4">
                        <span className="text-[var(--color-fg)]">{v}</span>
                        <kbd className="rounded border border-black/15 bg-black/[0.04] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg-muted)]">{k}</kbd>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            )}

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
              <PeoplePanel
                role={role} state={state} link={link} qr={qr} copied={copied} onCopy={copy}
                handUp={handUp} remotes={remotes} flags={remoteFlags} myName={nameRef.current}
                speakingIds={speakingIds}
                audioOnly={audioOnly}
                devices={devices} camId={camId} micId={micId}
                onSwitchCam={(id) => void switchDevice('cam', id)}
                onSwitchMic={(id) => void switchDevice('mic', id)}
              />
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

            <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
              <span>P2P encrypted — audio, video, chat, whiteboard, and reactions never pass through our servers.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * GREEN ROOM (pre-join lobby) — the signature frictionless-join move. The user
 * sees a live, mirrored self-preview, tests their mic against an animated level
 * meter, picks camera/mic devices, and can pre-arm blur — all BEFORE anyone in
 * the call sees them. One big Join button. This is the moment that decides the
 * whole experience, so it gets the most care.
 */
function GreenRoom({
  role, audioOnly, link, qr, copied, onStart, onCopy,
  lobbyVideoRef, hasStream, lobbyErr, onRetry, micLevel, micOn, camOn,
  onToggleMic, onToggleCam, mirror, onToggleMirror, bg, onPickBg,
  devices, camId, micId, onSwitchCam, onSwitchMic, name, onName,
}: {
  role: 's' | 'r'; audioOnly: boolean; link: string; qr: string; copied: boolean;
  onStart: () => void; onCopy: () => void;
  lobbyVideoRef: React.RefObject<HTMLVideoElement | null>; hasStream: boolean; lobbyErr: 'denied' | 'none' | '';
  onRetry: () => void; micLevel: number; micOn: boolean; camOn: boolean;
  onToggleMic: () => void; onToggleCam: () => void; mirror: boolean; onToggleMirror: () => void;
  bg: 'off' | 'blur' | 'image'; onPickBg: (k: 'off' | 'blur' | 'image') => void;
  devices: { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }; camId: string; micId: string;
  onSwitchCam: (id: string) => void; onSwitchMic: (id: string) => void;
  name: string; onName: (s: string) => void;
}) {
  // Mic meter rendered as ~14 segmented LEDs that light up to your voice.
  const segments = 14;
  const lit = Math.round(micLevel * segments);
  return (
    <div className="grid flex-1 place-items-center overflow-y-auto py-2">
      <div className="grid w-full max-w-4xl gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Live preview */}
        <div className="overflow-hidden border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="relative aspect-video bg-black">
            {!audioOnly && (
              <video
                ref={lobbyVideoRef}
                className={`absolute inset-0 h-full w-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`}
                playsInline muted
              />
            )}
            {(audioOnly || !camOn) && !lobbyErr && (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#1a1f2e] to-black text-white/80">
                <div className="flex flex-col items-center gap-2">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-[var(--color-cat-video)]/30 text-2xl font-bold">
                    {(name || (role === 's' ? 'Host' : 'Guest')).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[12px]">{audioOnly ? 'Voice call — no camera' : 'Camera is off'}</span>
                </div>
              </div>
            )}
            {!hasStream && !lobbyErr && (
              <div className="absolute inset-0 grid place-items-center text-white/70">
                <div className="flex flex-col items-center gap-2"><Loader2 className="h-7 w-7 animate-spin" /><span className="text-[12px]">Starting your camera…</span></div>
              </div>
            )}
            {lobbyErr && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/80">
                <div className="max-w-xs">
                  <MicOff className="mx-auto mb-2 h-7 w-7 text-red-400" />
                  <p className="text-[13px]">
                    {lobbyErr === 'denied'
                      ? "We couldn't access your camera/mic. Allow permission in your browser, then retry. You can still join audio-muted."
                      : 'No camera or microphone found. Plug one in and retry, or join to listen.'}
                  </p>
                  <button type="button" onClick={onRetry} className="mt-3 bg-white/15 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25">Retry</button>
                </div>
              </div>
            )}

            {/* Preview device toggles */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
              <button type="button" onClick={onToggleMic} className={`grid h-10 w-10 place-items-center text-white transition-transform active:scale-90 ${micOn ? 'bg-black/55' : 'bg-red-600'}`} title="Mic">
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              {!audioOnly && (
                <button type="button" onClick={onToggleCam} className={`grid h-10 w-10 place-items-center text-white transition-transform active:scale-90 ${camOn ? 'bg-black/55' : 'bg-red-600'}`} title="Camera">
                  {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              )}
              {!audioOnly && (
                <button type="button" onClick={onToggleMirror} className={`grid h-10 w-10 place-items-center text-white transition-transform active:scale-90 ${mirror ? 'bg-[var(--color-cat-video)]' : 'bg-black/55'}`} title="Mirror my preview">
                  <FlipHorizontal2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Animated mic level meter — bounces to your voice so you KNOW it works. */}
          <div className="flex items-center gap-2 border-t border-black/[0.06] px-3 py-2.5">
            {micOn ? <Mic className="h-4 w-4 text-[var(--color-fg-muted)]" /> : <MicOff className="h-4 w-4 text-red-500" />}
            <div className="flex flex-1 items-center gap-[3px]">
              {Array.from({ length: segments }).map((_, i) => (
                <span
                  key={i}
                  className="h-3 flex-1 rounded-sm transition-colors duration-75"
                  style={{ background: micOn && i < lit ? (i > segments - 4 ? '#ef4444' : i > segments - 7 ? '#f59e0b' : '#10b981') : 'rgba(0,0,0,0.10)' }}
                />
              ))}
            </div>
            <span className="w-24 text-right text-[11px] text-[var(--color-fg-subtle)]">
              {!micOn ? 'Muted' : lit > 1 ? 'Mic working' : 'Say something…'}
            </span>
          </div>
        </div>

        {/* Join + settings */}
        <div className="flex flex-col gap-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <h2 className="text-[18px] font-bold tracking-tight">{role === 's' ? 'Ready to start' : 'Ready to join'}</h2>
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">Check yourself, then go. Encrypted peer-to-peer — nothing through a server.</p>
            <input value={name} onChange={(e) => onName(e.target.value)} placeholder="Your name" className="mt-3 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] focus:outline-none" />
            <button type="button" onClick={onStart} className="mt-3 flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] px-6 py-3 text-[14px] font-semibold text-white transition hover:brightness-110">
              {audioOnly ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />} {role === 's' ? `Start ${audioOnly ? 'voice ' : ''}call` : 'Join now'}
            </button>

            {/* Device pickers — only show once permission populated labels. */}
            {!audioOnly && devices.cams.length > 1 && (
              <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Camera
                <select value={camId} onChange={(e) => onSwitchCam(e.target.value)} className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-[var(--color-fg)] focus:outline-none">
                  {devices.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                </select>
              </label>
            )}
            {devices.mics.length > 1 && (
              <label className="mt-2 block text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Microphone
                <select value={micId} onChange={(e) => onSwitchMic(e.target.value)} className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-[var(--color-fg)] focus:outline-none">
                  {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
                </select>
              </label>
            )}

            {/* Pre-arm background blur so you never appear in a messy room. */}
            {!audioOnly && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]"><Sparkles className="h-3 w-3" /> Background</div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {([['off', 'None'], ['blur', 'Blur']] as const).map(([k, lbl]) => (
                    <button key={k} type="button" onClick={() => onPickBg(k)} className={`py-1.5 text-[12px] font-semibold transition ${bg === k ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.04] hover:bg-black/[0.08]'}`}>{lbl}</button>
                  ))}
                </div>
                {bg === 'blur' && <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">Blur applies the moment you join.</p>}
              </div>
            )}
          </div>

          {role === 's' && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-center">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invite the other person</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR" className="mx-auto mb-2 h-28 w-28 border border-black/[0.06] bg-white p-1" />
              )}
              <button type="button" onClick={onCopy} className="mx-auto flex items-center gap-2 bg-black/[0.05] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition hover:bg-black/[0.1]">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">{link}</div>
            </div>
          )}
        </div>
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
            <span className="mt-0.5 px-1 text-[11px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</span>
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

function PeoplePanel({ role, state, link, qr, copied, onCopy, handUp, remotes, flags, myName, speakingIds, audioOnly, devices, camId, micId, onSwitchCam, onSwitchMic }: {
  role: 's' | 'r'; state: MediaState; link: string; qr: string; copied: boolean; onCopy: () => void; handUp: boolean; remotes: MeshPeerInfo[]; flags: Map<string, RemoteFlags>; myName: string;
  speakingIds: Set<string>; audioOnly: boolean;
  devices: { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }; camId: string; micId: string;
  onSwitchCam: (id: string) => void; onSwitchMic: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        In the call · {remotes.length + 1}
      </div>
      <div className="flex items-center justify-between rounded bg-black/[0.04] px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-cat-video)] text-[11px] font-bold text-white">{myName.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="text-[12px] font-semibold">{myName} <span className="text-[11px] font-normal text-[var(--color-fg-subtle)]">(you{role === 's' ? ' · host' : ''})</span></div>
          </div>
        </div>
        {handUp && <Hand className="h-3.5 w-3.5 text-yellow-500" />}
      </div>
      {remotes.map((r) => {
        const f = flags.get(r.id);
        const talking = speakingIds.has(r.id);
        const color = ['#10b981', '#a855f7', '#f59e0b', '#06b6d4', '#ef4444', '#ec4899'][[...r.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];
        return (
          <div key={r.id} className={`flex items-center justify-between rounded px-2 py-1.5 ${talking ? 'bg-green-500/10 ring-1 ring-green-400/40' : 'bg-black/[0.04]'}`}>
            <div className="flex items-center gap-2">
              <div className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white ${talking ? 'ring-2 ring-green-400' : ''}`} style={{ background: color }}>{r.name.slice(0, 1).toUpperCase()}</div>
              <div className="text-[12px] font-semibold">{r.name} {r.state !== 'connected' && <span className="text-[11px] font-normal text-[var(--color-fg-subtle)]">({r.state})</span>}</div>
            </div>
            <div className="flex items-center gap-1">
              {talking && <Mic className="h-3.5 w-3.5 text-green-500" />}
              {f?.handUp && <Hand className="h-3.5 w-3.5 text-yellow-500" />}
              {f?.recording && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
            </div>
          </div>
        );
      })}
      {state !== 'connected' && remotes.length === 0 && (
        <div className="rounded bg-black/[0.04] px-2 py-1.5 text-[11px] text-[var(--color-fg-subtle)]">No one else here yet. Share the link below.</div>
      )}

      {/* Mid-call device switching — change camera/mic without dropping the call. */}
      {(devices.mics.length > 1 || (!audioOnly && devices.cams.length > 1)) && (
        <div className="mt-1 border-t border-black/[0.06] pt-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Devices</div>
          {!audioOnly && devices.cams.length > 1 && (
            <select value={camId} onChange={(e) => onSwitchCam(e.target.value)} className="mt-1.5 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 text-[11px] focus:outline-none">
              {devices.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
            </select>
          )}
          {devices.mics.length > 1 && (
            <select value={micId} onChange={(e) => onSwitchMic(e.target.value)} className="mt-1.5 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1.5 text-[11px] focus:outline-none">
              {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
            </select>
          )}
        </div>
      )}
      {role === 's' && (
        <div className="mt-2 border-t border-black/[0.06] pt-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invite more</div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" className="mx-auto my-2 h-28 w-28 border border-black/[0.06] bg-white p-1" />
          )}
          <button type="button" onClick={onCopy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2 text-[11px] font-bold uppercase tracking-wider text-white">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">{link}</div>
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
          <button type="button" onClick={onClear} className="rounded bg-black/[0.04] px-2 py-1 text-[11px]">Clear</button>
          <button type="button" onClick={onToggle} className={`rounded px-2 py-1 text-[11px] font-semibold ${on ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.04]'}`}>{on ? 'On' : 'Off'}</button>
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{l.name}</span>
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
        <button type="button" onClick={onRun} disabled={busy} className="flex items-center gap-1.5 rounded bg-[var(--color-cat-video)] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
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
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Chapters</div>
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
      <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
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

function PeerTile({ peer, flags, isSpotlight, speaking, onClick, tileRefs }: {
  peer: MeshPeerInfo; flags?: RemoteFlags; isSpotlight: boolean; speaking?: boolean; onClick: () => void; tileRefs: React.RefObject<Map<string, HTMLVideoElement>>;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hasVideo = !!peer.stream && peer.stream.getVideoTracks().some((t) => t.readyState === 'live');
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
      // Active-speaker audio-ring (green glow) beats the static spotlight ring;
      // a soft outer shadow makes the talker's tile pop in a busy grid.
      className={`group relative h-full w-full overflow-hidden bg-black text-left transition-shadow duration-150 ${speaking ? 'ring-2 ring-green-400 shadow-[0_0_0_3px_rgba(74,222,128,0.35)]' : isSpotlight ? 'ring-2 ring-yellow-400' : ''}`}
    >
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline />
      {!hasVideo && peer.state === 'connected' && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#1a1f2e] to-black">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-cat-video)]/40 text-lg font-bold text-white">{peer.name.slice(0, 1).toUpperCase()}</div>
        </div>
      )}
      {peer.state !== 'connected' && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-[11px] text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
        {speaking && <Mic className="h-2.5 w-2.5 text-green-400" />}
        {peer.name}
        {flags?.handUp && <Hand className="h-2.5 w-2.5 text-yellow-400" />}
        {flags?.recording && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
      </div>
    </button>
  );
}

function VideoStage({ layout, remotes, flags, spotlightId, onPickSpotlight, localRef, myName, myHand, tileRefs, speakingIds, iAmSpeaking, mirror, camOn }: {
  layout: Layout; remotes: MeshPeerInfo[]; flags: Map<string, RemoteFlags>; spotlightId: string | null; onPickSpotlight: (id: string) => void;
  localRef: React.RefObject<HTMLVideoElement | null>; myName: string; myHand: boolean; tileRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  speakingIds: Set<string>; iAmSpeaking: boolean; mirror: boolean; camOn: boolean;
}) {
  const connected = remotes.filter((r) => r.state === 'connected' || r.stream);
  const spotlightPeer = connected.find((r) => r.id === spotlightId) ?? connected[0];

  if (connected.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`relative h-full w-full max-w-2xl overflow-hidden transition-shadow ${iAmSpeaking ? 'ring-2 ring-green-400' : ''}`}>
          <video ref={localRef} className={`h-full w-full object-contain ${mirror ? 'scale-x-[-1]' : ''} ${camOn ? '' : 'invisible'}`} playsInline muted />
          {!camOn && (
            <div className="absolute inset-0 grid place-items-center"><div className="grid h-20 w-20 place-items-center rounded-full bg-[var(--color-cat-video)]/40 text-2xl font-bold text-white">{myName.slice(0, 1).toUpperCase()}</div></div>
          )}
        </div>
      </div>
    );
  }

  if (layout === 'theater' && spotlightPeer) {
    return (
      <div className="absolute inset-0">
        <PeerTile peer={spotlightPeer} flags={flags.get(spotlightPeer.id)} isSpotlight speaking={speakingIds.has(spotlightPeer.id)} onClick={() => {}} tileRefs={tileRefs} />
      </div>
    );
  }

  if (layout === 'spotlight' && spotlightPeer) {
    const others = connected.filter((p) => p.id !== spotlightPeer.id);
    return (
      <div className="absolute inset-0 flex flex-col gap-2 p-2">
        <div className="flex-1 min-h-0">
          <PeerTile peer={spotlightPeer} flags={flags.get(spotlightPeer.id)} isSpotlight speaking={speakingIds.has(spotlightPeer.id)} onClick={() => {}} tileRefs={tileRefs} />
        </div>
        <div className="flex h-24 shrink-0 gap-2 overflow-x-auto">
          <LocalTile localRef={localRef} myName={myName} myHand={myHand} speaking={iAmSpeaking} mirror={mirror} camOn={camOn} />
          {others.map((p) => (
            <div key={p.id} className="aspect-video h-full shrink-0">
              <PeerTile peer={p} flags={flags.get(p.id)} isSpotlight={false} speaking={speakingIds.has(p.id)} onClick={() => onPickSpotlight(p.id)} tileRefs={tileRefs} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const total = connected.length + 1;
  const cols = total <= 2 ? 2 : total <= 4 ? 2 : 3;
  return (
    <div className="absolute inset-0 grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      <LocalTile localRef={localRef} myName={myName} myHand={myHand} speaking={iAmSpeaking} mirror={mirror} camOn={camOn} />
      {connected.map((p) => (
        <PeerTile key={p.id} peer={p} flags={flags.get(p.id)} isSpotlight={false} speaking={speakingIds.has(p.id)} onClick={() => onPickSpotlight(p.id)} tileRefs={tileRefs} />
      ))}
    </div>
  );
}

function LocalTile({ localRef, myName, myHand, speaking, mirror, camOn }: { localRef: React.RefObject<HTMLVideoElement | null>; myName: string; myHand: boolean; speaking?: boolean; mirror?: boolean; camOn?: boolean }) {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-black transition-shadow ${speaking ? 'ring-2 ring-green-400' : ''}`}>
      <video ref={localRef} className={`absolute inset-0 h-full w-full object-cover ${mirror ? 'scale-x-[-1]' : ''} ${camOn === false ? 'invisible' : ''}`} playsInline muted />
      {camOn === false && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#1a1f2e] to-black"><div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-cat-video)]/40 text-sm font-bold text-white">{myName.slice(0, 1).toUpperCase()}</div></div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
        {speaking && <Mic className="h-2.5 w-2.5 text-green-400" />}
        {myName} (you)
        {myHand && <Hand className="h-2.5 w-2.5 text-yellow-400" />}
      </div>
    </div>
  );
}

function AudioStage({ remotes, flags, myHand, myName, speakingIds, iAmSpeaking }: { remotes: MeshPeerInfo[]; flags: Map<string, RemoteFlags>; myHand: boolean; myName: string; speakingIds: Set<string>; iAmSpeaking: boolean }) {
  const connected = remotes.filter((r) => r.state === 'connected' || r.stream);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-white/90">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <VoiceAvatar name={myName} hand={myHand} self speaking={iAmSpeaking} />
        {connected.map((r) => (
          <VoiceAvatar key={r.id} name={r.name} hand={flags.get(r.id)?.handUp ?? false} self={false} stream={r.stream} speaking={speakingIds.has(r.id)} />
        ))}
      </div>
      <div className="text-[12px] font-medium">{connected.length === 0 ? 'Waiting…' : `Voice call · ${connected.length + 1} people`}</div>
    </div>
  );
}

function VoiceAvatar({ name, hand, self, stream, speaking }: { name: string; hand: boolean; self: boolean; stream?: MediaStream; speaking?: boolean }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  React.useEffect(() => {
    if (!self && audioRef.current && stream) { audioRef.current.srcObject = stream; void audioRef.current.play().catch(() => {}); }
  }, [self, stream]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative grid h-20 w-20 place-items-center rounded-full bg-[var(--color-cat-video)]/30 text-2xl font-bold transition-all ${speaking ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-black' : ''}`}>
        {speaking && <span className="absolute inset-0 animate-ping rounded-full bg-green-400/20" />}
        {name.slice(0, 1).toUpperCase()}
        {hand && <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-yellow-500 text-black"><Hand className="h-3 w-3" /></span>}
      </div>
      <div className="text-[12px]">{name}{self ? ' (you)' : ''}</div>
      {!self && <audio ref={audioRef} className="hidden" autoPlay />}
    </div>
  );
}
