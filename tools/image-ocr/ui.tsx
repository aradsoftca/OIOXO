'use client';

import * as React from 'react';
import { Upload, Loader2, Copy, Download, FileText, Languages, Image as ImageIcon, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { recognize, OCR_LANGUAGES, type OcrProgress, type OcrResult } from '@/engines/ocr';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'image-ocr';

export default function ImageOcrTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState<string>('');
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [language, setLanguage] = React.useState<string>('eng');
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<OcrProgress | null>(null);
  const [result, setResult] = React.useState<OcrResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  const run = React.useCallback(async (target: File, lang: string) => {
    const sizeHit = checkLever(POLICY_KEY, 'input-size', target.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    setRunning(true);
    setProgress({ phase: 'Preparing', ratio: 0 });
    setResult(null);
    try {
      const out = await recognize(target, { language: lang, onProgress: (p) => setProgress(p) });
      setResult(out);
    } catch (err) {
      console.error('OCR failed', err);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [isPro, policyGate]);

  const loadFile = React.useCallback(async (next: File) => {
    if (!next.type.startsWith('image/')) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(next);
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
    setFile(next);
    setSourceUrl(url);
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setResult(null);
    void run(next, language);
  }, [sourceUrl, language, run]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  };

  const copyText = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = (ext: 'txt' | 'srt') => {
    if (!result || !file) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    const body = result.text;
    const blob = new Blob([body], { type: ext === 'txt' ? 'text/plain' : 'application/x-subrip' });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `${base}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const wordCount = result ? result.text.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = result ? result.text.length : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {policyGate.element}
      {/* Stage */}
      <div className="space-y-4">
        <div
          ref={stageRef}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            'relative aspect-[4/3] overflow-hidden border border-black/[0.08] bg-[oklch(20%_0.008_250)]',
            !sourceUrl && 'flex items-center justify-center',
          )}
        >
          {!sourceUrl && (
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
                  Drop an image here
                </div>
                <div className="mt-1 text-[13px] text-white/55">
                  JPG · PNG · WebP · BMP · TIFF — files stay on your device
                </div>
              </div>
              <div className="border border-white/10 px-3 py-1.5 text-[12px] text-white/70">
                or click to browse
              </div>
            </button>
          )}

          {sourceUrl && (
            <>
              <img
                ref={imgRef}
                src={sourceUrl}
                alt="source"
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
              {running && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                  <div className="w-72 space-y-3 text-center">
                    <Wand2 className="mx-auto h-7 w-7 animate-pulse text-white" />
                    <div className="text-[14px] font-semibold text-white">
                      {progress?.phase ?? 'Working'}…
                    </div>
                    <div className="h-1 w-full overflow-hidden bg-white/10">
                      <div
                        className="h-full bg-[var(--color-cat-image)] transition-[width] duration-150 ease-out"
                        style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {dims && (
                <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur">
                  {dims.w}×{dims.h}
                  {result && <span className="text-white/50">· conf {Math.round(result.confidence)}%</span>}
                </div>
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }}
          />
        </div>

        {/* Recognized text */}
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <FileText className="h-3.5 w-3.5" />
              Recognized text
              {result && <span className="ml-2 font-mono text-[10px] text-[var(--color-fg-subtle)] normal-case tracking-normal">{wordCount} words · {charCount} chars</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={copyText}
                disabled={!result}
                className={cn(
                  'flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium transition',
                  result ? 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]' : 'text-[var(--color-fg-subtle)]',
                )}
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => download('txt')}
                disabled={!result}
                className={cn(
                  'flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium transition',
                  result ? 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]' : 'text-[var(--color-fg-subtle)]',
                )}
              >
                <Download className="h-3 w-3" />
                .txt
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={result?.text ?? ''}
            placeholder={file ? 'Reading…' : 'Drop an image to read the text inside.'}
            className="block h-64 w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
        </div>
      </div>

      {/* Controls */}
      <aside className="space-y-5">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <Languages className="h-3.5 w-3.5" />
              Language
            </div>
            <select
              value={language}
              onChange={(e) => {
                const lang = e.target.value;
                setLanguage(lang);
                if (file && !running) void run(file, lang);
              }}
              disabled={running}
              className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-image)] disabled:opacity-60"
            >
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              Each new language downloads its data on first use, then stays cached.
            </div>
          </div>

          {result && result.lines.length > 0 && (
            <div className="border-t border-black/[0.06] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
                Stats
              </div>
              <dl className="mt-2 space-y-1.5 text-[12px]">
                <div className="flex justify-between"><dt className="text-[var(--color-fg-muted)]">Lines</dt><dd className="font-mono text-[var(--color-fg)]">{result.lines.length}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--color-fg-muted)]">Words</dt><dd className="font-mono text-[var(--color-fg)]">{result.words.length}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--color-fg-muted)]">Confidence</dt><dd className="font-mono text-[var(--color-fg)]">{Math.round(result.confidence)}%</dd></div>
              </dl>
            </div>
          )}
        </div>

        {file && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" />
            Replace image
          </button>
        )}

        {file && !running && result && (
          <button
            type="button"
            onClick={() => void run(file, language)}
            className="flex w-full items-center justify-center gap-2 border border-black/[0.08] py-2.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Read again
          </button>
        )}
      </aside>
    </div>
  );
}
