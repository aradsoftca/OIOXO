'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MonitorPlay, Copy, Check, Loader2, ShieldCheck, Smartphone, Square,
  MessageSquare, Send, Smile, Mic, MicOff, Hand, Play, Pause,
  Maximize2, Minimize2, Volume2, VolumeX, Users, Film,
} from 'lucide-react';
import { connectMedia, type MediaPeer, type MediaState } from '@/lib/p2p/media';
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

function Shell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-[1500px] flex-col gap-3 p-3 sm:p-4">
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.08] pb-3">
        <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-video)] text-white"><MonitorPlay className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold tracking-tight">{title}</h1>
          <p className="truncate text-[11px] text-[var(--color-fg-muted)]">{subtitle}</p>
        </div>
      </header>
      {children}
      <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-2 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
        <span>P2P encrypted — video, audio, chat, reactions all stream device-to-device.</span>
      </div>
    </div>
  );
}

function Host() {
  const [room] = React.useState(() => Math.random().toString(36).slice(2, 10));
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

  const link = typeof window !== 'undefined' ? `${window.location.origin}/watch?r=${room}` : '';

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
    } else {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const t = mic.getAudioTracks()[0];
        stream.addTrack(t);
        setVoiceOn(true);
      } catch { /* */ }
    }
  };

  const toggleFs = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) { document.exitFullscreen(); setFullscreen(false); }
    else { void el.requestFullscreen(); setFullscreen(true); }
  };

  const copy = () => {
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const sharing = !!state;

  return (
    <Shell title="Watch Studio" subtitle={`Sync watch · ${sharing ? `Live · ${state}` : 'Not started'}${filename ? ` · ${filename}` : ''}`}>
      {gate}
      {policyGate.element}
      <div className="text-[10px] text-[var(--color-fg-subtle)]"><FreeCapHint toolKey={POLICY_KEY} lever="participants" isPro={isPro} /> <FreeCapHint toolKey={POLICY_KEY} lever="session-minutes" isPro={isPro} /></div>
      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[1fr_320px]">
        <div ref={wrapRef} className="relative aspect-video min-h-0 overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline controls={source === 'file'} />
          {!sharing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <MonitorPlay className="h-10 w-10 text-white/40" />
              <p className="text-[13px] text-white/70">Pick a source to share with everyone in the room</p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => startStream('screen')} className="flex flex-col items-center gap-1 bg-[var(--color-cat-video)] px-4 py-3 text-[12px] font-semibold text-white">
                  <MonitorPlay className="h-5 w-5" />Screen
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 bg-cyan-600 px-4 py-3 text-[12px] font-semibold text-white">
                  <Film className="h-5 w-5" />Video file
                </button>
                <button type="button" onClick={() => startStream('camera')} className="flex flex-col items-center gap-1 bg-purple-600 px-4 py-3 text-[12px] font-semibold text-white">
                  <Smartphone className="h-5 w-5" />Camera
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void playFile(f); e.target.value = ''; }} />
            </div>
          )}
          {sharing && (
            <>
              <div className="absolute left-3 top-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                {state === 'connected' ? <><Check className="h-3.5 w-3.5 text-green-400" /> Viewer joined</> : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting…</>}
              </div>
              {remoteHand && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 bg-yellow-500/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  <Hand className="h-3.5 w-3.5" /> Viewer raised
                </div>
              )}
              <ReactionLayer floaters={floaters} />
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                <button type="button" onClick={toggleVoice} className={`grid h-10 w-10 place-items-center text-white ${voiceOn ? 'bg-green-600' : 'bg-black/55'}`} title="Voice party">
                  {voiceOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setShowEmoji((s) => !s)} className="grid h-10 w-10 place-items-center bg-black/55 text-white" title="Reactions">
                  <Smile className="h-4 w-4" />
                </button>
                <button type="button" onClick={toggleFs} className="grid h-10 w-10 place-items-center bg-black/55 text-white" title="Fullscreen">
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={stop} className="grid h-10 w-10 place-items-center bg-red-600 text-white" title="Stop">
                  <Square className="h-4 w-4" />
                </button>
              </div>
              {showEmoji && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded bg-black/85 p-2 shadow-2xl backdrop-blur">
                  <ReactionPicker onPick={(e) => { sendReaction(e); setShowEmoji(false); }} />
                </div>
              )}
            </>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-2">
          {sharing && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Invite viewers</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR" className="mx-auto my-2 h-28 w-28 border border-black/[0.06] bg-white p-1" />
              )}
              <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2 text-[11px] font-bold uppercase tracking-wider text-white">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[9px] text-[var(--color-fg-muted)]">{link}</div>
            </div>
          )}

          <div className="flex min-h-[240px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <MessageSquare className="h-3 w-3" /> Watch chat
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="ml-auto w-20 border border-black/[0.08] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-right text-[10px] focus:outline-none" />
            </div>
            <div className="max-h-72 flex-1 space-y-1.5 overflow-y-auto p-3">
              {chat.length === 0 && (
                <p className="text-[12px] text-[var(--color-fg-subtle)]">{sharing ? 'Chat with your viewers while you watch.' : 'Start sharing to enable chat.'}</p>
              )}
              {chat.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : ''}`}>
                  <span className={`max-w-[85%] break-words px-2.5 py-1.5 text-[13px] ${m.mine ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05]'}`}>{m.text}</span>
                  <span className="mt-0.5 px-1 text-[9px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</span>
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

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef('');
  nameRef.current = name || 'Viewer';
  const { floaters, push: pushReaction } = useReactionFloaters();

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
    peerRef.current = connectMedia('r', code, {
      onState: setState,
      onRemoteStream: (stream) => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); } },
      onMessage: handleIncoming,
    });
    return () => { peerRef.current?.close(); micStreamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

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
  };
  const toggleVoice = async () => {
    if (voiceOn) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setVoiceOn(false);
      return;
    }
    try {
      const m = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = m;
      setVoiceOn(true);
    } catch { /* */ }
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const toggleFs = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) { document.exitFullscreen(); setFullscreen(false); }
    else { void el.requestFullscreen(); setFullscreen(true); }
  };

  return (
    <Shell title="Watch Studio" subtitle={`Watching · ${state === 'connected' ? 'Live' : state}`}>
      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[1fr_320px]">
        <div ref={wrapRef} className="relative aspect-video min-h-0 overflow-hidden border border-black/[0.08] bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline controls={false} />
          {state !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/70">
              <Loader2 className="h-8 w-8 animate-spin" />
              <div className="max-w-sm text-[14px]">{state === 'failed' ? "Couldn't connect — VPNs or ad-blockers can block WebRTC." : "Connecting to host's stream…"}</div>
            </div>
          )}
          {state === 'connected' && (
            <>
              <ReactionLayer floaters={floaters} />
              {handUp && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 bg-yellow-500/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  <Hand className="h-3.5 w-3.5" /> Hand raised
                </div>
              )}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                <button type="button" onClick={toggleMute} className="grid h-10 w-10 place-items-center bg-black/55 text-white" title="Mute">
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={toggleVoice} className={`grid h-10 w-10 place-items-center text-white ${voiceOn ? 'bg-green-600' : 'bg-black/55'}`} title="Talk back">
                  {voiceOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button type="button" onClick={toggleHand} className={`grid h-10 w-10 place-items-center text-white ${handUp ? 'bg-yellow-500 text-black' : 'bg-black/55'}`} title="Raise hand">
                  <Hand className="h-4 w-4" />
                </button>
                <button type="button" onClick={toggleFs} className="grid h-10 w-10 place-items-center bg-black/55 text-white" title="Fullscreen">
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-2">
          <div className="flex min-h-[280px] flex-1 flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <MessageSquare className="h-3 w-3" /> Watch chat
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="ml-auto w-20 border border-black/[0.08] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-right text-[10px] focus:outline-none" />
            </div>
            <div className="max-h-72 flex-1 space-y-1.5 overflow-y-auto p-3">
              {chat.length === 0 && <p className="text-[12px] text-[var(--color-fg-subtle)]">React, raise your hand, or send a message to the host.</p>}
              {chat.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : ''}`}>
                  <span className={`max-w-[85%] break-words px-2.5 py-1.5 text-[13px] ${m.mine ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05]'}`}>{m.text}</span>
                  <span className="mt-0.5 px-1 text-[9px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</span>
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
