'use client';

import * as React from 'react';
import { Upload, Loader2, Download, FileDown, Lock } from 'lucide-react';
import { openArchive, listArchive, zipFiles, formatBytes, type ArchiveEntry } from '@/engines/archive';

export default function ArchiveExtractTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [entries, setEntries] = React.useState<ArchiveEntry[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [stage, setStage] = React.useState('');
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = async (f: File) => {
    setFile(f); setError(''); setEntries(null); setBusy(true); setStage('Reading archive');
    try {
      const archive = await openArchive(f);
      if (await archive.hasEncryptedData()) {
        const pw = window.prompt('This archive is password-protected. Enter the password:');
        if (pw) await archive.usePassword(pw);
      }
      const list = await listArchive(archive);
      setEntries(list);
      if (!list.length) setError('No files found — the archive may be empty or use an unsupported format.');
    } catch (e) {
      setError((e as Error).message || 'Could not open this archive.');
    } finally {
      setBusy(false); setStage('');
    }
  };

  const downloadOne = async (entry: ArchiveEntry) => {
    setBusy(true);
    try {
      const f = await entry.extract();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const extractAll = async () => {
    if (!entries || !file) return;
    setBusy(true); setError(''); setStage(`Extracting 0/${entries.length}`);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < entries.length; i++) {
        const f = await entries[i].extract();
        files.push({ name: entries[i].path + f.name, data: new Uint8Array(await f.arrayBuffer()) });
        setStage(`Extracting ${i + 1}/${entries.length}`);
      }
      const zip = await zipFiles(files);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zip);
      a.download = file.name.replace(/\.[^.]+$/, '') + '-extracted.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setStage('');
    }
  };

  const totalSize = entries?.reduce((s, e) => s + e.size, 0) ?? 0;

  return (
    <div className="space-y-4">
      {!file && (
        <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]">
          <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" /> Drop an archive (ZIP, 7z, RAR, TAR, GZ, ISO…) or click to browse
          </button>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
        </div>
      )}

      {file && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{file.name}</span>
            {entries && <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{entries.length} files · {formatBytes(totalSize)}</span>}
            <button type="button" onClick={() => { setFile(null); setEntries(null); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          {busy && stage && (
            <div className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[12px] text-[var(--color-fg)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {stage}…
            </div>
          )}
          {error && <div className="flex items-center gap-1.5 text-[12px] text-red-600">{/^This archive is password/.test(error) && <Lock className="h-3.5 w-3.5" />}{error}</div>}

          {entries && entries.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <div className="max-h-[480px] overflow-y-auto border border-black/[0.08] bg-[var(--color-surface-1)]">
                {entries.map((e, i) => (
                  <button key={i} type="button" onClick={() => void downloadOne(e)} disabled={busy}
                    className="flex w-full items-center gap-3 border-b border-black/[0.04] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                    <FileDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-muted)]" />
                    <span className="flex-1 truncate font-mono text-[12px] text-[var(--color-fg)]">{e.path}{e.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-fg-muted)]">{formatBytes(e.size)}</span>
                  </button>
                ))}
              </div>
              <aside className="space-y-3">
                <button type="button" onClick={extractAll} disabled={busy}
                  className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Extract all → ZIP
                </button>
                <div className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">Click any row to pull out a single file. Everything happens on your device.</div>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
