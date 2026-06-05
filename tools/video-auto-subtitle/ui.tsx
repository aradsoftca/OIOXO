'use client';

import * as React from 'react';
import { Loader2, Download, Wand2, Languages, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { downloadBlob } from '@/engines/ffmpeg';
import { chunksToSrt, chunksToVtt } from '@/engines/transcribe';
import { TRANSLATE_LANGUAGES as LANGS } from '@/lib/i18n/languages';
import {
  videoToWords, groupSegments, buildOverlays, burnOverlays, PRESETS,
  type Word, type Segment, type StudioStyle, type CaptionMode,
} from '@/engines/subtitle/studio';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'video-auto-subtitle';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const splitEven = (text: string, start: number, end: number): Word[] => {
  const ws = text.trim().split(/\s+/).filter(Boolean); const dur = (end - start) / Math.max(1, ws.length);
  return ws.map((t, i) => ({ text: t, start: start + i * dur, end: start + (i + 1) * dur }));
};

export default function CaptionStudio() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [words, setWords] = React.useState<Word[] | null>(null);
  const [segs, setSegs] = React.useState<Segment[]>([]);
  const [presetId, setPresetId] = React.useState('reels');
  const [mode, setMode] = React.useState<CaptionMode>('word');
  const [style, setStyle] = React.useState<StudioStyle>(PRESETS[0].style);
  const [translated, setTranslated] = React.useState(false);
  const [lang, setLang] = React.useState('en');
  const [accurate, setAccurate] = React.useState(false);
  const [busy, setBusy] = React.useState<'' | 'gen' | 'burn'>('');
  const [phase, setPhase] = React.useState('');
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<{ url: string; name: string } | null>(null);
  const { guard, gate } = useUsageGate('video');

  React.useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  // regroup whenever words / mode / translated change
  const rebuild = React.useCallback(async (w: Word[], m: CaptionMode, doTranslate: boolean, to: string) => {
    let effMode = m;
    let segments = groupSegments(w, m, style.maxWords);
    if (doTranslate) {
      // word/karaoke can't translate per-word meaningfully → use phrase grouping.
      effMode = m === 'classic' ? 'classic' : 'phrase';
      segments = groupSegments(w, effMode, Math.max(4, style.maxWords));
      const { translate, detectLanguage } = await import('@/lib/ai/translate');
      const srcLang = (await detectLanguage(w.slice(0, 20).map((x) => x.text).join(' ')).catch(() => null)) || 'en';
      const out: Segment[] = [];
      for (const s of segments) {
        const t = srcLang === to ? s.text : ((await translate(s.text, srcLang, to).catch(() => null)) || s.text);
        out.push({ ...s, text: t, words: splitEven(t, s.start, s.end) });
      }
      segments = out;
    }
    setMode(effMode); setSegs(segments);
  }, [style.maxWords]);

  const generate = async () => {
    if (!item) return;
    const durHit = checkLever(POLICY_KEY, 'input-duration', item.info.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    if (!(await guard({ bytes: item.file.size }))) return;
    setBusy('gen'); setError(''); setResult(null); setRatio(0);
    try {
      const w = await videoToWords(item.file, { size: accurate ? 'small' : 'tiny', onProgress: (p, r) => { setPhase(p); setRatio(r); } });
      if (!w.length) { setError('No speech detected.'); setWords([]); return; }
      setWords(w);
      await rebuild(w, mode, translated, lang);
    } catch (e) { setError((e as Error).message || 'Could not transcribe this video.'); }
    finally { setBusy(''); setPhase(''); }
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id); if (!p) return;
    setPresetId(id); setStyle(p.style); setMode(p.mode);
    if (words) void rebuild(words, p.mode, translated, lang);
  };
  const toggleTranslate = (on: boolean) => { setTranslated(on); if (words) void rebuild(words, mode, on, lang); };
  const changeLang = (l: string) => { setLang(l); if (words && translated) void rebuild(words, mode, true, l); };
  const editSeg = (i: number, text: string) => setSegs((ss) => ss.map((s, j) => j === i ? { ...s, text, words: splitEven(text, s.start, s.end) } : s));

  const exportSub = (kind: 'srt' | 'vtt') => {
    const chunks = segs.map((s) => ({ start: s.start, end: s.end, text: s.text }));
    const text = kind === 'srt' ? chunksToSrt(chunks) : chunksToVtt(chunks);
    const base = item?.file.name.replace(/\.[^.]+$/, '') || 'captions';
    downloadBlob(new Blob([text], { type: kind === 'srt' ? 'application/x-subrip' : 'text/vtt' }), `${base}.${kind}`);
  };

  const burn = async () => {
    if (!item || !segs.length) return;
    const durHit = checkLever(POLICY_KEY, 'input-duration', item.info.duration, isPro);
    if (durHit) { policyGate.fire(durHit); return; }
    if (!(await guard({ bytes: item.file.size }))) return;
    setBusy('burn'); setError(''); setResult(null); setRatio(0);
    try {
      const items = await buildOverlays(segs, mode, item.info.width, item.info.height, style);
      if (items.length > 600) { setError('That’s a lot of caption frames — try “Fast bursts” or a shorter clip.'); setBusy(''); return; }
      const blob = await burnOverlays(item.file, items, setRatio);
      const base = item.file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-captioned.mp4` });
    } catch (e) { setError((e as Error).message || 'Could not burn captions.'); }
    finally { setBusy(''); }
  };

  const setS = (p: Partial<StudioStyle>) => setStyle((s) => ({ ...s, ...p }));

  return (
    <div className="space-y-5">
      {gate}
      {policyGate.element}
      {!item ? <VideoDrop onLoad={setItem} loaded={false} /> : (
        <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <span className="text-[12px] font-semibold">{item.file.name}</span>
          <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{item.info.width}×{item.info.height} · {fmt(item.info.duration)}</span>
          <button type="button" onClick={() => { setItem(null); setWords(null); setSegs([]); setResult(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change video</button>
        </div>
      )}

      {item && !words && (
        <div className="space-y-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={accurate} onChange={(e) => setAccurate(e.target.checked)} /> More accurate (slower)</label>
          <button type="button" onClick={generate} disabled={busy !== ''} className="flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white disabled:opacity-50">
            {busy === 'gen' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}{busy === 'gen' ? `${phase || 'Working'}… ${Math.round(ratio * 100)}%` : 'Generate captions'}
          </button>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">Transcribed on your device — nothing uploaded.</p>
        </div>
      )}
      {busy === 'gen' && ratio > 0 && <div className="h-1 w-full overflow-hidden bg-black/[0.06]"><div className="h-full bg-[var(--color-cat-video)]" style={{ width: `${ratio * 100}%` }} /></div>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {words && words.length > 0 && (
        <>
          {/* style presets */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]"><Sparkles className="h-3.5 w-3.5" /> Style</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => applyPreset(p.id)} className={cn('border px-3 py-1.5 text-[12px] font-semibold transition', presetId === p.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)]/10' : 'border-black/[0.12] hover:bg-[var(--color-surface-2)]')}>{p.name}</button>
              ))}
            </div>
          </div>

          {/* language + customization */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[12px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={translated} onChange={(e) => toggleTranslate(e.target.checked)} /><Languages className="h-3.5 w-3.5" /> Translate</label>
            {translated && <select value={lang} onChange={(e) => changeLang(e.target.value)} className="border border-black/[0.12] bg-transparent px-1.5 py-0.5">{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>}
            <span className="h-4 w-px bg-black/[0.1]" />
            <label className="flex items-center gap-1.5">Size<input type="range" min={28} max={110} value={style.fontSize} onChange={(e) => setS({ fontSize: +e.target.value })} /></label>
            <label className="flex items-center gap-1">Text<input type="color" value={style.color} onChange={(e) => setS({ color: e.target.value })} /></label>
            <label className="flex items-center gap-1">Accent<input type="color" value={style.highlightColor} onChange={(e) => setS({ highlightColor: e.target.value })} /></label>
            <select value={style.decoration} onChange={(e) => setS({ decoration: e.target.value as StudioStyle['decoration'] })} className="border border-black/[0.12] bg-transparent px-1.5 py-0.5"><option value="outline">Outline</option><option value="box">Box</option><option value="plain">Plain</option></select>
            <select value={style.position} onChange={(e) => setS({ position: e.target.value as StudioStyle['position'] })} className="border border-black/[0.12] bg-transparent px-1.5 py-0.5"><option value="bottom">Bottom</option><option value="center">Center</option><option value="top">Top</option></select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={style.uppercase} onChange={(e) => setS({ uppercase: e.target.checked })} /> CAPS</label>
          </div>

          {/* editable segments */}
          <div className="max-h-60 space-y-1 overflow-auto border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            {segs.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-[10px] text-[var(--color-fg-subtle)]">{fmt(s.start)}</span>
                <input value={s.text} onChange={(e) => editSeg(i, e.target.value)} className="flex-1 bg-transparent border-b border-black/[0.08] py-0.5 text-[13px] outline-none focus:border-[var(--color-cat-video)]" />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => exportSub('srt')} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">.SRT</button>
            <button type="button" onClick={() => exportSub('vtt')} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">.VTT</button>
            <button type="button" onClick={burn} disabled={busy !== ''} className="flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white disabled:opacity-50">
              {busy === 'burn' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}{busy === 'burn' ? `Burning… ${Math.round(ratio * 100)}%` : 'Burn captions in'}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="space-y-2 border border-[var(--color-cat-video)]/40 bg-[var(--color-cat-video)]/5 p-4">
          <video src={result.url} controls className="max-h-80 w-full bg-black" />
          <a href={result.url} download={result.name} className="flex w-fit items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download captioned video</a>
        </div>
      )}
    </div>
  );
}
