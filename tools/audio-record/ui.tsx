'use client';

/**
 * Voice Recorder — oioxo / newxonvert version.
 * Microphone → MediaRecorder → playback + download, with a live level meter.
 * Fully on-device; nothing is uploaded.
 */

import * as React from 'react';
import { Mic, Square, Pause, Play, Download, RotateCcw } from 'lucide-react';

function pickMime(): string {
  const c = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const m of c) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function fmt(s: number): string { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }

export default function VoiceRecorderUI() {
  const [supported] = React.useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  const [state, setState] = React.useState<'idle' | 'recording' | 'paused' | 'done'>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [outUrl, setOutUrl] = React.useState('');
  const [ext, setExt] = React.useState('webm');
  const [level, setLevel] = React.useState(0);
  const [error, setError] = React.useState('');

  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number>(0);
  // mountedRef so rec.onstop doesn't create a blob URL after unmount.
  const mountedRef = React.useRef(true);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close().catch(() => {}); audioCtxRef.current = null;
    setLevel(0);
  };
  // Unmount-only cleanup via ref-mirror. With [outUrl] in deps, the cleanup
  // ran on every recording completion — `cleanup()` was idempotent so it
  // worked, but the shape invited future regressions where stopping the
  // stream a second time could matter.
  const outUrlRef = React.useRef('');
  React.useEffect(() => { outUrlRef.current = outUrl; }, [outUrl]);
  React.useEffect(() => () => {
    mountedRef.current = false;
    // Stop the recorder so its onstop can't fire post-unmount and leak a
    // fresh blob URL (setOutUrl no-ops on a dead component).
    try { recRef.current?.stop(); } catch { /* */ }
    recRef.current = null;
    cleanup();
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
  }, []);

  const start = async () => {
    setError('');
    if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(''); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // level meter
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC(); audioCtxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0; for (const v of buf) sum += v;
        setLevel(Math.min(1, sum / buf.length / 128));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mimeType = pickMime();
      setExt(mimeType.includes('ogg') ? 'ogg' : 'webm');
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        if (!mountedRef.current) { cleanup(); return; }
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setOutUrl(URL.createObjectURL(blob)); setState('done'); cleanup();
      };
      // MediaRecorder fires `error` for codec drops, OOM, or a tab going
      // background-throttled past the recorder's tolerance. Without a handler,
      // a mid-recording failure would silently produce a truncated or zero-
      // byte file with no message to the user.
      rec.onerror = (ev) => {
        const e = (ev as unknown as { error?: { message?: string } }).error;
        setError(e?.message || 'Recording stopped unexpectedly.');
        cleanup();
        setState('idle');
      };
      recRef.current = rec; rec.start();
      setState('recording'); setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : err.message || 'Could not access the microphone.');
      cleanup();
    }
  };
  const pause = () => { recRef.current?.pause(); setState('paused'); if (timerRef.current) clearInterval(timerRef.current); };
  const resume = () => { recRef.current?.resume(); setState('recording'); timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000); };
  const stop = () => { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); };
  const reset = () => { if (outUrl) URL.revokeObjectURL(outUrl); setOutUrl(''); setState('idle'); setElapsed(0); };
  const download = () => {
    if (!outUrl) return;
    const a = document.createElement('a'); a.href = outUrl; a.download = `recording-${Date.now()}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (!supported) return <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[14px] text-[var(--color-fg-muted)]">Your browser doesn’t support microphone recording. Try the latest Chrome, Edge, Firefox or Safari.</div>;

  const recording = state === 'recording' || state === 'paused';
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex flex-col items-center gap-4 border border-black/[0.08] bg-[var(--color-surface-1)] p-8">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `var(--color-cat-audio)`, opacity: recording ? 1 : 0.85 }}>
          <div className="absolute inset-0 rounded-full" style={{ transform: `scale(${1 + level * 0.4})`, background: 'var(--color-cat-audio)', opacity: 0.25, transition: 'transform 0.08s' }} />
          <Mic className="relative h-12 w-12 text-white" />
        </div>
        <div className="font-mono text-[34px] font-bold tabular-nums text-[var(--color-fg)]">{fmt(elapsed)}</div>
        {state === 'recording' && <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Recording</div>}
        {state === 'paused' && <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Paused</div>}
        {error && <div className="text-[13px] text-red-600">{error}</div>}
      </div>

      {state === 'done' && outUrl && <audio src={outUrl} controls className="w-full" />}

      <div className="flex justify-center gap-2">
        {state === 'idle' && <button type="button" onClick={start} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-6 py-3 text-[14px] font-semibold text-white shadow-lg transition hover:brightness-110"><Mic className="h-4 w-4" /> Record</button>}
        {state === 'recording' && <>
          <button type="button" onClick={pause} className="flex items-center gap-2 border border-black/[0.08] px-5 py-3 text-[13px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"><Pause className="h-4 w-4" /> Pause</button>
          <button type="button" onClick={stop} className="flex items-center gap-2 bg-red-600 px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-110"><Square className="h-4 w-4 fill-current" /> Stop</button>
        </>}
        {state === 'paused' && <>
          <button type="button" onClick={resume} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-110"><Play className="h-4 w-4" /> Resume</button>
          <button type="button" onClick={stop} className="flex items-center gap-2 bg-red-600 px-5 py-3 text-[13px] font-semibold text-white transition hover:brightness-110"><Square className="h-4 w-4 fill-current" /> Stop</button>
        </>}
        {state === 'done' && <>
          <button type="button" onClick={download} className="flex items-center gap-2 bg-[var(--color-fg)] px-5 py-3 text-[13px] font-semibold text-[var(--color-canvas)] transition hover:opacity-90"><Download className="h-4 w-4" /> Download .{ext}</button>
          <button type="button" onClick={reset} className="flex items-center gap-2 border border-black/[0.08] px-5 py-3 text-[13px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]"><RotateCcw className="h-4 w-4" /> New</button>
        </>}
      </div>
    </div>
  );
}
