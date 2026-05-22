'use client';

import * as React from 'react';
import { Upload, Loader2, Copy, Download, FileText, Languages, FileX, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { recognize, OCR_LANGUAGES } from '@/engines/ocr';
import { rasterizePdf, getPdfPageCount } from '@/engines/pdf/rasterize';

interface PageResult {
  index: number;
  text: string;
  confidence: number;
}

export default function PdfOcrTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [pageCount, setPageCount] = React.useState(0);
  const [language, setLanguage] = React.useState('eng');
  const [resolution, setResolution] = React.useState(1600);
  const [running, setRunning] = React.useState(false);
  const [stage, setStage] = React.useState<string>('');
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [pages, setPages] = React.useState<PageResult[]>([]);
  const [copied, setCopied] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fullText = React.useMemo(
    () => pages.map((p) => `--- Page ${p.index + 1} ---\n${p.text.trim()}\n`).join('\n'),
    [pages],
  );

  const meanConfidence = React.useMemo(
    () => pages.length ? Math.round(pages.reduce((s, p) => s + p.confidence, 0) / pages.length) : 0,
    [pages],
  );

  const run = React.useCallback(async (target: File, lang: string, maxEdge: number) => {
    setRunning(true);
    setPages([]);
    setStage('Reading PDF');
    setProgress(null);
    try {
      const buffer = await target.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setPageCount(count);
      setStage('Rendering pages');
      const rendered = await rasterizePdf(buffer, {
        maxEdge,
        onProgress: (p) => setProgress({ done: p.page, total: p.pageCount }),
      });

      setStage('Reading text');
      setProgress({ done: 0, total: rendered.length });
      const results: PageResult[] = [];
      for (let i = 0; i < rendered.length; i++) {
        const p = rendered[i];
        const res = await recognize(p.canvas, { language: lang });
        results.push({ index: p.index, text: res.text, confidence: res.confidence });
        setPages([...results]);
        setProgress({ done: i + 1, total: rendered.length });
      }
    } catch (err) {
      console.error('PDF OCR failed', err);
    } finally {
      setRunning(false);
      setStage('');
      setProgress(null);
    }
  }, []);

  const loadFile = React.useCallback(async (next: File) => {
    if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) return;
    setFile(next);
    setPages([]);
    void run(next, language, resolution);
  }, [language, resolution, run]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const copyText = async () => {
    if (!fullText) return;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!file || !fullText) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    const blob = new Blob([fullText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const ratio = progress ? Math.max(0, Math.min(1, progress.done / Math.max(1, progress.total))) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {!file ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-[4/3] items-center justify-center border border-black/[0.08] bg-[oklch(20%_0.008_250)]"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-4 px-6 text-center"
            >
              <div className="bg-white/[0.06] p-4">
                <Upload className="h-6 w-6 text-white/80" />
              </div>
              <div>
                <div className="text-[18px] font-semibold tracking-tight text-white">
                  Drop a PDF here
                </div>
                <div className="mt-1 text-[13px] text-white/55">
                  Scanned or text PDFs — files stay on your device
                </div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">
                or click to browse
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }}
            />
          </div>
        ) : (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-[var(--color-cat-pdf)]" />
                <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">{file.name}</div>
                <div className="shrink-0 text-[11px] font-mono text-[var(--color-fg-subtle)]">
                  {pageCount > 0 && `${pageCount} pages`}
                  {pages.length > 0 && pageCount > 0 && ` · conf ${meanConfidence}%`}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyText}
                  disabled={!pages.length}
                  className={cn(
                    'flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium transition',
                    pages.length ? 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]' : 'text-[var(--color-fg-subtle)]',
                  )}
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={download}
                  disabled={!pages.length}
                  className={cn(
                    'flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium transition',
                    pages.length ? 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]' : 'text-[var(--color-fg-subtle)]',
                  )}
                >
                  <Download className="h-3 w-3" />
                  .txt
                </button>
              </div>
            </div>

            {running && (
              <div className="border-b border-black/[0.06] px-4 py-3">
                <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
                  <Wand2 className="h-3.5 w-3.5 animate-pulse" />
                  <span className="font-medium">{stage}</span>
                  {progress && <span className="ml-auto font-mono text-[var(--color-fg-muted)]">{progress.done} / {progress.total}</span>}
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden bg-black/[0.06]">
                  <div
                    className="h-full bg-[var(--color-cat-pdf)] transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="max-h-[560px] overflow-y-auto px-4 py-3">
              {pages.length === 0 && !running && (
                <div className="py-12 text-center text-[13px] text-[var(--color-fg-subtle)]">
                  No text yet — drop a different file or try a higher resolution.
                </div>
              )}
              {pages.map((p) => (
                <div key={p.index} className="border-b border-black/[0.04] py-3 last:border-b-0">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
                    <span>Page {p.index + 1}</span>
                    <span className="font-mono">{Math.round(p.confidence)}%</span>
                  </div>
                  <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-[var(--color-fg)]">{p.text.trim() || '(empty)'}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <Languages className="h-3.5 w-3.5" />
              Language
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={running}
              className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)] disabled:opacity-60"
            >
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="border-t border-black/[0.06] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              Resolution
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                { v: 1200, label: 'Fast' },
                { v: 1600, label: 'Standard' },
                { v: 2400, label: 'Detailed' },
              ].map((r) => (
                <button
                  key={r.v}
                  type="button"
                  disabled={running}
                  onClick={() => setResolution(r.v)}
                  className={cn(
                    'border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-60',
                    resolution === r.v
                      ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)] text-white'
                      : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:border-black/20',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              Higher resolution catches small text on scans, but each page takes longer.
            </div>
          </div>
        </div>

        {file && (
          <>
            <button
              type="button"
              onClick={() => file && void run(file, language, resolution)}
              disabled={running}
              className={cn(
                'flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold transition',
                running ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-pdf)] text-white hover:brightness-110',
              )}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {running ? 'Reading…' : 'Read again'}
            </button>
            <button
              type="button"
              onClick={() => { setFile(null); setPages([]); setPageCount(0); }}
              disabled={running}
              className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60"
            >
              <FileX className="h-4 w-4" />
              Clear
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
