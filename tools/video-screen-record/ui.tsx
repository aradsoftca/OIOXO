'use client';

import * as React from 'react';
import { Monitor, Mic, MicOff, Circle, Square, Download, RotateCcw } from 'lucide-react';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { freeCap } from '@/lib/limits/policy';

const POLICY_KEY = 'video-screen-record';

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
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
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
  // mountedRef so rec.onstop doesn't create a blob URL after unmount.
  const mountedRef = React.useRef(true);

  const cleanupStreams = () => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
  };

  // Mirror outUrl into a ref so the unmount-only cleanup can revoke whatever
  // URL is current at teardown. Previously the cleanup carried [outUrl] as a
  // dep — that re-ran the stop-streams + clear-interval side effects on
  // every recording completion, which (although idempotent) is the wrong
  // shape and easy to break by future edits.
  const outUrlRef = React.useRef('');
  React.useEffect(() => { outUrlRef.current = outUrl; }, [outUrl]);
  React.useEffect(() => () => {
    mountedRef.current = false;
    cleanupStreams();
    if (timerRef.current) clearInterval(timerRef.current);
    // Stop the in-flight recorder so its onstop can't fire post-unmount
    // and leak a fresh blob URL that setOutUrl will discard silently.
    try { recRef.current?.stop(); } catch { /* */ }
    recRef.current = null;
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
  }, []);

  const start = async () => {
    setError('');
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
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
        if (!mountedRef.current) { cleanupStreams(); return; }
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        setOutUrl(URL.createObjectURL(blob));
        setState('done');
        cleanupStreams();
        if (timerRef.current) clearInterval(timerRef.current);
      };
      // MediaRecorder error path: codec drop, OOM, or the tab being throttled
      // past tolerance. Without a handler, a mid-recording failure produced a
      // truncated/zero-byte file with no error surfaced to the user.
      rec.onerror = (ev) => {
        const err = (ev as unknown as { error?: { message?: string } }).error;
        setError(err?.message || 'Recording stopped unexpectedly.');
        cleanupStreams();
        if (timerRef.current) clearInterval(timerRef.current);
        setState('idle');
      };
      // If the user clicks the browser's native "Stop sharing", end cleanly.
      display.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      });

      recRef.current = rec;
      rec.start();
      setState('recording');
      setElapsed(0);
      // Auto-stop at the policy's free recording cap so the file never exceeds the limit.
      const capMin = freeCap(POLICY_KEY, 'recording-minutes');
      const capSec = Number.isFinite(capMin) ? capMin * 60 : Infinity;
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          if (!isPro && Number.isFinite(capSec) && next >= capSec) {
            // Trigger the paywall + force stop. checkLever computes the friendly msg.
            policyGate.fire({
              key: POLICY_KEY,
              policy: { key: POLICY_KEY, displayName: 'Screen Record', tier: 'standard', levers: [], watermarkFree: true, proValueProp: [] },
              lever: { type: 'recording-minutes', free: capMin, unit: 'min', label: 'Max recording length', response: 'block' },
              observed: next,
              upgradeTo: 'pro',
              friendly: `Free plan caps recordings at ${capMin} min — Pro recordings can be up to 8h.`,
            });
            recRef.current?.stop();
            return capSec;
          }
          return next;
        });
      }, 1000);
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
      {policyGate.element}
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
