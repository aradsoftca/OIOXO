'use client';

/**
 * Sheets Studio — oioxo / newxonvert version.
 * A browser spreadsheet: editable grid, a formula engine (cell refs, ranges,
 * SUM/AVERAGE/MIN/MAX/COUNT/PRODUCT + arithmetic), and XLSX/CSV import-export
 * via SheetJS. Everything runs locally — nothing is uploaded.
 */

import * as React from 'react';
import { Upload, Download, Plus, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { setRecent } from '@/lib/storage/recent';
// Formula engine extracted to a shared, unit-tested module (Wave 2): now with
// IF / VLOOKUP / COUNTIF / SUMIF / text / date functions, not just 8 math fns.
import { colName, cellKey as key, makeEvaluator } from '@/lib/studios/sheet-formula';


const START_ROWS = 40;
const START_COLS = 12;

export default function SheetsStudioUI() {
  const [cells, setCells] = React.useState<Record<string, string>>({ A1: 'Item', B1: 'Qty', C1: 'Price', D1: 'Total', A2: 'Widget', B2: '3', C2: '9.99', D2: '=B2*C2' });
  const [rows, setRows] = React.useState(START_ROWS);
  const [cols, setCols] = React.useState(START_COLS);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [active, setActive] = React.useState('A1');
  const [name, setName] = React.useState('spreadsheet');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const evalRef = React.useMemo(() => makeEvaluator(cells), [cells]);
  const display = (k: string) => { const v = evalRef(k); return v === '' ? '' : String(v); };

  const setCell = (k: string, val: string) =>
    setCells((prev) => { const next = { ...prev }; if (val === '') delete next[k]; else next[k] = val; return next; });

  const load = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
      const next: Record<string, string> = {};
      let maxC = START_COLS;
      aoa.forEach((row, r) => {
        (row as unknown[]).forEach((cell, c) => {
          if (cell !== '' && cell != null) next[key(r, c)] = String(cell);
          if (c + 1 > maxC) maxC = c + 1;
        });
      });
      setCells(next);
      setRows(Math.max(START_ROWS, aoa.length + 5));
      setCols(Math.max(START_COLS, maxC + 2));
      setName(file.name.replace(/\.[^.]+$/, '') || 'spreadsheet');
    } catch {
      // leave the current sheet untouched on a bad file
    }
  };

  const buildAoA = (): (string | number)[][] => {
    const out: (string | number)[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: (string | number)[] = [];
      let any = false;
      for (let c = 0; c < cols; c++) {
        const v = evalRef(key(r, c));
        if (v !== '') any = true;
        row.push(v);
      }
      if (any) out.push(row); else out.push([]);
    }
    // trim trailing empty rows
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  };

  const exportAs = (kind: 'xlsx' | 'csv') => {
    const ws = XLSX.utils.aoa_to_sheet(buildAoA());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const ext = kind;
    const out = XLSX.write(wb, { bookType: kind, type: 'array' });
    const blob = new Blob([out], { type: kind === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Defer revoke — mobile Safari/Firefox can abort the download if the
    // blob URL is torn down before the stream starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setRecent('studio-sheets', `${name}.${ext}`);
  };

  const btn = 'flex items-center gap-2 border border-black/[0.08] px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]';

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Import
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
        <button type="button" className={btn} onClick={() => exportAs('xlsx')}>
          <Download className="h-3.5 w-3.5" /> XLSX
        </button>
        <button type="button" className={btn} onClick={() => exportAs('csv')}>
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={btn} onClick={() => setRows((r) => r + 10)}>
          <Plus className="h-3.5 w-3.5" /> Rows
        </button>
        <button type="button" className={btn} onClick={() => setCols((c) => c + 4)}>
          <Plus className="h-3.5 w-3.5" /> Cols
        </button>
        <div className="ml-auto flex items-center gap-2 text-[var(--color-fg-muted)]">
          <FileSpreadsheet className="h-4 w-4" />
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-40 bg-transparent text-[13px] text-[var(--color-fg)] outline-none border-b border-black/[0.08] py-0.5" />
        </div>
      </div>

      {/* formula bar */}
      <div className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5">
        <span className="font-mono text-[12px] font-bold text-[var(--color-fg-muted)] w-12">{active}</span>
        <span className="text-[var(--color-fg-subtle)]">=</span>
        <input
          value={cells[active] ?? ''}
          onChange={(e) => setCell(active, e.target.value)}
          placeholder="value or =SUM(A1:A9)"
          className="flex-1 bg-transparent font-mono text-[13px] text-[var(--color-fg)] outline-none"
        />
      </div>

      {/* grid */}
      <div className="overflow-auto border border-black/[0.08]" style={{ maxHeight: '62vh' }}>
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 w-10 border border-black/[0.08] bg-[var(--color-surface-2)]" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="sticky top-0 z-10 min-w-[88px] border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] font-bold text-[var(--color-fg-muted)]">
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-center text-[11px] font-bold text-[var(--color-fg-muted)]">
                  {r + 1}
                </td>
                {Array.from({ length: cols }, (_, c) => {
                  const k = key(r, c);
                  const isActive = active === k;
                  return (
                    <td key={c} className={`border border-black/[0.06] p-0 ${isActive ? 'outline outline-2 outline-[var(--color-cat-convert)]' : ''}`}>
                      <input
                        value={editing === k ? (cells[k] ?? '') : display(k)}
                        onFocus={() => { setActive(k); setEditing(k); }}
                        onBlur={() => setEditing((e) => (e === k ? null : e))}
                        onChange={(e) => setCell(k, e.target.value)}
                        className="h-7 w-full min-w-[88px] bg-transparent px-2 text-[13px] text-[var(--color-fg)] outline-none focus:bg-[var(--color-surface-1)]"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--color-fg-subtle)]">
        Formulas: start a cell with <span className="font-mono">=</span> — e.g. <span className="font-mono">=B2*C2</span>,
        <span className="font-mono"> =SUM(A1:A9)</span>, <span className="font-mono">=AVERAGE(B2:B9)</span>. Imports/exports stay on your device.
      </p>
    </div>
  );
}
