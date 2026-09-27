'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { MonitorPlay, Copy, Check, Loader2, ShieldCheck, Smartphone, Square, WifiOff, RotateCw, Wifi } from 'lucide-react';
import { connectMedia, type MediaPeer, type MediaState } from '@/lib/p2p/media';
import { useUsageGate } from '@/components/usage/use-usage-gate';

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
  const [toast, setToast] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const wmStopRef = React.useRef<(() => void) | null>(null);
  const { guard, gate } = useUsageGate('watch');

  const link = typeof window !== 'undefined' ? `${window.location.origin}/watch?r=${room}` : '';

  React.useEffect(() => {
    if (!link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [link]);

  const toastTimer = React.useRef<number | null>(null);
  const flashToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  // Loom-style instant link: the moment the share goes up, copy the watch link
  // and confirm with a toast so the host never hunts for a button to invite.
  const autoCopied = React.useRef(false);
  React.useEffect(() => {
    if (state === 'connecting' && !autoCopied.current && link) {
      autoCopied.current = true;
      navigator.clipboard?.writeText(link).then(() => flashToast('Watch link copied — share it')).catch(() => {});
    }
    if (state === null) autoCopied.current = false;
  }, [state, link, flashToast]);

  React.useEffect(() => () => {
    // Stop the watermark RAF loop too — without this the requestAnimationFrame
    // that composites the brand badge keeps running after the user leaves,
    // burning a frame's worth of CPU forever.
    try { wmStopRef.current?.(); } catch { /* */ } wmStopRef.current = null;
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    if (!(await guard())) return; // count lever — the sharer (host) is metered; viewers are free
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play().catch(() => {}); }
      stream.getVideoTracks()[0]?.addEventListener('ended', stop);
      // Free → composite "Powered by xonvert.com" into the shared video (defensive:
      // returns the raw stream on any issue, so the share never breaks).
      const { isWatermarkOn } = await import('@/lib/watermark/config');
      const { watermarkVideoStream } = await import('@/lib/watermark/stream-overlay');
      const wrapped = await watermarkVideoStream(stream, await isWatermarkOn());
      wmStopRef.current = wrapped.stop;
      peerRef.current = connectMedia('s', room, { localStream: wrapped.stream, onState: setState });
    } catch { /* cancelled */ }
  };

  const stop = () => {
    try { wmStopRef.current?.(); } catch { /* */ } wmStopRef.current = null;
    peerRef.current?.close(); peerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    setState(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => flashToast('Watch link copied')).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const sharing = !!state;

  return (
    <Shell>
      {gate}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline />
          {toast && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 bg-black/80 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg backdrop-blur">{toast}</div>
          )}
          {!sharing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <MonitorPlay className="h-10 w-10 text-white/40" />
              <button type="button" onClick={start} className="flex items-center gap-2 bg-[var(--color-cat-video)] px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-110">
                <MonitorPlay className="h-4 w-4" /> Start sharing my screen
              </button>
              <p className="max-w-xs text-[11px] text-white/45">Your watch link auto-copies the instant you go live.</p>
            </div>
          )}
          {sharing && (
            <>
              <div className="absolute left-3 top-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] text-white backdrop-blur">
                {state === 'connected'
                  ? <><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Live · viewer connected</>
                  : state === 'connecting'
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for viewer…</>
                    : <><WifiOff className="h-3.5 w-3.5 text-amber-400" /> Reconnecting…</>}
              </div>
              {(state === 'closed' || state === 'failed') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-center text-white/85 backdrop-blur-sm">
                  <RotateCw className="h-7 w-7 animate-spin" />
                  <p className="max-w-xs text-[13px]">Network dipped — holding the stream and reconnecting. Your viewer keeps the last frame, not a black screen.</p>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Send to a viewer</div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" className="mx-auto my-3 h-40 w-40 border border-black/[0.06] bg-white p-1" />
            )}
            <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">{link}</div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-fg-subtle)]"><Wifi className="h-3 w-3 text-green-600" /> Opens in any browser — no app, no account.</p>
            {sharing ? (
              <button type="button" onClick={stop} className="mt-3 flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]"><Square className="h-3.5 w-3.5" /> Stop sharing</button>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">Click “Start sharing”, pick a screen/window/tab, and this link goes live for your viewer.</p>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Viewer({ code }: { code: string }) {
  const [state, setState] = React.useState<MediaState>('connecting');
  const [firstFrame, setFirstFrame] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const peerRef = React.useRef<MediaPeer | null>(null);

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
    });
    return () => peerRef.current?.close();
  }, [code, retryKey]);

  const retry = () => { peerRef.current?.close(); setRetryKey((k) => k + 1); };

  return (
    <Shell>
      <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-black">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline controls />
        {(state !== 'connected' || !firstFrame) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
            {state === 'failed' ? (
              <>
                <WifiOff className="h-9 w-9 text-amber-400" />
                <div className="max-w-sm text-[14px]">Couldn&apos;t connect. A VPN or privacy/ad-block extension may be blocking the direct connection — try Incognito, another browser, or the same Wi-Fi.</div>
                <button type="button" onClick={retry} className="mt-1 flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"><RotateCw className="h-4 w-4" /> Try again</button>
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
                <div className="max-w-sm text-[14px]">{state === 'connected' ? 'Connected — waiting for the first frame…' : 'Connecting to the host’s screen…'}</div>
                <div className="text-[11px] opacity-60">No app or account needed — this opens right in your browser.</div>
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
