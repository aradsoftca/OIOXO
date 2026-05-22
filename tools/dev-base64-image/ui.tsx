'use client';

import * as React from 'react';
import { Upload, Copy, Download, Check, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/cn';

type Mode = 'encode' | 'decode';
type Wrap = 'raw' | 'css' | 'html';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  let v = bytes; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function DevBase64ImageTool() {
  const [mode, setMode] = React.useState<Mode>('encode');
  const [dataUri, setDataUri] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [wrap, setWrap] = React.useState<Wrap>('raw');
  const [decodeInput, setDecodeInput] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/')) { setError('Drop an image file.'); return; }
    setError('');
    setFileName(next.name);
    const reader = new FileReader();
    reader.onload = () => setDataUri(reader.result as string);
    reader.onerror = () => setError('Could not read this file.');
    reader.readAsDataURL(next);
  };

  const output = React.useMemo(() => {
    if (!dataUri) return '';
    if (wrap === 'css') return `background-image: url("${dataUri}");`;
    if (wrap === 'html') return `<img src="${dataUri}" alt="" />`;
    return dataUri;
  }, [dataUri, wrap]);

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const decodedSrc = React.useMemo(() => {
    const v = decodeInput.trim();
    if (!v) return '';
    // Accept raw base64, data URIs, or css/html-wrapped strings.
    const match = v.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/);
    if (match) return match[0].replace(/\s/g, '');
    if (/^[A-Za-z0-9+/=\s]+$/.test(v)) return `data:image/png;base64,${v.replace(/\s/g, '')}`;
    return '';
  }, [decodeInput]);

  const downloadDecoded = () => {
    if (!decodedSrc) return;
    const a = document.createElement('a');
    a.href = decodedSrc;
    const ext = decodedSrc.match(/data:image\/([a-zA-Z0-9.+-]+)/)?.[1] ?? 'png';
    a.download = `decoded.${ext === 'svg+xml' ? 'svg' : ext === 'jpeg' ? 'jpg' : ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex border border-black/[0.08] bg-[var(--color-surface-1)] p-1">
        {(['encode', 'decode'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wider transition',
              mode === m ? 'bg-[var(--color-cat-dev)] text-white' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}>
            {m === 'encode' ? 'Image → Base64' : 'Base64 → Image'}
          </button>
        ))}
      </div>

      {mode === 'encode' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            {!dataUri ? (
              <div
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
                onDragOver={(e) => e.preventDefault()}
                className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
              >
                <button type="button" onClick={() => inputRef.current?.click()}
                  className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
                  <Upload className="h-5 w-5" />
                  Drop an image to encode as Base64
                </button>
                <input ref={inputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
                  <img src={dataUri} alt="" className="h-10 w-10 border border-black/[0.08] object-cover" />
                  <span className="text-[12px] font-semibold">{fileName}</span>
                  <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{formatBytes(output.length)} of text</span>
                  <button type="button" onClick={() => { setDataUri(''); setFileName(''); }}
                    className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                    Change
                  </button>
                </div>
                <textarea readOnly value={output} rows={12}
                  className="block w-full resize-y border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-fg)] focus:outline-none" />
              </>
            )}
          </div>
          <aside className="space-y-3">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Wrap as</div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(['raw', 'css', 'html'] as const).map((w) => (
                  <button key={w} type="button" onClick={() => setWrap(w)}
                    className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${wrap === w ? 'border-[var(--color-cat-dev)] bg-[var(--color-cat-dev)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={copy} disabled={!output}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-dev)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {error && <div className="text-[12px] text-red-600">{error}</div>}
          </aside>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Paste Base64 or data URI</div>
            <textarea value={decodeInput} onChange={(e) => setDecodeInput(e.target.value)} rows={14}
              placeholder="data:image/png;base64,iVBORw0KGgo… or raw Base64"
              className="block w-full resize-y border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:border-[var(--color-cat-dev)]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Preview</span>
              <button type="button" onClick={downloadDecoded} disabled={!decodedSrc}
                className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                <Download className="h-3 w-3" /> Download
              </button>
            </div>
            <div className="grid min-h-[300px] place-items-center border border-black/[0.08] bg-[repeating-conic-gradient(#0001_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-4">
              {decodedSrc ? (
                <img src={decodedSrc} alt="decoded" className="max-h-[280px] max-w-full object-contain"
                  onError={() => { /* invalid — preview stays empty */ }} />
              ) : (
                <div className="flex flex-col items-center gap-2 text-[12px] text-[var(--color-fg-subtle)]">
                  <ArrowLeftRight className="h-5 w-5" />
                  Paste a Base64 string to preview the image
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
