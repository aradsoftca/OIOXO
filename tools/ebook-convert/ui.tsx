'use client';

import * as React from 'react';
import { Download, Loader2, BookOpen } from 'lucide-react';
import { epubToContent, htmlToPlainText } from '@/engines/ebook';
import { ConvertDropZone } from '@/components/tool/ConvertDropZone';
import { sanitizeHtml } from '@/lib/safe-html';

type Target = 'pdf' | 'html' | 'txt';

export default function EbookConvertTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [content, setContent] = React.useState<{ title: string; html: string } | null>(null);
  const [target, setTarget] = React.useState<Target>('pdf');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = async (f: File) => {
    if (!/\.epub$/i.test(f.name)) { setError('Please choose an EPUB file (.epub). MOBI/AZW3 coming soon.'); return; }
    setFile(f); setError(''); setBusy(true); setContent(null);
    try {
      setContent(await epubToContent(f));
    } catch (e) {
      setError((e as Error).message || 'Could not read this EPUB.');
    } finally { setBusy(false); }
  };

  const run = async () => {
    if (!file || !content) return;
    setBusy(true); setError('');
    try {
      const base = content.title.replace(/[^\w\s-]/g, '').trim() || file.name.replace(/\.[^.]+$/, '');
      let blob: Blob, ext: string;
      // Sanitize before BOTH PDF and HTML output. The EPUB body strips
      // <script>/<style>/<link> at extraction but leaves inline event
      // handlers like onclick=, so a hostile .epub could ship JS to anyone
      // who downloaded the converted HTML and opened it.
      const safeBody = sanitizeHtml(content.html);
      const escTitle = content.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (target === 'pdf') {
        const { htmlToPdf } = await import('@/engines/document');
        blob = await htmlToPdf(`<h1>${escTitle}</h1>${safeBody}`, base); ext = 'pdf';
      } else if (target === 'html') {
        blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${escTitle}</title><body>${safeBody}</body>`], { type: 'text/html' }); ext = 'html';
      } else {
        blob = new Blob([htmlToPlainText(content.html)], { type: 'text/plain' }); ext = 'txt';
      }
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `${base}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      setError((e as Error).message || 'Conversion failed.');
    } finally { setBusy(false); }
  };

  // Keyboard: Enter runs once an ebook is loaded, Esc clears it.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!file) return;
      if (e.key === 'Enter' && !busy && content) { e.preventDefault(); void run(); }
      else if (e.key === 'Escape') { e.preventDefault(); setFile(null); setContent(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4">
      {!file && (
        <ConvertDropZone
          accept=".epub"
          busy={busy}
          label="Drop an EPUB, click to browse, or paste"
          sublabel=".epub"
          onFiles={(files) => void load(files[0])}
        />
      )}

      {file && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <BookOpen className="h-4 w-4 text-[var(--color-cat-convert)]" />
              <span className="truncate text-[12px] font-semibold">{content?.title || file.name}</span>
              <button type="button" onClick={() => { setFile(null); setContent(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
            </div>
            <div className="max-h-[460px] overflow-auto border border-black/[0.08] bg-white p-6 text-black">
              {busy && !content ? (
                <div className="flex items-center gap-2 text-[13px] text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Reading…</div>
              ) : content ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.html.slice(0, 30000)) }} />
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
              <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">Text and chapters are preserved; embedded images are dropped for clean output.</div>
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
