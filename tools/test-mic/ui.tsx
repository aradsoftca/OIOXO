'use client';
import * as React from 'react';
import { Mic, Square } from 'lucide-react';

export default function MicTest() {
  const [on, setOn] = React.useState(false);
  const [level, setLevel] = React.useState(0);
  const [error, setError] = React.useState('');
  const [recording, setRecording] = React.useState(false);
  const [clipUrl, setClipUrl] = React.useState('');
  const [devices, setDevices] = React.useState<string[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const recTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = React.useRef(true);
  const chunks = React.useRef<Blob[]>([]);
  // Hold the AudioContext so stop() can close it. The previous code created
  // a fresh AC inside start() with no ref, so the context lingered after
  // stopping the stream — a few back-to-back tests exhausted the ~6 cap.
  const ctxRef = React.useRef<AudioContext | null>(null);

  const stop = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setOn(false); setLevel(0);
    try { void ctxRef.current?.close(); } catch { /* */ }
    ctxRef.current = null;
    // Cancel a pending auto-stop timer so `rec.stop()` doesn't fire after the
    // user already torn things down — without this, onstop creates a blob URL
    // after unmount and the URL leaks (setClipUrl no-ops on a dead component
    // but createObjectURL has already run).
    if (recTimerRef.current) { clearTimeout(recTimerRef.current); recTimerRef.current = null; }
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    recRef.current = null;
  }, []);
  React.useEffect(() => () => { mountedRef.current = false; stop(); }, [stop]);
  React.useEffect(() => () => { if (clipUrl) URL.revokeObjectURL(clipUrl); }, [clipUrl]);

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; setOn(true);
      try { const d = await navigator.mediaDevices.enumerateDevices(); setDevices(d.filter((x) => x.kind === 'audioinput').map((x) => x.label || 'Microphone')); } catch { /* labels need permission */ }
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        setLevel(Math.min(1, peak / 110));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch { setError('Could not access the microphone. Check the browser permission prompt.'); }
  };

  const record = () => {
    if (!streamRef.current) return;
    chunks.current = [];
    const rec = new MediaRecorder(streamRef.current);
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      // If the user navigated away while the recording was finishing, the
      // setClipUrl call is a no-op on a dead component and createObjectURL
      // would leak. Bail early.
      if (!mountedRef.current) return;
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      setClipUrl(URL.createObjectURL(new Blob(chunks.current, { type: rec.mimeType })));
    };
    rec.start(); setRecording(true);
    recTimerRef.current = setTimeout(() => {
      recTimerRef.current = null;
      try { rec.stop(); } catch { /* */ }
      if (mountedRef.current) setRecording(false);
    }, 5000);
  };

  return (
    <div className="space-y-4">
      {!on ? (
        <button type="button" onClick={start} className="flex items-center gap-2 bg-[var(--color-cat-test)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Mic className="h-3.5 w-3.5" /> Start microphone test</button>
      ) : (
        <button type="button" onClick={stop} className="flex items-center gap-2 border border-black/[0.12] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider"><Square className="h-3.5 w-3.5" /> Stop</button>
      )}
      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {on && (
        <>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Input level — speak now</div>
            <div className="h-6 w-full overflow-hidden rounded bg-black/[0.06]">
              <div className="h-full transition-[width] duration-75" style={{ width: `${level * 100}%`, background: level > 0.85 ? '#ef4444' : 'var(--color-cat-test)' }} />
            </div>
            {level < 0.02 && <p className="mt-1 text-[11px] text-amber-600">No sound detected — tap or speak into the mic.</p>}
          </div>
          {devices.length > 0 && <p className="text-[11px] text-[var(--color-fg-subtle)]">Active input: {devices[0]}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={record} disabled={recording} className="flex items-center gap-2 bg-[var(--color-cat-test)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white disabled:opacity-50">{recording ? 'Recording 5s…' : 'Record 5s & play back'}</button>
            {clipUrl && <audio src={clipUrl} controls className="h-9" />}
          </div>
        </>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Audio stays on your device — nothing is uploaded.</p>
    </div>
  );
}
