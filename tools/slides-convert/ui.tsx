'use client';

import * as React from 'react';
import { Upload, Download, Loader2, Presentation, AlertTriangle } from 'lucide-react';
import { officeToContent } from '@/engines/office';
import { htmlToPdf } from '@/engines/document';
import { htmlToPlainText } from '@/engines/ebook';

type Target = 'pdf' | 'html' | 'txt';
const EXT = (f: File) => (f.name.split('.').pop() || '').toLowerCase();

export default function SlidesConvertTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [content, setContent] = React.useState<{ title: string; html: string } | null>(null);
  const [target, setTarget] = React.useState<Target>('pdf');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const legacy = file ? EXT(file) === 'ppt' : false;

  const load = async (f: File) => {
    if (!/\.(pptx|ppt|odp)$/i.test(f.name)) { setError('Please choose a .pptx, .ppt or .odp file.'); return; }
    setFile(f); setError(''); setBusy(true); setContent(null);
    try {
      setContent(await officeToContent(f, EXT(f)));
    } catch (e) {
      setError((e as Error).message || 'Could not read this presentation.');
    } finally { setBusy(false); }
  };

  const run = async () => {
    if (!file || !content) return;
    setBusy(true); setError('');
    try {
      const base = file.name.replace(/\.[^.]+$/, '');
      let blob: Blob, ext: string;
      if (target === 'pdf') { blob = await htmlToPdf(`<h1>${content.title}</h1>${content.html}`, base); ext = 'pdf'; }
      else if (target === 'html') { blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${content.title}</title><body>${content.html}</body>`], { type: 'text/html' }); ext = 'html'; }
      else { blob = new Blob([htmlToPlainText(content.html)], { type: 'text/plain' }); ext = 'txt'; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message || 'Conversion failed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!file && (
        <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]">
          <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" /> Drop a presentation (.pptx, .ppt, .odp) or click to browse
          </button>
          <input ref={inputRef} type="file" accept=".pptx,.ppt,.odp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
        </div>
      )}

      {file && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <Presentation className="h-4 w-4 text-[var(--color-cat-convert)]" />
              <span className="text-[12px] font-semibold">{file.name}</span>
              <button type="button" onClick={() => { setFile(null); setContent(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
            </div>
            <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {legacy ? 'Legacy .ppt: slide text is extracted in light mode (no layout/images).' : 'Slide text and structure are extracted — images and exact layout aren’t reproduced.'}
            </div>
            <div className="max-h-[460px] overflow-auto border border-black/[0.08] bg-white p-6 text-black">
              {busy && !content ? (
                <div className="flex items-center gap-2 text-[13px] text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Reading…</div>
              ) : content ? (
                <div dangerouslySetInnerHTML={{ __html: content.html }} />
              ) : null}
            </div>
          </div>
          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Convert to</div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(['pdf', 'html', 'txt'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTarget(t)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${target === t ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={run} disabled={busy || !content}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {busy ? 'Working…' : `Download ${target.toUpperCase()}`}
            </button>
            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
