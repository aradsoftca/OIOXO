'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react';
import { FileText, Loader2, ShieldCheck, Download, Square, AlertTriangle, Sparkles, Languages, Upload, Copy, Check } from 'lucide-react';
import { BRAND } from '@/lib/brand';

const MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Light & fast', size: '~0.3 GB' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Balanced', size: '~0.9 GB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Best', size: '~1.1 GB' },
];
const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Arabic', 'Persian', 'Russian', 'Chinese', 'Japanese', 'Korean', 'Hindi', 'Turkish'];
const MAX_CHARS = 12000;

export default function SummarizeApp() {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [modelId, setModelId] = React.useState(MODELS[1].id);
  const [loadState, setLoadState] = React.useState<'idle' | 'loading' | 'ready'>('idle');
  const [loadText, setLoadText] = React.useState('');
  const [loadPct, setLoadPct] = React.useState(0);
  const [mode, setMode] = React.useState<'summarize' | 'translate'>('summarize');
  const [lang, setLang] = React.useState('English');
  const [input, setInput] = React.useState('');
  const [output, setOutput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const engineRef = React.useRef<any>(null);
  const stopRef = React.useRef(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { setSupported(typeof navigator !== 'undefined' && 'gpu' in navigator); }, []);

  const loadModel = async () => {
    setLoadState('loading'); setLoadPct(0); setLoadText('Starting…');
    try {
      const webllm = await import('@mlc-ai/web-llm');
      engineRef.current = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (r: any) => { setLoadText(`Loading ${BRAND} AI…`); if (typeof r.progress === 'number') setLoadPct(r.progress); },
      });
      setLoadState('ready');
    } catch (e) { console.error(e); setLoadState('idle'); setLoadText('Failed to load — try the Light & fast model.'); }
  };

  const loadPdf = async (file: File) => {
    if (file.type === 'application/pdf') {
      try {
        const { extractPdfText } = await import('@/engines/pdf/rasterize');
        const pages = await extractPdfText(await file.arrayBuffer());
        setInput(pages.map((p) => p.text).join('\n\n').slice(0, MAX_CHARS));
      } catch { setInput('Could not read that PDF — paste the text instead.'); }
    } else if (file.type.startsWith('text/')) {
      setInput((await file.text()).slice(0, MAX_CHARS));
    }
  };

  const run = async () => {
    const text = input.trim().slice(0, MAX_CHARS);
    if (!text || busy || loadState !== 'ready') return;
    setBusy(true); setOutput(''); stopRef.current = false;
    const sys = mode === 'summarize'
      ? 'You are an expert at writing clear, concise summaries. Capture the key points faithfully.'
      : `You are a professional translator. Translate the user's text into ${lang}. Output ONLY the translation, no notes.`;
    const user = mode === 'summarize' ? `Summarize the following:\n\n${text}` : `Translate into ${lang}:\n\n${text}`;
    try {
      const stream = await engineRef.current.chat.completions.create({
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        stream: true, temperature: mode === 'translate' ? 0.2 : 0.4,
      });
      let acc = '';
      for await (const chunk of stream) { if (stopRef.current) break; acc += chunk.choices[0]?.delta?.content ?? ''; setOutput(acc); }
    } catch (e) { console.error(e); setOutput('⚠ Failed — try a shorter input or the Light model.'); }
    finally { setBusy(false); }
  };

  const copyOut = async () => { await navigator.clipboard?.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1400); };

  if (supported === false) {
    return <Shell><div className="border border-amber-500/30 bg-amber-50/40 p-6"><div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> WebGPU not available</div><p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">This runs the AI on your device&apos;s GPU. Use a recent Chrome or Edge on desktop.</p></div></Shell>;
  }

  return (
    <Shell>
      {loadState !== 'ready' ? (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Choose a model</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {MODELS.map((m) => (
              <button key={m.id} type="button" disabled={loadState === 'loading'} onClick={() => setModelId(m.id)}
                className={`border p-3 text-left transition ${modelId === m.id ? 'border-[var(--color-cat-dev)] bg-[var(--color-cat-dev)]/[0.06]' : 'border-black/[0.08] hover:border-black/20'}`}>
                <div className="text-[13px] font-bold text-[var(--color-fg)]">{m.label}</div>
                <div className="font-mono text-[11px] text-[var(--color-fg-muted)]">{m.size}</div>
              </button>
            ))}
          </div>
          {loadState === 'loading' ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-[13px]"><Loader2 className="h-4 w-4 animate-spin" /> {loadText}</div>
              <div className="mt-2 h-1.5 w-full overflow-hidden bg-black/[0.08]"><div className="h-full bg-[var(--color-cat-dev)]" style={{ width: `${Math.round(loadPct * 100)}%` }} /></div>
              <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">Downloads once to your browser, then works offline.</p>
            </div>
          ) : (
            <button type="button" onClick={loadModel} className="mt-4 flex items-center gap-2 bg-[var(--color-cat-dev)] px-5 py-3 text-[14px] font-semibold text-white transition hover:brightness-110"><Download className="h-4 w-4" /> Load model & start</button>
          )}
          {loadText.startsWith('Failed') && <p className="mt-2 text-[12px] text-red-600">{loadText}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex">
              <button type="button" onClick={() => setMode('summarize')} className={`flex items-center gap-1.5 border px-4 py-2 text-[13px] font-bold ${mode === 'summarize' ? 'border-[var(--color-cat-dev)] bg-[var(--color-cat-dev)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}><Sparkles className="h-4 w-4" /> Summarize</button>
              <button type="button" onClick={() => setMode('translate')} className={`flex items-center gap-1.5 border border-l-0 px-4 py-2 text-[13px] font-bold ${mode === 'translate' ? 'border-[var(--color-cat-dev)] bg-[var(--color-cat-dev)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}><Languages className="h-4 w-4" /> Translate</button>
            </div>
            {mode === 'translate' && (
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2 text-[13px] focus:outline-none">
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} className="ml-auto flex items-center gap-1.5 border border-black/[0.08] px-3 py-2 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)]"><Upload className="h-3.5 w-3.5" /> PDF / text file</button>
            <input ref={fileRef} type="file" accept="application/pdf,text/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPdf(f); }} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Input ({input.length}/{MAX_CHARS})</div>
              <textarea value={input} onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))} placeholder="Paste text, or drop a PDF above…" className="h-72 w-full resize-none border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[13px] focus:border-[var(--color-cat-dev)] focus:outline-none" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{mode === 'summarize' ? 'Summary' : `Translation (${lang})`}</span>
                {output && <button type="button" onClick={copyOut} className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">{copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />} Copy</button>}
              </div>
              <div className="h-72 w-full overflow-y-auto whitespace-pre-wrap border border-black/[0.08] bg-[var(--color-surface-2)] p-3 text-[13px] leading-relaxed">{output || <span className="text-[var(--color-fg-subtle)]">Result appears here.</span>}</div>
            </div>
          </div>

          <div className="flex gap-2">
            {!busy ? (
              <button type="button" onClick={run} disabled={!input.trim()} className="flex items-center justify-center gap-2 bg-[var(--color-cat-dev)] px-6 py-3 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]">{mode === 'summarize' ? <Sparkles className="h-4 w-4" /> : <Languages className="h-4 w-4" />} {mode === 'summarize' ? 'Summarize' : 'Translate'}</button>
            ) : (
              <button type="button" onClick={() => { stopRef.current = true; }} className="flex items-center gap-2 bg-red-600 px-6 py-3 text-[14px] font-semibold text-white"><Square className="h-4 w-4" /> Stop</button>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-dev)] text-white"><FileText className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Private Summarizer & Translator</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Summarize or translate text & PDFs on your own device. Nothing is uploaded.</p>
        </div>
      </header>
      {children}
      <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
        <span>The AI model runs in your browser via WebGPU. Your text and the result never leave your device.</span>
      </div>
    </div>
  );
}
