'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Video, VideoOff, Mic, MicOff, Phone, Copy, Check, Loader2, ShieldCheck, Smartphone, Send, MessageSquare, Square } from 'lucide-react';
import { connectMedia, type MediaPeer, type MediaState } from '@/lib/p2p/media';

/** Draw a video frame into a box, preserving aspect ratio (letterboxed). */
function drawContain(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  if (!v.videoWidth) return;
  const vr = v.videoWidth / v.videoHeight;
  let dw = w, dh = h;
  if (vr > w / h) dh = w / vr; else dw = h * vr;
  ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export default function CallApp() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const [room] = React.useState(() => joinCode || Math.random().toString(36).slice(2, 10));
  // Voice-only call (no camera) when launched as /call?audio=1. A joiner inherits
  // the mode from the invite link, which also carries &audio=1.
  const audioOnly = params.get('audio') === '1';
  const label = audioOnly ? 'Voice Call' : 'Video Call';

  const [state, setState] = React.useState<MediaState>('connecting');
  const [started, setStarted] = React.useState(false);
  const [camOn, setCamOn] = React.useState(!audioOnly);
  const [micOn, setMicOn] = React.useState(true);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [chat, setChat] = React.useState<{ mine: boolean; text: string }[]>([]);
  const [msg, setMsg] = React.useState('');
  const [recording, setRecording] = React.useState(false);

  const localRef = React.useRef<HTMLVideoElement>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recRafRef = React.useRef(0);
  const recCtxRef = React.useRef<AudioContext | null>(null);
  const remoteRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/call?r=${room}${audioOnly ? '&audio=1' : ''}` : '';

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  React.useEffect(() => () => {
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { recorderRef.current?.stop(); } catch { /* */ }
    cancelAnimationFrame(recRafRef.current);
    try { recCtxRef.current?.close(); } catch { /* */ }
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: !audioOnly, audio: true });
      streamRef.current = stream;
      if (localRef.current) { localRef.current.srcObject = stream; localRef.current.muted = true; void localRef.current.play().catch(() => {}); }
      setStarted(true);
      peerRef.current = connectMedia(role, room, {
        localStream: stream,
        onState: setState,
        onRemoteStream: (rs) => { if (remoteRef.current) { remoteRef.current.srcObject = rs; void remoteRef.current.play().catch(() => {}); } },
        onMessage: (t) => setChat((c) => [...c, { mine: false, text: t }]),
      });
    } catch { /* permission denied */ }
  };

  const sendMsg = (text: string) => {
    const v = text.trim();
    if (!v || state !== 'connected') return;
    peerRef.current?.send(v);
    setChat((c) => [...c, { mine: true, text: v }]);
    setMsg('');
  };
  React.useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [chat]);

  // --- Record the call: mix both audio tracks + composite both videos to a
  //     canvas, then MediaRecorder → downloadable .webm. Audio-only records audio.
  const startRec = () => {
    try {
      const ctx = new AudioContext(); recCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      const addAudio = (s: MediaStream | null) => {
        const at = s?.getAudioTracks() ?? [];
        if (at.length) { try { ctx.createMediaStreamSource(new MediaStream(at)).connect(dest); } catch { /* */ } }
      };
      addAudio(streamRef.current);
      addAudio((remoteRef.current?.srcObject as MediaStream) ?? null);

      let tracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()];
      if (!audioOnly) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280; canvas.height = 720;
        const cctx = canvas.getContext('2d')!;
        const draw = () => {
          cctx.fillStyle = '#000'; cctx.fillRect(0, 0, canvas.width, canvas.height);
          if (remoteRef.current) drawContain(cctx, remoteRef.current, 0, 0, canvas.width, canvas.height);
          if (localRef.current?.videoWidth) {
            const w = canvas.width * 0.24, h = w * (localRef.current.videoHeight / localRef.current.videoWidth);
            cctx.drawImage(localRef.current, canvas.width - w - 24, canvas.height - h - 24, w, h);
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
        const a = document.createElement('a'); a.href = url; a.download = `xonvert-${audioOnly ? 'voice' : 'call'}-${Date.now()}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      };
      recorderRef.current = rec; rec.start(); setRecording(true);
    } catch { /* recording unsupported */ }
  };
  const stopRec = () => { try { recorderRef.current?.stop(); } catch { /* */ } setRecording(false); };
  const toggleRec = () => (recording ? stopRec() : startRec());

  const toggleCam = () => { const t = streamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); } };
  const toggleMic = () => { const t = streamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); } };
  const hangup = () => { peerRef.current?.close(); streamRef.current?.getTracks().forEach((t) => t.stop()); window.location.href = '/call'; };
  const copy = () => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-video)] text-white">{audioOnly ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />}</div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">{label}</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">One link, no sign-up. Encrypted peer-to-peer — nothing through a server.</p>
        </div>
      </header>

      {!started ? (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center">
          {audioOnly ? <Phone className="mx-auto h-10 w-10 text-[var(--color-cat-video)]" /> : <Video className="mx-auto h-10 w-10 text-[var(--color-cat-video)]" />}
          <p className="mx-auto mt-3 max-w-md text-[14px] text-[var(--color-fg-muted)]">
            {role === 's' ? 'Start a call, then share the link that appears with the person you want to talk to.' : 'You were invited to a call. Join to connect.'}
          </p>
          <button type="button" onClick={start} className="mx-auto mt-5 flex items-center gap-2 bg-[var(--color-cat-video)] px-6 py-3 text-[14px] font-semibold text-white transition hover:brightness-110">
            {audioOnly ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />} {role === 's' ? `Start ${audioOnly ? 'voice ' : ''}call` : 'Join call'}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className={`relative overflow-hidden border border-black/[0.08] ${audioOnly ? 'aspect-video bg-gradient-to-b from-[#1a1f2e] to-black' : 'aspect-video bg-black'}`}>
            {/* Remote video (hidden in voice-only; audio still plays via this element) */}
            <video ref={remoteRef} className={`absolute inset-0 h-full w-full object-contain ${audioOnly ? 'invisible' : ''}`} playsInline />
            {audioOnly && state === 'connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/90">
                <div className="relative grid h-24 w-24 place-items-center rounded-full bg-[var(--color-cat-video)]/30">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-cat-video)]/20" />
                  <Phone className="h-9 w-9" />
                </div>
                <div className="text-[14px] font-medium">Connected — voice call</div>
              </div>
            )}
            {state !== 'connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/70">
                <Loader2 className="h-8 w-8 animate-spin" />
                <div className="max-w-sm text-[14px]">{state === 'failed' ? 'Couldn’t connect. A VPN or privacy/ad-block extension may be blocking WebRTC — try Incognito, another browser, or the same Wi-Fi.' : role === 's' ? 'Waiting for the other person…' : 'Connecting…'}</div>
              </div>
            )}
            {/* local PiP — camera only */}
            {!audioOnly && <video ref={localRef} className="absolute bottom-3 right-3 h-28 w-44 border border-white/20 object-cover" playsInline muted />}
            {/* recording badge */}
            {recording && (
              <div className="absolute left-3 top-3 flex items-center gap-1.5 bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Rec
              </div>
            )}
            {/* controls */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
              <button type="button" onClick={toggleMic} className={`grid h-11 w-11 place-items-center text-white ${micOn ? 'bg-black/55' : 'bg-red-600'}`}>{micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</button>
              {!audioOnly && <button type="button" onClick={toggleCam} className={`grid h-11 w-11 place-items-center text-white ${camOn ? 'bg-black/55' : 'bg-red-600'}`}>{camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}</button>}
              <button type="button" onClick={toggleRec} title={recording ? 'Stop recording' : 'Record call'} className={`grid h-11 w-11 place-items-center text-white ${recording ? 'bg-red-600' : 'bg-black/55'}`}>{recording ? <Square className="h-4 w-4" /> : <span className="h-3.5 w-3.5 rounded-full bg-red-500" />}</button>
              <button type="button" onClick={hangup} className="grid h-11 w-11 place-items-center bg-red-600 text-white"><Phone className="h-5 w-5 rotate-[135deg]" /></button>
            </div>
          </div>

          <aside className="space-y-3">
            {role === 's' && state !== 'connected' && (
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Invite someone</div>
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR" className="mx-auto my-3 h-40 w-40 border border-black/[0.06] bg-white p-1" />
                )}
                <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy invite link'}
                </button>
                <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
              </div>
            )}
            {/* In-call chat — text + emoji over the encrypted data channel */}
            <div className="flex flex-col border border-black/[0.08] bg-[var(--color-surface-1)]">
              <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                <MessageSquare className="h-3.5 w-3.5" /> Chat
              </div>
              <div className="max-h-72 min-h-[120px] flex-1 space-y-1.5 overflow-y-auto p-3">
                {chat.length === 0 && (
                  <p className="text-[12px] text-[var(--color-fg-subtle)]">{state === 'connected' ? 'Say hi — send a message or emoji.' : 'Chat opens once you’re connected.'}</p>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`flex ${m.mine ? 'justify-end' : ''}`}>
                    <span className={`max-w-[85%] break-words px-2.5 py-1.5 text-[13px] leading-snug ${m.mine ? 'bg-[var(--color-cat-video)] text-white' : 'bg-black/[0.05] text-[var(--color-fg)]'}`}>{m.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex flex-wrap gap-0.5 border-t border-black/[0.06] px-2 py-1.5">
                {['👍', '❤️', '😂', '🎉', '👏', '🔥', '🙌', '😮'].map((e) => (
                  <button key={e} type="button" onClick={() => sendMsg(e)} disabled={state !== 'connected'} className="px-1 text-[18px] transition hover:scale-125 disabled:opacity-40">{e}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-black/[0.06] p-2">
                <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMsg(msg); } }} disabled={state !== 'connected'} placeholder={state === 'connected' ? 'Message…' : 'Connecting…'} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] text-[var(--color-fg)] focus:outline-none disabled:opacity-50" />
                <button type="button" onClick={() => sendMsg(msg)} disabled={!msg.trim() || state !== 'connected'} className="grid h-8 w-8 shrink-0 place-items-center bg-[var(--color-cat-video)] text-white transition hover:brightness-110 disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
              <span>Audio and video stream directly between both devices over an encrypted connection — never through our servers.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
