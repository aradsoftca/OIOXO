'use client';

import * as React from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { TileIcon } from '@/components/tiles/TileIcon';

type Kind = 'image' | 'svg' | 'pdf' | 'video' | 'audio' | 'text' | 'unknown';

const EXT: Record<string, Kind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image', ico: 'image',
  svg: 'svg',
  pdf: 'pdf',
  mp4: 'video', webm: 'video', ogv: 'video', m4v: 'video', mov: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', opus: 'audio',
  txt: 'text', md: 'text', markdown: 'text', json: 'text', csv: 'text', tsv: 'text', xml: 'text', html: 'text',
  htm: 'text', css: 'text', js: 'text', mjs: 'text', ts: 'text', tsx: 'text', jsx: 'text', yml: 'text', yaml: 'text',
  log: 'text', ini: 'text', conf: 'text', sh: 'text', py: 'text', go: 'text', rs: 'text', java: 'text', c: 'text',
  cpp: 'text', h: 'text', sql: 'text', toml: 'text', env: 'text', srt: 'text', vtt: 'text',
};

const MAX_TEXT = 2 * 1024 * 1024; // 2MB display cap

function extOf(name: string): string { return (name.split('.').pop() || '').toLowerCase(); }
function kindOf(file: File): Kind {
  const k = EXT[extOf(file.name)];
  if (k) return k;
  if (file.type.startsWith('image/')) return file.type.includes('svg') ? 'svg' : 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/') || /json|xml|javascript/.test(file.type)) return 'text';
  return 'unknown';
}
function fmtBytes(b: number): string {
  if (b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let v = b, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

export default function ViewerPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState('');
  const [kind, setKind] = React.useState<Kind>('unknown');
  const [text, setText] = React.useState<{ body: string; mode: 'plain' | 'json' | 'csv'; truncated: boolean } | null>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const open = React.useCallback(async (f: File) => {
    if (url) URL.revokeObjectURL(url);
    const k = kindOf(f);
    const objUrl = URL.createObjectURL(f);
    setFile(f); setKind(k); setUrl(objUrl); setText(null); setDims(null);

    if (k === 'text') {
      const slice = f.slice(0, MAX_TEXT);
      const raw = await slice.text();
      const ext = extOf(f.name);
      let mode: 'plain' | 'json' | 'csv' = 'plain';
      let body = raw;
      if (ext === 'json') { try { body = JSON.stringify(JSON.parse(raw), null, 2); mode = 'json'; } catch { /* keep raw */ } }
      else if (ext === 'csv' || ext === 'tsv') mode = 'csv';
      setText({ body, mode, truncated: f.size > MAX_TEXT });
    }
  }, [url]);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const reset = () => { if (url) URL.revokeObjectURL(url); setFile(null); setUrl(''); setText(null); setDims(null); };

  return (
    <div className="mx-auto w-[min(1000px,96vw)] py-4">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center text-white" style={{ background: 'var(--brand-gradient)' }}>
            <TileIcon name="eye" size={20} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Universal Viewer</div>
            <h1 className="text-[24px] font-bold tracking-tight">View any file</h1>
          </div>
        </div>
        {file && (
          <button type="button" onClick={reset} className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
            <X className="h-3.5 w-3.5" /> Close
          </button>
        )}
      </div>

      {!file ? (
        <label
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void open(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/[0.18] bg-[var(--color-surface-1)] py-20 transition hover:border-[var(--brand-1)]"
        >
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); }} />
          <Upload className="h-8 w-8 text-[var(--color-fg-muted)]" />
          <div className="text-[15px] font-semibold text-[var(--color-fg)]">Drop a file or click to browse</div>
          <div className="text-[12px] text-[var(--color-fg-subtle)]">Images · PDF · video · audio · text, code, JSON, CSV, SVG — opened on your device, never uploaded</div>
        </label>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-2.5 text-[12px]">
            <span className="font-semibold text-[var(--color-fg)]">{file.name}</span>
            <span className="text-[var(--color-fg-muted)]">{fmtBytes(file.size)}</span>
            <span className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">{kind}</span>
            {dims && <span className="font-mono text-[var(--color-fg-muted)]">{dims.w}×{dims.h}</span>}
            <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto text-[var(--brand-1)] hover:underline">Open another</button>
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); }} />
          </div>

          <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-[oklch(20%_0.008_250)]">
            {(kind === 'image' || kind === 'svg') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={file.name} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="mx-auto max-h-[75vh] w-auto object-contain" />
            )}
            {kind === 'pdf' && <iframe src={url} title={file.name} className="h-[80vh] w-full bg-white" />}
            {kind === 'video' && <video src={url} controls className="mx-auto max-h-[75vh] w-full bg-black" />}
            {kind === 'audio' && (
              <div className="grid place-items-center gap-4 py-16">
                <TileIcon name="music-2" size={40} className="text-white/70" />
                <audio src={url} controls className="w-[min(520px,90%)]" />
              </div>
            )}
            {kind === 'text' && text && <TextView body={text.body} mode={text.mode} truncated={text.truncated} />}
            {kind === 'unknown' && (
              <div className="grid place-items-center gap-3 py-20 text-center text-white/80">
                <FileText className="h-10 w-10 text-white/50" />
                <div className="text-[15px] font-semibold">No inline preview for this type</div>
                <p className="max-w-md text-[13px] text-white/55">
                  This format can&apos;t be shown directly in the browser yet. You can still convert it with the{' '}
                  <a href="/convert" className="text-white underline">converter</a>.
                </p>
                <a href={url} download={file.name} className="mt-1 rounded-lg bg-white/15 px-4 py-2 text-[12px] font-semibold text-white hover:bg-white/25">Download file</a>
              </div>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">Everything is read locally in your browser — the file never leaves your device.</p>
        </div>
      )}
    </div>
  );
}

function TextView({ body, mode, truncated }: { body: string; mode: 'plain' | 'json' | 'csv'; truncated: boolean }) {
  if (mode === 'csv') {
    const sep = body.includes('\t') && !body.includes(',') ? '\t' : ',';
    const rows = body.split(/\r?\n/).filter(Boolean).slice(0, 1000).map((r) => r.split(sep));
    return (
      <div className="max-h-[75vh] overflow-auto bg-white">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className={i === 0 ? 'bg-black/[0.04] font-semibold' : 'odd:bg-black/[0.015]'}>
                {cells.map((c, j) => <td key={j} className="border border-black/[0.06] px-2 py-1 align-top text-[var(--color-fg)]">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="max-h-[75vh] overflow-auto bg-white">
      {truncated && <div className="bg-amber-50 px-4 py-1.5 text-[11px] text-amber-700">Large file — showing the first 2&nbsp;MB.</div>}
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap break-words">{body}</pre>
    </div>
  );
}
