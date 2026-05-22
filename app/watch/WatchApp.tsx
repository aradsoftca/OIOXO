'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { MonitorPlay, Copy, Check, Loader2, ShieldCheck, Smartphone, Square } from 'lucide-react';
import { connectMedia, type MediaPeer, type MediaState } from '@/lib/p2p/media';

export default function WatchApp() {
  const params = useSearchParams();
  const room = params.get('r');
  return room ? <Viewer code={room} /> : <Host />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-video)] text-white"><MonitorPlay className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Live Screen Share</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Show your screen to anyone with the link. Peer-to-peer — nothing through a server.</p>
        </div>
      </header>
      {children}
      <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
        <span>The video streams directly between the two devices over an encrypted connection. It never passes through or is stored on our servers.</span>
      </div>
    </div>
  );
}

function Host() {
  const [room] = React.useState(() => Math.random().toString(36).slice(2, 10));
  const [state, setState] = React.useState<MediaState | null>(null);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/watch?r=${room}` : '';

  React.useEffect(() => {
    if (!link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [link]);

  React.useEffect(() => () => { peerRef.current?.close(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play().catch(() => {}); }
      stream.getVideoTracks()[0]?.addEventListener('ended', stop);
      peerRef.current = connectMedia('s', room, { localStream: stream, onState: setState });
    } catch { /* cancelled */ }
  };

  const stop = () => {
    peerRef.current?.close(); peerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    setState(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const copy = () => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const sharing = !!state;

  return (
    <Shell>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline />
          {!sharing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <MonitorPlay className="h-10 w-10 text-white/40" />
              <button type="button" onClick={start} className="flex items-center gap-2 bg-[var(--color-cat-video)] px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-110">
                <MonitorPlay className="h-4 w-4" /> Start sharing my screen
              </button>
            </div>
          )}
          {sharing && (
            <div className="absolute left-3 top-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
              {state === 'connected' ? <><Check className="h-3.5 w-3.5 text-green-400" /> Viewer connected</> : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for viewer…</>}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          {sharing ? (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Send to a viewer</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR" className="mx-auto my-3 h-40 w-40 border border-black/[0.06] bg-white p-1" />
              )}
              <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
              <button type="button" onClick={stop} className="mt-3 flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]"><Square className="h-3.5 w-3.5" /> Stop sharing</button>
            </div>
          ) : (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">Click “Start sharing”, pick a screen/window/tab, then send the link that appears here to your viewer.</div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Viewer({ code }: { code: string }) {
  const [state, setState] = React.useState<MediaState>('connecting');
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);

  React.useEffect(() => {
    peerRef.current = connectMedia('r', code, {
      onState: setState,
      onRemoteStream: (stream) => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); } },
    });
    return () => peerRef.current?.close();
  }, [code]);

  return (
    <Shell>
      <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-black">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline controls />
        {state !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/70">
            <Loader2 className="h-8 w-8 animate-spin" />
            <div className="max-w-sm text-[14px]">{state === 'failed' ? 'Couldn’t connect. A VPN or privacy/ad-block extension may be blocking WebRTC — try Incognito, another browser, or the same Wi-Fi.' : 'Connecting to the host’s screen…'}</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
