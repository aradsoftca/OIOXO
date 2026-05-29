'use client';

import * as React from 'react';
import { Upload, Download, Loader2, Table } from 'lucide-react';
import { readWorkbook, convertSheet, type SheetTarget } from '@/engines/document';

export default function SheetConvertTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [sheets, setSheets] = React.useState<string[]>([]);
  const [sheet, setSheet] = React.useState('');
  const [target, setTarget] = React.useState<SheetTarget>('csv');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = async (f: File) => {
    setFile(f); setError(''); setBusy(true);
    try {
      const { sheetNames } = await readWorkbook(f);
      setSheets(sheetNames);
      setSheet(sheetNames[0] ?? '');
    } catch (e) {
      setError((e as Error).message || 'Could not read this spreadsheet.');
    } finally { setBusy(false); }
  };

  const run = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const { blob, ext } = await convertSheet(file, target, sheet);
      const base = file.name.replace(/\.[^.]+$/, '');
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

  return (
    <div className="space-y-4">
      {!file && (
        <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]">
          <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" /> Drop a spreadsheet (XLSX, XLS, ODS, CSV) or click to browse
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods,.csv,.tsv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
        </div>
      )}

      {file && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <Table className="h-4 w-4 text-[var(--color-cat-convert)]" />
            <span className="text-[12px] font-semibold">{file.name}</span>
            {sheets.length > 0 && <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{sheets.length} sheet{sheets.length === 1 ? '' : 's'}</span>}
            <button type="button" onClick={() => { setFile(null); setSheets([]); }} className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              {sheets.length > 1 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Sheet</div>
                  <select value={sheet} onChange={(e) => setSheet(e.target.value)}
                    className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-convert)]">
                    {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Convert to</div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {(['csv', 'xlsx', 'html', 'json'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTarget(t)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${target === t ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">
                  {target === 'csv' || target === 'html' || target === 'json' ? 'Exports the selected sheet.' : 'Repackages the whole workbook as XLSX.'}
                </div>
              </div>
            </div>
            <aside className="space-y-3">
              <button type="button" onClick={run} disabled={busy || !sheets.length}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Convert to {target.toUpperCase()}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
