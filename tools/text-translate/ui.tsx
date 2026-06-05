'use client';

import * as React from 'react';
import { Loader2, Copy, Download, ArrowLeftRight, Upload, Check } from 'lucide-react';
import { downloadBlob } from '@/engines/ffmpeg';
import { TRANSLATE_LANGUAGES as LANGS, languageName as nameOf } from '@/lib/i18n/languages';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'text-translate';

export default function TranslateTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [src, setSrc] = React.useState('');
  const [out, setOut] = React.useState('');
  const [from, setFrom] = React.useState('auto');
  const [to, setTo] = React.useState('en');
  const [detected, setDetected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const run = async () => {
    const text = src.trim();
    if (!text) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    setBusy(true); setError(''); setOut(''); setDetected(null);
    try {
      const mod = await import('@/lib/ai/translate');
      let source = from;
      if (from === 'auto') {
        const d = await mod.detectLanguage(text).catch(() => null);
        source = d || 'en';
        setDetected(source);
      }
      if (source === to) { setOut(text); setBusy(false); return; }
      // Translate line-by-line so .srt/long text keeps structure and stays within model limits.
      const lines = text.split('\n');
      const result: string[] = [];
      for (const ln of lines) {
        if (!ln.trim() || /^\d+$/.test(ln.trim()) || /-->/.test(ln)) { result.push(ln); continue; } // keep srt indices/timecodes
        const t = await mod.translate(ln, source, to).catch(() => null);
        result.push(t || ln);
      }
      const joined = result.join('\n');
      if (!joined.trim()) setError('Translation unavailable for this pair on this device.');
      setOut(joined);
    } catch {
      setError('Could not translate on this device.');
    } finally { setBusy(false); }
  };

  const swap = () => {
    if (from === 'auto') return;
    setFrom(to); setTo(from); setSrc(out); setOut(src);
  };

  const loadFile = async (f: File) => {
    setSrc(await f.text());
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };

  return (
    <div className="space-y-4">
      {policyGate.element}
      <div className="flex flex-wrap items-center gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] outline-none">
          <option value="auto">Detect language</option>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <button type="button" onClick={swap} disabled={from === 'auto'} title="Swap" className="grid h-8 w-8 place-items-center border border-black/[0.12] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-40">
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] outline-none">
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          <Upload className="h-3.5 w-3.5" /> Load .txt / .srt
        </button>
        <input ref={inputRef} type="file" accept=".txt,.srt,.vtt,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <textarea value={src} onChange={(e) => setSrc(e.target.value)} rows={12} placeholder="Type or paste text…"
          className="w-full resize-y border border-black/[0.1] bg-[var(--color-surface-1)] p-3 text-[14px] outline-none focus:border-[var(--color-cat-text,#666)]" />
        <div className="relative">
          <textarea value={out} readOnly rows={12} placeholder="Translation appears here…"
            className="h-full w-full resize-y border border-black/[0.1] bg-[var(--color-surface-2)] p-3 text-[14px] outline-none" />
          {out && (
            <div className="absolute right-2 top-2 flex gap-1">
              <button type="button" onClick={copy} title="Copy" className="grid h-7 w-7 place-items-center bg-[var(--color-surface-1)] border border-black/[0.1] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => downloadBlob(new Blob([out], { type: 'text/plain' }), `translated-${to}.txt`)} title="Download" className="grid h-7 w-7 place-items-center bg-[var(--color-surface-1)] border border-black/[0.1] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {detected && <p className="text-[11px] text-[var(--color-fg-subtle)]">Detected source: <strong className="text-[var(--color-fg)]">{nameOf(detected)}</strong></p>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}

      <button type="button" onClick={run} disabled={busy || !src.trim()}
        className="flex items-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:brightness-110 disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {busy ? 'Translating…' : `Translate to ${nameOf(to)}`}
      </button>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">100% on your device — your text is never uploaded. First use of a language pair downloads a small model.</p>
    </div>
  );
}
