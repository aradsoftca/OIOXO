'use client';

/**
 * Webcam Recorder — oioxo / newxonvert version.
 * Live camera preview → record video (MediaRecorder) or snap a still photo,
 * then download. Fully on-device; nothing is uploaded.
 */

import * as React from 'react';
import { Video, Camera, Circle, Square, Download, RotateCcw, Mic, MicOff } from 'lucide-react';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { freeCap } from '@/lib/limits/policy';

const POLICY_KEY = 'video-webcam-record';

function pickMime(): string {
  const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const m of c) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function fmt(s: number): string { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }

export default function WebcamRecorderUI() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [supported] = React.useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  const [withMic, setWithMic] = React.useState(true);
  const [live, setLive] = React.useState(false);
  const [state, setState] = React.useState<'idle' | 'recording' | 'done'>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [videoUrl, setVideoUrl] = React.useState('');
  const [photoUrl, setPhotoUrl] = React.useState('');
  const [ext, setExt] = React.useState('webm');
  const [error, setError] = React.useState('');

  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // mountedRef so rec.onstop doesn't create a blob URL after unmount —
  // setVideoUrl no-ops on a dead component, leaking createObjectURL output.
  const mountedRef = React.useRef(true);

  const stopStream = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setLive(false); };
  // Unmount-only. With [videoUrl, photoUrl] deps, the cleanup fired on every
  // change of one and revoked the OTHER still-active URL (recording a video
  // then snapping a photo would yank the recording's playback URL).
  const videoUrlRef = React.useRef('');
  const photoUrlRef = React.useRef('');
  React.useEffect(() => { videoUrlRef.current = videoUrl; }, [videoUrl]);
  React.useEffect(() => { photoUrlRef.current = photoUrl; }, [photoUrl]);
  React.useEffect(() => () => {
    mountedRef.current = false;
    stopStream();
    if (timerRef.current) clearInterval(timerRef.current);
    // Stop any in-flight recorder so its onstop doesn't fire after we tear
    // down — that handler would otherwise create a fresh blob URL that
    // setVideoUrl can't accept (component is dead), leaking the URL.
    try { recRef.current?.stop(); } catch { /* */ }
    recRef.current = null;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, []);

  const enable = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: withMic });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play().catch(() => {}); }
      setLive(true);
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'NotAllowedError' ? 'Camera/microphone permission was denied.' : err.message || 'Could not access the camera.');
    }
  };

  const startRec = async () => {
    if (!streamRef.current) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(''); }
    const mimeType = pickMime(); setExt(mimeType.includes('mp4') ? 'mp4' : 'webm');
    const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      if (!mountedRef.current) return; // post-unmount onstop would leak the URL
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      setVideoUrl(URL.createObjectURL(blob));
      setState('done');
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // Mid-recording failure (codec drop, OOM, background throttle) was silent
    // and produced a corrupt file — surface it instead.
    rec.onerror = (ev) => {
      const err = (ev as unknown as { error?: { message?: string } }).error;
      setError(err?.message || 'Recording stopped unexpectedly.');
      if (timerRef.current) clearInterval(timerRef.current);
      setState('idle');
    };
    recRef.current = rec; rec.start(); setState('recording'); setElapsed(0);
    // Auto-stop at the free recording cap.
    const capMin = freeCap(POLICY_KEY, 'recording-minutes');
    const capSec = Number.isFinite(capMin) ? capMin * 60 : Infinity;
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (!isPro && Number.isFinite(capSec) && next >= capSec) {
          policyGate.fire({
            key: POLICY_KEY,
            policy: { key: POLICY_KEY, displayName: 'Webcam Record', tier: 'standard', levers: [], watermarkFree: true, proValueProp: [] },
            lever: { type: 'recording-minutes', free: capMin, unit: 'min', label: 'Max recording length', response: 'block' },
            observed: next, upgradeTo: 'pro',
            friendly: `Free recordings cap at ${capMin} min — Pro recordings can be up to 8h.`,
          });
          recRef.current?.stop();
          return capSec;
        }
        return next;
      });
    }, 1000);
  };
  const stopRec = () => { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); };

  const snap = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    c.toBlob((b) => { if (b) { const u = URL.createObjectURL(b); setPhotoUrl(u); const a = document.createElement('a'); a.href = u; a.download = `photo-${Date.now()}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); } }, 'image/png');
  };

  const downloadVideo = () => { if (!videoUrl) return; const a = document.createElement('a'); a.href = videoUrl; a.download = `webcam-${Date.now()}.${ext}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
  const reset = () => { if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoUrl(''); setState('idle'); setElapsed(0); };

  if (!supported) return <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[14px] text-[var(--color-fg-muted)]">Your browser doesn’t support webcam capture. Try the latest Chrome, Edge, Firefox or Safari.</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      {policyGate.element}
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden border border-black/[0.08] bg-[oklch(18%_0.008_250)]">
          {state === 'done' && videoUrl ? (
            <video src={videoUrl} controls className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
          )}
          {!live && state !== 'done' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <Camera className="h-10 w-10 text-white/40" /><div className="text-[14px] text-white/60">Enable your camera to begin</div>
            </div>
          )}
          {state === 'recording' && (
            <div className="absolute left-3 top-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur">
              <Circle className="h-3 w-3 animate-pulse fill-red-500 text-red-500" /> REC <span className="font-mono">{fmt(elapsed)}</span>
            </div>
          )}
        </div>
        {error && <div className="text-[13px] text-red-600">{error}</div>}
      </div>

      <aside className="space-y-4">
        {!live && state !== 'done' ? (
          <>
            <label className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3">
              <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-fg)]">{withMic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} Include microphone</span>
              <input type="checkbox" checked={withMic} onChange={(e) => setWithMic(e.target.checked)} className="h-4 w-4" />
            </label>
            <button type="button" onClick={enable} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110"><Camera className="h-4 w-4" /> Enable camera</button>
          </>
        ) : state === 'recording' ? (
          <button type="button" onClick={stopRec} className="flex w-full items-center justify-center gap-2 bg-red-600 py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110"><Square className="h-4 w-4 fill-current" /> Stop</button>
        ) : state === 'done' ? (
          <>
            <button type="button" onClick={downloadVideo} className="flex w-full items-center justify-center gap-2 bg-[var(--color-fg)] py-3 text-[13px] font-semibold text-[var(--color-canvas)] transition hover:opacity-90"><Download className="h-4 w-4" /> Download .{ext}</button>
            <button type="button" onClick={reset} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]"><RotateCcw className="h-4 w-4" /> Record again</button>
          </>
        ) : (
          <>
            <button type="button" onClick={startRec} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-4 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110"><Circle className="h-4 w-4 fill-current" /> Start recording</button>
            <button type="button" onClick={snap} className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-3 text-[13px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><Camera className="h-4 w-4" /> Take photo</button>
          </>
        )}
        <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">Everything is captured and saved on your device — nothing is uploaded.</p>
      </aside>
    </div>
  );
}
