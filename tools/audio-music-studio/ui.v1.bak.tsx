'use client';
import * as React from 'react';
import { Loader2, Download, Music, Shuffle, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { encodeWav, encodeMp3 } from '@/engines/audio';
import { downloadBlob } from '@/engines/ffmpeg';
import { GENRES, KEYS, generateSong, renderSong } from '@/engines/music/studio';

export default function MusicStudio() {
  const [genre, setGenre] = React.useState(GENRES[0].id);
  const [key, setKey] = React.useState('C');
  const [bpm, setBpm] = React.useState(GENRES[0].bpm);
  const [bars, setBars] = React.useState(8);
  const [seed, setSeed] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [wav, setWav] = React.useState<{ url: string; blob: Blob } | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const { guard, gate } = useUsageGate('audio');

  React.useEffect(() => () => { if (wav?.url) URL.revokeObjectURL(wav.url); }, [wav]);
  const pickGenre = (id: string) => { setGenre(id); const g = GENRES.find((x) => x.id === id); if (g) setBpm(g.bpm); };

  const make = async (newSeed = false) => {
    if (!(await guard())) return;
    const s = newSeed ? Math.floor(Math.random() * 99999) + 1 : seed;
    if (newSeed) setSeed(s);
    setBusy(true); setError('');
    if (wav?.url) URL.revokeObjectURL(wav.url);
    setWav(null);
    try {
      const song = generateSong({ genreId: genre, key, bpm, bars, seed: s });
      const buffer = await renderSong(song);
      const blob = encodeWav(buffer);
      setWav({ url: URL.createObjectURL(blob), blob });
      setTimeout(() => { void audioRef.current?.play().catch(() => {}); }, 60);
    } catch (e) { setError((e as Error).message || 'Could not generate the track.'); }
    finally { setBusy(false); }
  };

  const dlMp3 = async () => {
    if (!wav) return;
    try { const { decode } = await import('@/engines/audio'); const ab = await decode(await wav.blob.arrayBuffer()); downloadBlob(await encodeMp3(ab, 192), `track-${genre}.mp3`); }
    catch { setError('MP3 export failed — WAV still works.'); }
  };

  return (
    <div className="space-y-5">
      {gate}
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Style</div>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button key={g.id} type="button" onClick={() => pickGenre(g.id)}
              className={cn('border px-4 py-2 text-[13px] font-semibold transition', genre === g.id ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)]/10' : 'border-black/[0.12] hover:bg-[var(--color-surface-2)]')}>{g.name}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-[12px]"><div className="mb-1 font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Key</div>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="w-full border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-2 text-[13px] outline-none">{KEYS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </label>
        <label className="text-[12px]"><div className="mb-1 font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Tempo · {bpm} BPM</div>
          <input type="range" min={60} max={150} value={bpm} onChange={(e) => setBpm(+e.target.value)} className="w-full" />
        </label>
        <label className="text-[12px]"><div className="mb-1 font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Length</div>
          <select value={bars} onChange={(e) => setBars(+e.target.value)} className="w-full border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-2 text-[13px] outline-none">{[4, 8, 16, 24].map((b) => <option key={b} value={b}>{b} bars</option>)}</select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => make(false)} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music className="h-3.5 w-3.5" />} {busy ? 'Composing…' : 'Generate'}
        </button>
        <button type="button" onClick={() => make(true)} disabled={busy} className="flex items-center gap-2 border border-black/[0.12] px-4 py-2.5 text-[12px] font-semibold hover:bg-[var(--color-surface-2)] disabled:opacity-50"><Shuffle className="h-3.5 w-3.5" /> New variation</button>
      </div>
      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {wav && (
        <div className="space-y-3 border border-[var(--color-cat-audio)]/40 bg-[var(--color-cat-audio)]/5 p-4">
          <audio ref={audioRef} src={wav.url} controls loop className="w-full" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => audioRef.current?.play()} className="flex items-center gap-2 border border-black/[0.12] px-3 py-2 text-[12px] font-semibold"><Play className="h-3.5 w-3.5" /> Play</button>
            <button type="button" onClick={() => downloadBlob(wav.blob, `track-${genre}.wav`)} className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> WAV</button>
            <button type="button" onClick={dlMp3} className="flex items-center gap-2 border border-black/[0.12] px-4 py-2 text-[12px] font-semibold"><Download className="h-3.5 w-3.5" /> MP3</button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Composed and synthesized entirely on your device — every track is original and royalty-free. Try “New variation” for a fresh take in the same style.</p>
    </div>
  );
}
