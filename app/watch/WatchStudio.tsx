'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MonitorPlay, Copy, Check, Loader2, ShieldCheck, Smartphone, Square,
  MessageSquare, Send, Smile, Mic, MicOff, Hand,
  Maximize2, Minimize2, Volume2, VolumeX, Users, Film,
  Activity, Wifi, WifiOff, RotateCw, Keyboard, EyeOff, Gauge,
} from 'lucide-react';
import { connectMedia, type MediaPeer, type MediaState, type MediaHealth } from '@/lib/p2p/media';
import { useRoomCode } from '@/lib/p2p/use-room-code';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { encodeWire, decodeWire, isWire } from '@/lib/appstudio/protocol';
import { ReactionLayer, ReactionPicker, useReactionFloaters } from '@/lib/appstudio/reactions';
import { checkLever, freeCap } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { useSessionCap } from '@/lib/limits/use-session-cap';
import { FreeCapHint } from '@/components/limits/ProBadge';

const POLICY_KEY = 'watch';

type Source = 'screen' | 'file' | 'camera';
interface ChatLine { mine: boolean; text: string; name: string; ts: number }

export default function WatchStudio() {
  const params = useSearchParams();
  const room = params.get('r');
  return room ? <Viewer code={room} /> : <Host />;
}

function Shell({ children, title, subtitle, badge }: { children: React.ReactNode; title: string; subtitle: string; badge?: React.ReactNode }) {
  return (
    // Grounded app window (light) — contained on the page, not floating in cream.
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-[1500px] flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-surface-2)] p-3 shadow-lg sm:p-4">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-stroke)] pb-3">
        <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-video)] text-white"><MonitorPlay className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold tracking-tight">{title}</h1>
          <p className="truncate text-[11px] text-[var(--color-fg-muted)]">{subtitle}</p>
        </div>
        {badge}
      </header>
      {children}
      <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
        <span>P2P encrypted — video, audio, chat, reactions all stream device-to-device.</span>
      </div>
    </div>
  );
}

