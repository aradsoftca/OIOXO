'use client';

import * as React from 'react';
import { Camera, Mic, Play, Square, CameraOff, Download, RefreshCw } from 'lucide-react';

interface Dev { deviceId: string; label: string }

export default function WebcamTestTool() {
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState('');
  const [cams, setCams] = React.useState<Dev[]>([]);
  const [mics, setMics] = React.useState<Dev[]>([]);
  const [camId, setCamId] = React.useState('');
  const [micId, setMicId] = React.useState('');
  const [info, setInfo] = React.useState('');
  const [level, setLevel] = React.useState(0);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number>(0);

  const stop = React.useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setRunning(false); setLevel(0); setInfo('');
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  const refreshDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setCams(list.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })));
      setMics(list.filter((d) => d.kind === 'audioinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
    } catch { /* ignore */ }
  };

  const start = React.useCallback(async (cam = camId, mic = micId) => {
    setError('');
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cam ? { deviceId: { exact: cam } } : true,
        audio: mic ? { deviceId: { exact: mic } } : true,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); }
      setRunning(true);
      await refreshDevices(); // labels now available after permission

      const track = stream.getVideoTracks()[0];
      const s = track?.getSettings();
      if (s) setInfo(`${s.width ?? '?'}×${s.height ?? '?'}${s.frameRate ? ` · ${Math.round(s.frameRate)}fps` : ''}`);

      // Mic level meter
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'NotAllowedError' ? 'Permission denied — allow camera/microphone access and try again.'
        : err.name === 'NotFoundError' ? 'No camera or microphone found.' : err.message || 'Could not start.');
    }
  }, [camId, micId, stop]);

  const snapshot = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `snapshot-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  if (!supported) {
    return <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[14px] text-[var(--color-fg-muted)]">Your browser doesn’t support camera/microphone access.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline muted />
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <CameraOff className="h-10 w-10 text-white/40" />
              <div className="text-[14px] text-white/60">Camera preview appears here</div>
            </div>
          )}
          {running && info && (
            <div className="absolute bottom-3 right-3 bg-black/60 px-3 py-1.5 font-mono text-[11px] text-white/80 backdrop-blur">{info}</div>
          )}
        </div>
        {error && <div className="text-[13px] text-red-600">{error}</div>}
      </div>

      <aside className="space-y-4">
        {(cams.length > 0 || mics.length > 0) && (
          <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            {cams.length > 0 && (
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Camera</span>
                <select value={camId} onChange={(e) => { setCamId(e.target.value); if (running) void start(e.target.value, micId); }}
                  className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none">
                  {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </label>
            )}
            {mics.length > 0 && (
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Microphone</span>
                <select value={micId} onChange={(e) => { setMicId(e.target.value); if (running) void start(camId, e.target.value); }}
                  className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none">
                  {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]"><Mic className="h-3.5 w-3.5" /> Mic level</div>
          <div className="mt-2 h-3 w-full overflow-hidden bg-black/[0.08]">
            <div className="h-full bg-[var(--color-cat-video)] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{running ? 'Speak — the bar should move.' : 'Start the test to see your mic level.'}</p>
        </div>

        {!running ? (
          <button type="button" onClick={() => void start()} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110">
            <Play className="h-4 w-4" /> Start camera & mic
          </button>
        ) : (
          <>
            <button type="button" onClick={snapshot} className="flex w-full items-center justify-center gap-2 bg-[var(--color-fg)] py-3 text-[13px] font-semibold text-[var(--color-canvas)] transition hover:opacity-90">
              <Download className="h-4 w-4" /> Save snapshot
            </button>
            <button type="button" onClick={stop} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]">
              <Square className="h-4 w-4" /> Stop
            </button>
          </>
        )}
        <button type="button" onClick={refreshDevices} className="flex w-full items-center justify-center gap-2 text-[11px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
          <RefreshCw className="h-3 w-3" /> Refresh device list
        </button>

        <div className="flex items-start gap-2 bg-black/[0.03] px-3 py-2.5 text-[11px] text-[var(--color-fg-muted)]">
          <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-cat-video)]" />
          <span>The preview and snapshot stay entirely on your device — nothing is recorded or uploaded.</span>
        </div>
      </aside>
    </div>
  );
}
