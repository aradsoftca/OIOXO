'use client';
import * as React from 'react';
import { Loader2, Download, Upload, Languages, FileText } from 'lucide-react';
import { downloadBlob } from '@/engines/ffmpeg';
import { translateDocument } from '@/engines/doctranslate';
import { TRANSLATE_LANGUAGES as LANGS } from '@/lib/i18n/languages';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'doc-translate';

const kind = (n: string) => n.toLowerCase().endsWith('.pdf') ? 'PDF' : n.toLowerCase().endsWith('.docx') ? 'Word document' : 'image';

export default function DocTranslate() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [from, setFrom] = React.useState('auto');
  const [to, setTo] = React.useState('en');
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState('');
  const [ratio, setRatio] = React.useState(0);
  const [error, setError] = React.useState('');
  const [out, setOut] = React.useState<{ url: string; blob: Blob; name: string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);

  const run = async () => {
    if (!file) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    setBusy(true); setError(''); setOut(null); setRatio(0);
    try {
      const { blob, ext } = await translateDocument(file, { to, from: from === 'auto' ? undefined : from, onProgress: (p, r) => { setPhase(p); setRatio(r); } });
      const base = file.name.replace(/\.[^.]+$/, '');
      setOut({ url: URL.createObjectURL(blob), blob, name: `${base}-${to}.${ext}` });
    } catch (e) { setError((e as Error).message || 'Could not translate this document.'); }
    finally { setBusy(false); setPhase(''); }
  };

  const isImg = out && /\.(png|jpe?g|webp)$/.test(out.name);
  const isPdf = out && out.name.endsWith('.pdf');

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!file ? (
        <div onClick={() => inputRef.current?.click()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setOut(null); } }} onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-black/[0.14] bg-[var(--color-surface-1)] px-6 py-16 text-center">
          <Languages className="h-8 w-8 text-[var(--color-cat-text)]" />
          <div className="text-[15px] font-semibold">Drop a PDF, Word doc, or image</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">It’s translated in place — same design and layout, just in your language. Nothing is uploaded.</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <FileText className="h-4 w-4 text-[var(--color-cat-text)]" />
          <span className="text-[12px] font-semibold">{file.name}</span>
          <span className="bg-black/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{kind(file.name)}</span>
          <button type="button" onClick={() => { setFile(null); setOut(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change</button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.docx,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setOut(null); } }} />

      {file && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] outline-none">
              <option value="auto">Detect language</option>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <span className="text-[var(--color-fg-subtle)]">→</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="border border-black/[0.12] bg-[var(--color-surface-1)] px-2 py-1.5 text-[13px] outline-none">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <button type="button" onClick={run} disabled={busy} className="flex items-center gap-2 bg-[var(--color-cat-text)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />} {busy ? `${phase || 'Working'}… ${Math.round(ratio * 100)}%` : 'Translate'}
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">Big files (like a long PDF) translate fully on your device, so they can take a few minutes. Translated text is fit to the original space; complex layouts may shift slightly.</p>
        </>
      )}

      {busy && ratio > 0 && <div className="h-1 w-full overflow-hidden bg-black/[0.06]"><div className="h-full bg-[var(--color-cat-text)] transition-[width]" style={{ width: `${ratio * 100}%` }} /></div>}
      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {out && (
        <div className="space-y-2 border border-[var(--color-cat-text)]/40 bg-[var(--color-surface-1)] p-4">
          {isImg && <img src={out.url} alt="translated" className="max-h-96 w-full object-contain" />}
          {isPdf && <iframe src={out.url} title="translated pdf" className="h-96 w-full border border-black/[0.08]" />}
          {!isImg && !isPdf && <div className="text-[13px] font-semibold">Translated document ready.</div>}
          <button type="button" onClick={() => downloadBlob(out.blob, out.name)} className="flex w-fit items-center gap-2 bg-[var(--color-cat-text)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Download className="h-3.5 w-3.5" /> Download</button>
        </div>
      )}
    </div>
  );
}
