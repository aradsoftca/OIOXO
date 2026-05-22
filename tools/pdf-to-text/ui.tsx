'use client';

import * as React from 'react';
import { Copy, Download, Loader2 } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';
import { extractPdfText, type ExtractedPage } from '@/engines/pdf/rasterize';

export default function PdfToTextTool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [pages, setPages] = React.useState<ExtractedPage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ page: number; total: number } | null>(null);
  const [preserveBreaks, setPreserveBreaks] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState('');

  const full = React.useMemo(
    () => pages.map((p) => `--- Page ${p.index + 1} ---\n${p.text.trim()}\n`).join('\n'),
    [pages],
  );

  const run = async (target: PdfFileItem) => {
    setBusy(true); setError(''); setPages([]); setProgress(null);
    try {
      const out = await extractPdfText(target.buffer, {
        preserveLineBreaks: preserveBreaks,
        onProgress: (p) => setProgress({ page: p.page, total: p.pageCount }),
      });
      setPages(out);
    } catch (e) {
      setError((e as Error).message || 'Could not read this PDF.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  React.useEffect(() => { if (item) void run(item); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item, preserveBreaks]);

  const copy = async () => {
    if (!full) return;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!item || !full) return;
    const base = item.file.name.replace(/\.[^.]+$/, '');
    const blob = new Blob([full], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            {pages.length > 0 && <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{pages.length} pages</span>}
            <label className="flex items-center gap-2 ml-2 text-[11px] text-[var(--color-fg-muted)]">
              <input type="checkbox" checked={preserveBreaks} onChange={(e) => setPreserveBreaks(e.target.checked)} className="h-3.5 w-3.5" />
              Preserve line breaks
            </label>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={copy} disabled={!pages.length}
                className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                <Copy className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={download} disabled={!pages.length}
                className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                <Download className="h-3 w-3" />
                .txt
              </button>
              <button type="button" onClick={() => { setItem(null); setPages([]); }}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                Change
              </button>
            </div>
          </div>

          {busy && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="font-medium">Reading {progress ? `page ${progress.page} / ${progress.total}` : 'PDF'}…</span>
              </div>
            </div>
          )}

          {error && <div className="text-[12px] text-red-600">{error}</div>}

          {pages.length > 0 && (
            <div className="max-h-[600px] overflow-y-auto border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3">
              {pages.map((p) => (
                <div key={p.index} className="border-b border-black/[0.04] py-3 last:border-b-0">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">Page {p.index + 1}</div>
                  <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-[var(--color-fg)]">{p.text.trim() || '(no text on this page)'}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
