'use client';

import * as React from 'react';
import { Monitor, Mic, MicOff, Circle, Square, Download, RotateCcw } from 'lucide-react';

function pickMime(): string {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function ScreenRecorderTool() {
  const [supported] = React.useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);
  const [withMic, setWithMic] = React.useState(false);
  const [state, setState] = React.useState<'idle' | 'recording' | 'done'>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [outUrl, setOutUrl] = React.useState('');
  const [ext, setExt] = React.useState('webm');
  const [error, setError] = React.useState('');

  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamsRef = React.useRef<MediaStream[]>([]);
  const livePreviewRef = React.useRef<HTMLVideoElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStreams = () => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
  };

  React.useEffect(() => () => {
    cleanupStreams();
    if (timerRef.current) clearInterval(timerRef.current);
    if (outUrl) URL.revokeObjectURL(outUrl);
  }, [outUrl]);

  const start = async () => {
    setError('');
    if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(''); }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // system/tab audio when the user shares it
      });
      streamsRef.current.push(display);

      const tracks = [...display.getVideoTracks(), ...display.getAudioTracks()];
      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(mic);
          tracks.push(...mic.getAudioTracks());
        } catch { /* user denied mic — continue with system audio only */ }
      }
      const combined = new MediaStream(tracks);

      if (livePreviewRef.current) {
        livePreviewRef.current.srcObject = combined;
        livePreviewRef.current.muted = true;
        void livePreviewRef.current.play().catch(() => {});
      }

      const mimeType = pickMime();
      setExt(mimeType.includes('mp4') ? 'mp4' : 'webm');
      const rec = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        setOutUrl(URL.createObjectURL(blob));
        setState('done');
        cleanupStreams();
        if (timerRef.current) clearInterval(timerRef.current);
      };
      // If the user clicks the browser's native "Stop sharing", end cleanly.
      display.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      });

      recRef.current = rec;
      rec.start();
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotAllowedError') setError('Permission denied — screen sharing was cancelled.');
      else setError(err.message || 'Could not start recording.');
      cleanupStreams();
    }
  };

  const stop = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  };

  const reset = () => {
    if (outUrl) URL.revokeObjectURL(outUrl);
    setOutUrl(''); setState('idle'); setElapsed(0);
  };

  const download = () => {
    if (!outUrl) return;
    const a = document.createElement('a');
    a.href = outUrl;
    a.download = `screen-recording-${Date.now()}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (!supported) {
    return (
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[14px] text-[var(--color-fg-muted)]">
        Your browser doesn’t support screen recording. Try the latest Chrome, Edge or Firefox on desktop.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          {state === 'done' && outUrl ? (
            <video src={outUrl} controls className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <video ref={livePreviewRef} className="absolute inset-0 h-full w-full object-contain" playsInline />
          )}

          {state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <Monitor className="h-10 w-10 text-white/40" />
              <div className="text-[14px] text-white/60">Your recording previews here</div>
            </div>
          )}

          {state === 'recording' && (
            <div className="absolute left-3 top-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur">
              <Circle className="h-3 w-3 animate-pulse fill-red-500 text-red-500" />
              REC <span className="font-mono">{fmtTime(elapsed)}</span>
            </div>
          )}
        </div>
        {error && <div className="text-[13px] text-red-600">{error}</div>}
      </div>

      <aside className="space-y-4">
        <label className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-fg)]">
            {withMic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} Include microphone
          </span>
          <input type="checkbox" checked={withMic} disabled={state === 'recording'} onChange={(e) => setWithMic(e.target.checked)} className="h-4 w-4" />
        </label>

        {state !== 'recording' ? (
          <button type="button" onClick={start}
            className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110">
            <Circle className="h-4 w-4 fill-current" /> {state === 'done' ? 'Record again' : 'Start recording'}
          </button>
        ) : (
          <button type="button" onClick={stop}
            className="flex w-full items-center justify-center gap-2 bg-red-600 py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110">
            <Square className="h-4 w-4 fill-current" /> Stop
          </button>
        )}

        {state === 'done' && outUrl && (
          <>
            <button type="button" onClick={download}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-fg)] py-3 text-[13px] font-semibold text-[var(--color-canvas)] transition hover:opacity-90">
              <Download className="h-4 w-4" /> Download .{ext}
            </button>
            <button type="button" onClick={reset}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
              <RotateCcw className="h-4 w-4" /> Discard
            </button>
          </>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
          Choose a screen, window or browser tab when prompted. Tick “share audio” in that dialog to capture sound. Everything is recorded and saved on your device — nothing is uploaded.
        </p>
      </aside>
    </div>
  );
}
