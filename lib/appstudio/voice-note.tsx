'use client';

import * as React from 'react';
import { Mic, Square, Play, Pause } from 'lucide-react';

export function useVoiceRecorder() {
  const [recording, setRecording] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const startTsRef = React.useRef(0);
  const timerRef = React.useRef(0);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);

  const start = React.useCallback(async (): Promise<void> => {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.start();
    recRef.current = rec;
    startTsRef.current = Date.now();
    setRecording(true);
    timerRef.current = window.setInterval(() => setDuration(Date.now() - startTsRef.current), 100);
  }, [recording]);

  const stop = React.useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec) { resolve(null); return; }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recRef.current = null;
        window.clearInterval(timerRef.current);
        setRecording(false);
        setDuration(0);
        resolve(blob);
      };
      rec.stop();
    });
  }, []);

  // Hard unmount cleanup: previously a navigate-away mid-recording left the
  // mic light on (MediaStream tracks not stopped), kept the duration timer
  // firing setState on a dead component, and the recorder unfinished. Tear
  // everything down on unmount regardless of recording state.
  React.useEffect(() => () => {
    try { recRef.current?.stop(); } catch { /* */ }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* */ } });
    streamRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    chunksRef.current = [];
  }, []);

  return { recording, duration, start, stop };
}

export function VoiceNotePlayer({ url }: { url: string }) {
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  };

  return (
    <div className="flex items-center gap-2 rounded bg-white/[.04] px-2 py-1.5">
      <button type="button" onClick={toggle} className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-cat-convert)] text-white">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" />}
      </button>
      <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-[var(--color-cat-convert)] transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <Mic className="h-3 w-3 text-zinc-400" />
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
    </div>
  );
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