/** A small, calm live/connecting/reconnecting pill for the header. */
function StatusPill({ state, source }: { state: MediaState | null; source?: string | null }) {
  if (!state) return <span className="shrink-0 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">Idle</span>;
  const map: Record<MediaState, { label: string; cls: string; dot: string; spin?: boolean }> = {
    connecting: { label: 'Connecting', cls: 'bg-amber-500/15 text-amber-700', dot: 'bg-amber-500', spin: true },
    connected: { label: 'Live', cls: 'bg-red-500/15 text-red-600', dot: 'bg-red-500 animate-pulse' },
    closed: { label: 'Reconnecting', cls: 'bg-amber-500/15 text-amber-700', dot: 'bg-amber-500', spin: true },
    failed: { label: 'Disconnected', cls: 'bg-black/[0.06] text-[var(--color-fg-muted)]', dot: 'bg-[var(--color-fg-subtle)]' },
  };
  const m = map[state];
  return (
    <span className={`flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}{source ? <span className="font-medium opacity-70">· {source}</span> : null}
    </span>
  );
}

/**
 * Always-visible transparent health HUD — the rival's hidden frame-dropping
 * turned into an honest readout (latency / fps / bitrate / resolution). When
 * the link degrades it shows a calm "Optimizing" note instead of a freeze.
 */
function HealthHUD({ getHealth, viewers }: { getHealth: () => Promise<MediaHealth | null>; viewers?: number }) {
  const [h, setH] = React.useState<MediaHealth | null>(null);
  const [open, setOpen] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    const tick = async () => { const r = await getHealth(); if (alive) setH(r); };
    void tick();
    const id = window.setInterval(tick, 1500);
    return () => { alive = false; window.clearInterval(id); };
  }, [getHealth]);

  const rtt = h?.rttMs;
  const degraded = (rtt != null && rtt > 500) || (h?.loss != null && h.loss > 0.05) || (h?.fps != null && h.fps > 0 && h.fps < 12);
  const rttCls = rtt == null ? 'text-white/60' : rtt < 200 ? 'text-green-400' : rtt < 500 ? 'text-amber-400' : 'text-red-400';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="absolute right-3 top-3 grid h-8 w-8 place-items-center bg-black/55 text-white/80 backdrop-blur transition hover:bg-black/70" title="Show health (G)">
        <Gauge className="h-4 w-4" />
      </button>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(false)} title="Hide health (G)" className="absolute right-3 top-3 flex cursor-pointer items-center gap-2 bg-black/55 px-2.5 py-1.5 text-[11px] font-mono text-white/85 backdrop-blur transition hover:bg-black/65">
      <Activity className="h-3.5 w-3.5 text-[var(--color-cat-video)]" />
      <span className={rttCls}>{rtt != null ? `${rtt}ms` : '—'}</span>
      <span className="text-white/30">·</span>
      <span>{h?.fps != null ? `${h.fps}fps` : '—'}</span>
      <span className="text-white/30">·</span>
      <span>{h?.kbps != null ? `${h.kbps >= 1000 ? (h.kbps / 1000).toFixed(1) + 'M' : h.kbps + 'k'}bps` : '—'}</span>
      {h?.resolution && <><span className="text-white/30">·</span><span>{h.resolution}</span></>}
      {viewers != null && <><span className="text-white/30">·</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{viewers}</span></>}
      {degraded && <span className="ml-1 flex items-center gap-1 text-amber-400"><RotateCw className="h-3 w-3 animate-spin" />Optimizing</span>}
    </button>
  );
}

/** Compact keyboard-shortcut legend that fades after the session settles. */
function ShortcutHint({ items }: { items: [string, string][] }) {
  const [show, setShow] = React.useState(true);
  React.useEffect(() => { const id = window.setTimeout(() => setShow(false), 6000); return () => window.clearTimeout(id); }, []);
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
      {show && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 bg-black/55 px-2.5 py-1.5 text-[11px] text-white/80 backdrop-blur">
          {items.map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><kbd className="rounded bg-white/15 px-1 font-mono text-[11px]">{k}</kbd>{v}</span>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setShow((s) => !s)} className="grid h-8 w-8 place-items-center bg-black/55 text-white/80 backdrop-blur transition hover:bg-black/70" title="Keyboard shortcuts (?)">
        <Keyboard className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Toast that floats above the canvas (e.g. "Link copied to clipboard"). */
function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 bg-black/80 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg backdrop-blur">
      {text}
    </div>
  );
}

function Host() {
  // client-only (avoids hydration mismatch); keep the existing short code format
  const room = useRoomCode(null, () => Math.random().toString(36).slice(2, 10));
  const [state, setState] = React.useState<MediaState | null>(null);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [source, setSource] = React.useState<Source | null>(null);
  const [chat, setChat] = React.useState<ChatLine[]>([]);
  const [msg, setMsg] = React.useState('');
  const [name, setName] = React.useState('');
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [voiceOn, setVoiceOn] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [remoteHand, setRemoteHand] = React.useState(false);
  const [filename, setFilename] = React.useState<string>('');
  const [toast, setToast] = React.useState<string | null>(null);
  const [panic, setPanic] = React.useState(false); // privacy "blank the share" hold

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const wmStopRef = React.useRef<(() => void) | null>(null);
  // Owns the blob URL set on the local `<video>` when the user plays a file
  // (vs. screen/camera). We revoke it on next file load and on unmount.
  const fileUrlRef = React.useRef<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef('');
  nameRef.current = name || 'Host';
  const { guard, gate } = useUsageGate('watch');
  const { floaters, push: pushReaction } = useReactionFloaters();
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  // Server-attested session cap — counts ACROSS tabs and survives refresh.
  // Pro users are no-op (server returns expired:false). When expired, every
  // tab in the browser stops in lockstep via BroadcastChannel.
  useSessionCap(POLICY_KEY, {
    active: state === 'connected',
    onExpired: () => {
      const cap = freeCap(POLICY_KEY, 'session-minutes');
      const hit = checkLever(POLICY_KEY, 'session-minutes', cap + 0.01, false);
      if (hit) policyGate.fire(hit);
      stop();
    },
  });

  const link = room && typeof window !== 'undefined' ? `${window.location.origin}/watch?r=${room}` : '';

  React.useEffect(() => {
    if (!link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [link]);

  React.useEffect(() => () => {
    try { wmStopRef.current?.(); } catch { /* */ }
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (fileUrlRef.current) { try { URL.revokeObjectURL(fileUrlRef.current); } catch {} }
  }, []);

  React.useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [chat]);

  const toastTimer = React.useRef<number | null>(null);
  const flashToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  // The Loom "instant link" move applied live: the moment the broadcast goes
  // up, drop the watch link into the clipboard and confirm it with a toast,
  // so the host never hunts for a Copy button before inviting.
  const autoCopied = React.useRef(false);
  React.useEffect(() => {
    if (state === 'connecting' && !autoCopied.current && link) {
      autoCopied.current = true;
      navigator.clipboard?.writeText(link).then(() => flashToast('Watch link copied — share it')).catch(() => {});
    }
    if (state === null) autoCopied.current = false;
  }, [state, link, flashToast]);

  const handleIncoming = (text: string) => {
    // Cap peer-controlled strings: a viewer can otherwise freeze the host
    // with a 10MB chat blob, or OOM the tab by spamming reactions/messages.
    if (!isWire(text)) {
      const safe = text.length > 10_000 ? text.slice(0, 10_000) + '…' : text;
      setChat((c) => [...c, { mine: false, text: safe, name: 'Viewer', ts: Date.now() }].slice(-500));
      return;
    }
    const m = decodeWire(text);
    if (!m) return;
    if (m.t === 'chat') {
      const safeText = typeof m.text === 'string' ? (m.text.length > 10_000 ? m.text.slice(0, 10_000) + '…' : m.text) : '';
      const safeName = typeof m.name === 'string' ? m.name.slice(0, 64) : '';
      setChat((c) => [...c, { mine: false, text: safeText, name: safeName || 'Viewer', ts: m.ts || Date.now() }].slice(-500));
    }
    else if (m.t === 'rxn') pushReaction(typeof m.emoji === 'string' ? m.emoji.slice(0, 16) : '');
    else if (m.t === 'hand') setRemoteHand(m.up);
  };

  const startStream = async (src: Source) => {
    if (!(await guard())) return;
    try {
      let stream: MediaStream;
      if (src === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      } else if (src === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } else {
        fileInputRef.current?.click();
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play().catch(() => {}); }
      stream.getVideoTracks()[0]?.addEventListener('ended', stop);
      const { isWatermarkOn } = await import('@/lib/watermark/config');
      const { watermarkVideoStream } = await import('@/lib/watermark/stream-overlay');
      const wrapped = await watermarkVideoStream(stream, await isWatermarkOn());
      wmStopRef.current = wrapped.stop;
      peerRef.current = connectMedia('s', room, {
        localStream: wrapped.stream,
        onState: setState,
        onMessage: handleIncoming,
      });
      setSource(src);
    } catch { /* cancelled */ }
  };

  const playFile = async (file: File) => {
    if (!(await guard())) return;
    const v = videoRef.current;
    if (!v) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    v.srcObject = null;
    // Revoke any previous blob URL we owned. Previously every file change
    // leaked one URL (the browser eventually caps these and load fails).
    if (fileUrlRef.current) { try { URL.revokeObjectURL(fileUrlRef.current); } catch {} }
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    v.src = url;
    v.muted = true;
    // No crossOrigin on blob URLs — same-origin, and the flag can make Chrome
    // discard the audio track as tainted on some setups.
    v.load();
    await v.play().catch(() => {});
    setFilename(file.name);
    const stream = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.() ?? null;
    if (!stream) return;
    streamRef.current = stream;
    const { isWatermarkOn } = await import('@/lib/watermark/config');
    const { watermarkVideoStream } = await import('@/lib/watermark/stream-overlay');
    const wrapped = await watermarkVideoStream(stream, await isWatermarkOn());
    wmStopRef.current = wrapped.stop;
    peerRef.current = connectMedia('s', room, {
      localStream: wrapped.stream,
      onState: setState,
      onMessage: handleIncoming,
    });
    setSource('file');
  };

  const stop = () => {
    try { wmStopRef.current?.(); } catch { /* */ } wmStopRef.current = null;
    peerRef.current?.close(); peerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    setState(null);
    setSource(null);
    setFilename('');
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.removeAttribute('src'); videoRef.current.load(); }
    if (fileUrlRef.current) { try { URL.revokeObjectURL(fileUrlRef.current); } catch {} fileUrlRef.current = null; }
  };

  const sendChat = (text: string) => {
    const v = text.trim();
    if (!v || state !== 'connected') return;
    const ts = Date.now();
    peerRef.current?.send(encodeWire({ t: 'chat', text: v, name: nameRef.current, ts }));
    setChat((c) => [...c, { mine: true, text: v, name: nameRef.current, ts }]);
    setMsg('');
    setShowEmoji(false);
  };

  const sendReaction = (emoji: string) => {
    if (state !== 'connected') return;
    pushReaction(emoji);
    peerRef.current?.send(encodeWire({ t: 'rxn', emoji, name: nameRef.current }));
  };

  const toggleVoice = async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const at = stream.getAudioTracks();
    if (at.length) {
      const enabled = !at[0].enabled;
      at.forEach((t) => { t.enabled = enabled; });
      setVoiceOn(enabled);
      flashToast(enabled ? 'Mic on' : 'Mic muted');
    } else {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const t = mic.getAudioTracks()[0];
        stream.addTrack(t);
        setVoiceOn(true);
        flashToast('Mic on');
      } catch { /* */ }
    }
  };

  const toggleFs = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) { document.exitFullscreen(); setFullscreen(false); }
    else { void el.requestFullscreen(); setFullscreen(true); }
  };

  // Privacy panic-hide: instantly blank the OUTGOING video (replaces the sent
  // track with nothing) so a sudden notification/IM never leaks, while the
  // session stays live. Pressing again restores the source track.
  const togglePanic = React.useCallback(() => {
    const peer = peerRef.current;
    if (!peer || state !== 'connected') return;
    setPanic((p) => {
      const next = !p;
      const track = next ? null : (streamRef.current?.getVideoTracks()[0] ?? null);
      peer.replaceVideoTrack(track);
      flashToast(next ? 'Share hidden — viewers see a blank screen' : 'Share resumed');
      return next;
    });
  }, [state, flashToast]);

  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => flashToast('Watch link copied')).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const sharing = !!state;

  // Keyboard shortcuts for high-frequency actions (only while sharing, and not
  // while typing in the chat/name inputs). Matches the rival table-stakes.
  React.useEffect(() => {
    if (!sharing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') { e.preventDefault(); void toggleVoice(); }
      else if (k === 'f') { e.preventDefault(); toggleFs(); }
      else if (k === 'r') { e.preventDefault(); setShowEmoji((s) => !s); }
      else if (k === 'h') { e.preventDefault(); togglePanic(); }
      else if (k === 'escape' && document.fullscreenElement == null) { e.preventDefault(); stop(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, togglePanic]);

  return (
    <Shell
      title="Watch Studio"
      subtitle={`Sync watch · ${sharing ? `Live · ${state}` : 'Not started'}${filename ? ` · ${filename}` : ''}`}
      badge={<StatusPill state={state} source={source === 'file' ? 'video' : source} />}
    >
      {gate}
      {policyGate.element}
      <div className="text-[11px] text-[var(--color-fg-subtle)]"><FreeCapHint toolKey={POLICY_KEY} lever="participants" isPro={isPro} /> <FreeCapHint toolKey={POLICY_KEY} lever="session-minutes" isPro={isPro} /></div>
      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[1fr_320px]">
        <div ref={wrapRef} className="relative aspect-video min-h-0 overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          <video ref={videoRef} className={`absolute inset-0 h-full w-full object-contain transition-opacity ${panic ? 'opacity-0' : ''}`} playsInline controls={source === 'file'} />
          <Toast text={toast} />
          {panic && sharing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-center text-white/80">
              <EyeOff className="h-9 w-9" />
              <p className="text-[13px]">Share hidden — viewers see a blank screen</p>
              <button type="button" onClick={togglePanic} className="mt-1 bg-white/15 px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/25">Resume share</button>
            </div>
          )}
          {!sharing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <MonitorPlay className="h-10 w-10 text-white/40" />
              <p className="text-[13px] text-white/70">Pick a source to share with everyone in the room</p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => startStream('screen')} className="flex flex-col items-center gap-1 bg-[var(--color-cat-video)] px-4 py-3 text-[12px] font-semibold text-white transition hover:brightness-110">
                  <MonitorPlay className="h-5 w-5" />Screen
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 bg-cyan-600 px-4 py-3 text-[12px] font-semibold text-white transition hover:brightness-110">
                  <Film className="h-5 w-5" />Video file
                </button>
                <button type="button" onClick={() => startStream('camera')} className="flex flex-col items-center gap-1 bg-purple-600 px-4 py-3 text-[12px] font-semibold text-white transition hover:brightness-110">
                  <Smartphone className="h-5 w-5" />Camera
                </button>
              </div>
              <p className="max-w-xs text-[11px] leading-relaxed text-white/45">Your watch link is ready below — copy it now, or it auto-copies the instant you go live.</p>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void playFile(f); e.target.value = ''; }} />
            </div>
          )}
          {sharing && !panic && (
            <>
              <div className="absolute left-3 top-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                {state === 'connected'
                  ? <><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Live · viewer connected</>
                  : state === 'connecting'
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for a viewer to join…</>
                    : <><WifiOff className="h-3.5 w-3.5 text-amber-400" /> Reconnecting…</>}
              </div>
              {state === 'connected' && <HealthHUD getHealth={() => peerRef.current?.getHealth() ?? Promise.resolve(null)} />}
              {remoteHand && (
                <div className="absolute right-3 top-12 flex items-center gap-1.5 bg-yellow-500/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  <Hand className="h-3.5 w-3.5" /> Viewer raised
                </div>
              )}
              {(state === 'closed' || state === 'failed') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-center text-white/85 backdrop-blur-sm">
                  <RotateCw className="h-7 w-7 animate-spin" />
                  <p className="max-w-xs text-[13px]">Network dipped — holding the stream and reconnecting. Your viewers keep the last frame, not a black screen.</p>
                </div>
              )}
              <ReactionLayer floaters={floaters} />
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                <button type="button" onClick={toggleVoice} className={`grid h-10 w-10 place-items-center text-white transition ${voiceOn ? 'bg-green-600' : 'bg-black/55 hover:bg-black/70'}`} title="Mic to viewers (M)">
                  {voiceOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setShowEmoji((s) => !s)} className="grid h-10 w-10 place-items-center bg-black/55 text-white transition hover:bg-black/70" title="Reactions (R)">
                  <Smile className="h-4 w-4" />
                </button>
                <button type="button" onClick={togglePanic} className="grid h-10 w-10 place-items-center bg-black/55 text-white transition hover:bg-amber-600" title="Panic-hide share (H)">
                  <EyeOff className="h-4 w-4" />
                </button>
                <button type="button" onClick={toggleFs} className="grid h-10 w-10 place-items-center bg-black/55 text-white transition hover:bg-black/70" title="Fullscreen (F)">
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={stop} className="grid h-10 w-10 place-items-center bg-red-600 text-white transition hover:brightness-110" title="Stop sharing (Esc)">
                  <Square className="h-4 w-4" />
                </button>
              </div>
              {showEmoji && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded bg-black/85 p-2 shadow-2xl backdrop-blur">
                  <ReactionPicker onPick={(e) => { sendReaction(e); setShowEmoji(false); }} />
                </div>
              )}
              <ShortcutHint items={[['M', 'mute'], ['R', 'react'], ['H', 'hide'], ['F', 'full'], ['Esc', 'stop']]} />
            </>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-2">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Invite viewers</div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" className="mx-auto my-2 h-28 w-28 border border-black/[0.06] bg-white p-1" />
            )}
            <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">{link}</div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-fg-subtle)]"><Wifi className="h-3 w-3 text-green-600" /> Opens in any browser — no app, no account.</p>
          </div>

          <div className="flex min-h-[240px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <MessageSquare className="h-3 w-3" /> Watch chat
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="ml-auto w-20 border border-black/[0.08] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-right text-[11px] focus:outline-none" />
            </div>
            <div className="max-h-72 flex-1 space-y-1.5 overflow-y-auto p-3">
              {chat.length === 0 && (
                <p className="text-[12px] text-[var(--color-fg-subtle)]">{sharing ? 'Chat with your viewers while you watch.' : 'Start sharing to enable chat.'}</p>
              )}
              {chat.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : ''}`}>
                  <span className={`max-w-[85%] break-words px-2.5 py-1.5 text-[13px] ${m.mine ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05]'}`}>{m.text}</span>
                  <span className="mt-0.5 px-1 text-[11px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-black/[0.06] px-2 py-1.5">
              <ReactionPicker compact onPick={sendReaction} />
            </div>
            <div className="flex items-center gap-2 border-t border-black/[0.06] p-2">
              <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(msg); } }} disabled={state !== 'connected'} placeholder={state === 'connected' ? 'Message viewers…' : 'Waiting…'} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] focus:outline-none disabled:opacity-50" />
              <button type="button" onClick={() => sendChat(msg)} disabled={!msg.trim() || state !== 'connected'} className="grid h-8 w-8 shrink-0 place-items-center bg-[var(--color-cat-video)] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Viewer({ code }: { code: string }) {
  const [state, setState] = React.useState<MediaState>('connecting');
  const [chat, setChat] = React.useState<ChatLine[]>([]);
  const [msg, setMsg] = React.useState('');
  const [name, setName] = React.useState('');
  const [voiceOn, setVoiceOn] = React.useState(false);
  const [handUp, setHandUp] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [firstFrame, setFirstFrame] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0); // bumped to force a fresh connect
  const [toast, setToast] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef('');
  nameRef.current = name || 'Viewer';
  const { floaters, push: pushReaction } = useReactionFloaters();

  const toastTimer = React.useRef<number | null>(null);
  const flashToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  const handleIncoming = (text: string) => {
    // Cap peer-controlled strings — same defense as the host-side handler.
    if (!isWire(text)) {
      const safe = text.length > 10_000 ? text.slice(0, 10_000) + '…' : text;
      setChat((c) => [...c, { mine: false, text: safe, name: 'Host', ts: Date.now() }].slice(-500));
      return;
    }
    const m = decodeWire(text);
    if (!m) return;
    if (m.t === 'chat') {
      const safeText = typeof m.text === 'string' ? (m.text.length > 10_000 ? m.text.slice(0, 10_000) + '…' : m.text) : '';
      const safeName = typeof m.name === 'string' ? m.name.slice(0, 64) : '';
      setChat((c) => [...c, { mine: false, text: safeText, name: safeName || 'Host', ts: m.ts || Date.now() }].slice(-500));
    }
    else if (m.t === 'rxn') pushReaction(typeof m.emoji === 'string' ? m.emoji.slice(0, 16) : '');
  };

  React.useEffect(() => {
    setState('connecting');
    setFirstFrame(false);
    peerRef.current = connectMedia('r', code, {
      onState: setState,
      onRemoteStream: (stream) => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        // Reveal the player only once real pixels arrive — avoids the black
        // flash where "connected" beats the first decoded frame.
        v.onloadeddata = () => setFirstFrame(true);
        void v.play().catch(() => {});
      },
      onMessage: handleIncoming,
    });
    return () => { peerRef.current?.close(); micStreamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, retryKey]);

  React.useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [chat]);

  const sendChat = (text: string) => {
    const v = text.trim();
    if (!v || state !== 'connected') return;
    const ts = Date.now();
    peerRef.current?.send(encodeWire({ t: 'chat', text: v, name: nameRef.current, ts }));
    setChat((c) => [...c, { mine: true, text: v, name: nameRef.current, ts }]);
    setMsg('');
  };
  const sendReaction = (emoji: string) => {
    if (state !== 'connected') return;
    pushReaction(emoji);
    peerRef.current?.send(encodeWire({ t: 'rxn', emoji, name: nameRef.current }));
  };
  const toggleHand = () => {
    const up = !handUp;
    setHandUp(up);
    peerRef.current?.send(encodeWire({ t: 'hand', up, name: nameRef.current }));
    flashToast(up ? 'Hand raised' : 'Hand lowered');
  };
  const toggleVoice = async () => {
    if (voiceOn) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setVoiceOn(false);
      flashToast('Mic off');
      return;
    }
    try {
      const m = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = m;
      setVoiceOn(true);
      flashToast('Mic on');
    } catch { /* */ }
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    flashToast(v.muted ? 'Sound muted' : 'Sound on');
  };
  const toggleFs = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) { document.exitFullscreen(); setFullscreen(false); }
    else { void el.requestFullscreen(); setFullscreen(true); }
  };
  const retry = () => { peerRef.current?.close(); setRetryKey((k) => k + 1); };

  // Viewer keyboard shortcuts (skip while typing in chat/name fields).
  React.useEffect(() => {
    if (state !== 'connected') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') { e.preventDefault(); toggleMute(); }
      else if (k === 'f') { e.preventDefault(); toggleFs(); }
      else if (k === 'h') { e.preventDefault(); toggleHand(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, handUp, muted]);

  return (
    <Shell title="Watch Studio" subtitle={`Watching · ${state === 'connected' ? 'Live' : state}`} badge={<StatusPill state={state} />}>
      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[1fr_320px]">
        <div ref={wrapRef} className="relative aspect-video min-h-0 overflow-hidden border border-black/[0.08] bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline controls={false} />
          <Toast text={toast} />
          {(state !== 'connected' || !firstFrame) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
              {state === 'failed' ? (
                <>
                  <WifiOff className="h-9 w-9 text-amber-400" />
                  <div className="max-w-sm text-[14px]">Couldn&apos;t connect to the host. A VPN or privacy/ad-block extension can block the direct connection — try Incognito, another browser, or the same Wi-Fi.</div>
                  <button type="button" onClick={retry} className="mt-1 flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110">
                    <RotateCw className="h-4 w-4" /> Try again
                  </button>
                </>
              ) : state === 'closed' ? (
                <>
                  <RotateCw className="h-8 w-8 animate-spin" />
                  <div className="max-w-sm text-[14px]">Connection dropped — reconnecting…</div>
                  <button type="button" onClick={retry} className="mt-1 text-[12px] underline underline-offset-2 opacity-80 hover:opacity-100">Reconnect now</button>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <div className="max-w-sm text-[14px]">{state === 'connected' ? 'Connected — waiting for the first frame…' : "Connecting to the host's stream…"}</div>
                  <div className="text-[11px] opacity-60">No app or account needed — this opens right in your browser.</div>
                </>
              )}
            </div>
          )}
          {state === 'connected' && firstFrame && (
            <>
              <ReactionLayer floaters={floaters} />
              <HealthHUD getHealth={() => peerRef.current?.getHealth() ?? Promise.resolve(null)} />
              {handUp && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 bg-yellow-500/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  <Hand className="h-3.5 w-3.5" /> Hand raised
                </div>
              )}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                <button type="button" onClick={toggleMute} className="grid h-10 w-10 place-items-center bg-black/55 text-white transition hover:bg-black/70" title="Mute sound (M)">
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={toggleVoice} className={`grid h-10 w-10 place-items-center text-white transition ${voiceOn ? 'bg-green-600' : 'bg-black/55 hover:bg-black/70'}`} title="Talk back to host">
                  {voiceOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button type="button" onClick={toggleHand} className={`grid h-10 w-10 place-items-center text-white transition ${handUp ? 'bg-yellow-500 text-black' : 'bg-black/55 hover:bg-black/70'}`} title="Raise hand (H)">
                  <Hand className="h-4 w-4" />
                </button>
                <button type="button" onClick={toggleFs} className="grid h-10 w-10 place-items-center bg-black/55 text-white transition hover:bg-black/70" title="Fullscreen (F)">
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
              <ShortcutHint items={[['M', 'mute'], ['H', 'hand'], ['F', 'full']]} />
            </>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-2">
          <div className="flex min-h-[280px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <MessageSquare className="h-3 w-3" /> Watch chat
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="ml-auto w-20 border border-black/[0.08] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-right text-[11px] focus:outline-none" />
            </div>
            <div className="max-h-72 flex-1 space-y-1.5 overflow-y-auto p-3">
              {chat.length === 0 && <p className="text-[12px] text-[var(--color-fg-subtle)]">React, raise your hand, or send a message to the host.</p>}
              {chat.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : ''}`}>
                  <span className={`max-w-[85%] break-words px-2.5 py-1.5 text-[13px] ${m.mine ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05]'}`}>{m.text}</span>
                  <span className="mt-0.5 px-1 text-[11px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-black/[0.06] px-2 py-1.5">
              <ReactionPicker compact onPick={sendReaction} />
            </div>
            <div className="flex items-center gap-2 border-t border-black/[0.06] p-2">
              <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(msg); } }} disabled={state !== 'connected'} placeholder={state === 'connected' ? 'Message host…' : 'Waiting…'} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] focus:outline-none disabled:opacity-50" />
              <button type="button" onClick={() => sendChat(msg)} disabled={!msg.trim() || state !== 'connected'} className="grid h-8 w-8 shrink-0 place-items-center bg-[var(--color-cat-video)] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
