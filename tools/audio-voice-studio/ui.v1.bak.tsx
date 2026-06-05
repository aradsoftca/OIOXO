'use client';

import * as React from 'react';
import { Loader2, Play, Download, Wand2, Pause } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { downloadBlob } from '@/engines/ffmpeg';
import { encodeWav, encodeMp3 } from '@/engines/audio';
import { speakToBuffer, VOICE_STYLES, TTS_LANGUAGES, type VoiceStyle } from '@/engines/tts/studio';

export default function VoiceStudioTool() {
  const [text, setText] = React.useState('Type or paste anything here, pick a voice, and download it as audio.');
  const [lang, setLang] = React.useState('en');
  const [style, setStyle] = React.useState<VoiceStyle>(VOICE_STYLES[0]);
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState('');
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [wav, setWav] = React.useState<{ url: string; blob: Blob } | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const { guard, gate } = useUsageGate('audio');

  React.useEffect(() => () => { if (wav?.url) URL.revokeObjectURL(wav.url); }, [wav]);

  const generate = async () => {
    const t = text.trim();
    if (!t) return;
    if (!(await guard())) return;
    setBusy(true); setError(''); setRatio(0);
    if (wav?.url) URL.revokeObjectURL(wav.url);
    setWav(null);
    try {
      const buffer = await speakToBuffer(t.slice(0, 2000), lang, style, (p, r) => { setPhase(p); setRatio(r); });
      const blob = encodeWav(buffer);
      setWav({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      setError((e as Error).message || 'Could not generate the voice.');
    } finally { setBusy(false); setPhase(''); }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { void audioRef.current.play(); }
  };

  const downloadMp3 = async () => {
    if (!wav) return;
    try {
      const { decode } = await import('@/engines/audio');
      const ab = await decode(await wav.blob.arrayBuffer());
      const mp3 = await encodeMp3(ab, 192);
      downloadBlob(mp3, `voice-${style.id}.mp3`);
    } catch { setError('MP3 export failed — the WAV download still works.'); }
  };

  return (
    <div className="space-y-5">
      {gate}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={2000}
        placeholder="Type the words to speak…"
        className="w-full resize-y border border-black/[0.1] bg-[var(--color-surface-1)] p-3 text-[14px] outline-none focus:border-[var(--color-cat-audio)]"
      />
      <div className="text-right text-[10px] text-[var(--color-fg-subtle)]">{text.length} / 2000</div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-[12px]">
          <div className="mb-1 font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Language</div>
          <select value={lang} onChange={(e) => setLang(e.target.value)}
            className="w-full border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-2 text-[13px] outline-none">
            {TTS_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </label>
        <div className="text-[12px]">
          <div className="mb-1 font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Voice</div>
          <div className="flex flex-wrap gap-1.5">
            {VOICE_STYLES.map((s) => (
              <button key={s.id} type="button" onClick={() => setStyle(s)}
                className={cn('border px-3 py-1.5 text-[12px] font-semibold transition',
                  style.id === s.id ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)]/10 text-[var(--color-fg)]' : 'border-black/[0.1] text-[var(--color-fg-muted)] hover:border-[var(--color-cat-audio)]')}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={generate} disabled={busy || !text.trim()}
        className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        {busy ? `${phase || 'Working'}… ${Math.round(ratio * 100)}%` : 'Generate voice'}
      </button>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">First use downloads a small voice model for the language; after that it’s instant and offline.</p>

      {busy && ratio > 0 && (
        <div className="h-1 w-full overflow-hidden bg-black/[0.06]"><div className="h-full bg-[var(--color-cat-audio)] transition-[width]" style={{ width: `${ratio * 100}%` }} /></div>
      )}

      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {wav && (
        <div className="space-y-3 border border-[var(--color-cat-audio)]/40 bg-[var(--color-cat-audio)]/5 p-4">
          <audio ref={audioRef} src={wav.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="w-full" controls />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={togglePlay} className="flex items-center gap-2 border border-black/[0.12] px-3 py-2 text-[12px] font-semibold transition hover:bg-[var(--color-surface-2)]">
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => downloadBlob(wav.blob, `voice-${style.id}.wav`)} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
              <Download className="h-3.5 w-3.5" /> WAV
            </button>
            <button type="button" onClick={downloadMp3} className="flex items-center gap-2 border border-black/[0.12] px-4 py-2 text-[12px] font-semibold transition hover:bg-[var(--color-surface-2)]">
              <Download className="h-3.5 w-3.5" /> MP3
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
