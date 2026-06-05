'use client';

import * as React from 'react';
import { Loader2, Download, Languages } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { dubVideo } from '@/engines/video/dub';
import { TTS_LANGUAGES, VOICE_STYLES } from '@/engines/tts/studio';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { enforcePolicy } from '@/lib/limits/server-check';

const POLICY_KEY = 'video-auto-dub';

const SOURCE_LANGS = [{ code: '', name: 'Auto-detect' }, ...TTS_LANGUAGES];

export default function AutoDubTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [target, setTarget] = React.useState('en');
  const [source, setSource] = React.useState('');
  const [voice, setVoice] = React.useState(VOICE_STYLES[0].id);
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState('');
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<{ url: string; name: string } | null>(null);
  const { guard, gate } = useUsageGate('video');

  React.useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  const run = async () => {
    if (!item) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'lever', lever: 'input-duration', value: item.info.duration },
    ]);
    if (!ok) return;
    if (!(await guard({ bytes: item.file.size }))) return;
    setBusy(true); setError(''); setResult(null); setRatio(0);
    try {
      const blob = await dubVideo(item.file, {
        targetLang: target, voiceStyleId: voice, sourceLang: source || undefined,
        durationSec: item.info.duration,
        onProgress: (p, r) => { setPhase(p); setRatio(r); },
      });
      const base = item.file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-dubbed-${target}.mp4` });
    } catch (e) {
      setError((e as Error).message || 'Could not dub this video.');
    } finally { setBusy(false); setPhase(''); }
  };

  return (
    <div className="space-y-5">
      {gate}
      {policyGate.element}
      {!item ? <VideoDrop onLoad={setItem} loaded={false} /> : (
        <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <span className="text-[12px] font-semibold">{item.file.name}</span>
          <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{Math.round(item.info.duration)}s</span>
          <button type="button" onClick={() => { setItem(null); setResult(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change video</button>
        </div>
      )}

      {item && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From"><select value={source} onChange={(e) => setSource(e.target.value)} className="w-full border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-2 text-[13px] outline-none">{SOURCE_LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
          <Field label="Dub into"><select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-2 text-[13px] outline-none">{TTS_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
          <Field label="Voice"><select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-2 text-[13px] outline-none">{VOICE_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
      )}

      {item && (
        <button type="button" onClick={run} disabled={busy}
          className="flex items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          {busy ? `${phase || 'Working'}… ${Math.round(ratio * 100)}%` : 'Dub video'}
        </button>
      )}
      {item && <p className="text-[11px] text-[var(--color-fg-subtle)]">Transcribes, translates and re-voices entirely on your device. Longer videos take a while the first time as voice models download.</p>}

      {busy && ratio > 0 && <div className="h-1 w-full overflow-hidden bg-black/[0.06]"><div className="h-full bg-[var(--color-cat-video)] transition-[width]" style={{ width: `${ratio * 100}%` }} /></div>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {result && (
        <div className="space-y-2 border border-[var(--color-cat-video)]/40 bg-[var(--color-cat-video)]/5 p-4">
          <video src={result.url} controls className="max-h-80 w-full bg-black" />
          <a href={result.url} download={result.name} className="flex w-fit items-center gap-2 bg-[var(--color-cat-video)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"><Download className="h-3.5 w-3.5" /> Download dubbed video</a>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[12px]"><div className="mb-1 font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{label}</div>{children}</label>;
}
