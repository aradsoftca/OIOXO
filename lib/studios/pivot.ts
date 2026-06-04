export type Agg = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'median' | 'stdev';

export interface PivotConfig {
  rows: number[];
  cols: number[];
  values: { col: number; agg: Agg; label?: string }[];
  filter?: { col: number; allowed: Set<string> }[];
}

export interface PivotTable {
  rowHeaders: string[][];
  colHeaders: string[][];
  cells: (number | string)[][];
  rowTotals: number[];
  colTotals: number[];
  grandTotal: number;
  headers: string[];
}

function num(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[,$%\s]/g, '')); return isNaN(n) ? NaN : n; }
  return NaN;
}

// Fold-based min/max — Math.max(...arr) throws "Maximum call stack size
// exceeded" on arrays > ~120k entries (V8's argument-count cap), and a
// pivot group can easily exceed that on a large sheet.
function minOf(arr: number[]): number { let m = arr[0]; for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i]; return m; }
function maxOf(arr: number[]): number { let m = arr[0]; for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; }

function aggregate(values: number[], agg: Agg): number {
  const nums = values.filter(v => !isNaN(v));
  if (!nums.length) return 0;
  switch (agg) {
    case 'sum':    return nums.reduce((a, b) => a + b, 0);
    case 'count':  return values.length;
    case 'avg':    return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':    return minOf(nums);
    case 'max':    return maxOf(nums);
    case 'median': { const s = [...nums].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]; }
    case 'stdev':  { const m = nums.reduce((a, b) => a + b, 0) / nums.length; return Math.sqrt(nums.reduce((s, n) => s + (n - m) ** 2, 0) / nums.length); }
  }
}

export function buildPivot(rows: any[][], headers: string[], config: PivotConfig): PivotTable {
  const filtered = config.filter?.length
    ? rows.filter(r => config.filter!.every(f => f.allowed.has(String(r[f.col] ?? ''))))
    : rows;

  const rowKeyOf = (r: any[]) => config.rows.map(c => String(r[c] ?? ''));
  const colKeyOf = (r: any[]) => config.cols.map(c => String(r[c] ?? ''));

  const rowKeys = new Set<string>();
  const colKeys = new Set<string>();
  const rowKeyArr = new Map<string, string[]>();
  const colKeyArr = new Map<string, string[]>();
  for (const r of filtered) {
    const rk = rowKeyOf(r); const rkS = rk.join(''); rowKeys.add(rkS); rowKeyArr.set(rkS, rk);
    const ck = colKeyOf(r); const ckS = ck.join(''); colKeys.add(ckS); colKeyArr.set(ckS, ck);
  }
  // Natural sort: numeric segments compared as numbers (so "10" follows "2",
  // not "1"). Falls back to locale string compare for purely textual keys.
  // Previously plain `.sort()` ordered numeric keys lexicographically, so a
  // pivot table with month/day columns showed "10" before "2".
  const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const sortedRows = [...rowKeys].sort(naturalCompare);
  const sortedCols = [...colKeys].sort(naturalCompare);
  const colCount = sortedCols.length * config.values.length;

  const groups = new Map<string, any[][]>();
  for (const r of filtered) {
    const rk = rowKeyOf(r).join('');
    const ck = colKeyOf(r).join('');
    const key = `${rk}${ck}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const cells: (number | string)[][] = [];
  const rowTotals: number[] = new Array(sortedRows.length).fill(0);
  const colTotals: number[] = new Array(colCount).fill(0);
  let grandTotal = 0;

  for (let r = 0; r < sortedRows.length; r++) {
    const row: (number | string)[] = [];
    for (let c = 0; c < sortedCols.length; c++) {
      const key = `${sortedRows[r]}${sortedCols[c]}`;
      const grp = groups.get(key) ?? [];
      for (let v = 0; v < config.values.length; v++) {
        const vc = config.values[v];
        const vals = grp.map(g => num(g[vc.col]));
        const result = aggregate(vals, vc.agg);
        row.push(result);
        const colIdx = c * config.values.length + v;
        rowTotals[r] += result;
        colTotals[colIdx] += result;
        grandTotal += result;
      }
    }
    cells.push(row);
  }

  return {
    rowHeaders: sortedRows.map(k => rowKeyArr.get(k) ?? []),
    colHeaders: sortedCols.map(k => colKeyArr.get(k) ?? []),
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    headers,
  };
}

export function pivotToCells(pivot: PivotTable, config: PivotConfig): { cells: Record<string, { raw: string }>; rows: number; cols: number } {
  const out: Record<string, { raw: string }> = {};
  const rowDepth = config.rows.length;
  const colDepth = config.cols.length;
  const colsPerCol = config.values.length;

  for (let i = 0; i < pivot.headers.length && i < rowDepth; i++) {
    out[`${colDepth + 1}_${i}`] = { raw: pivot.headers[config.rows[i]] ?? `Row ${i + 1}` };
  }
  for (let c = 0; c < pivot.colHeaders.length; c++) {
    for (let d = 0; d < colDepth; d++) {
      out[`${d}_${rowDepth + c * colsPerCol}`] = { raw: pivot.colHeaders[c][d] ?? '' };
    }
    for (let v = 0; v < config.values.length; v++) {
      const vc = config.values[v];
      const label = vc.label ?? `${vc.agg}(${pivot.headers[vc.col] ?? `Col ${vc.col}`})`;
      out[`${colDepth}_${rowDepth + c * colsPerCol + v}`] = { raw: label };
    }
  }
  const dataStartRow = colDepth + 1;
  const dataStartCol = rowDepth;
  for (let r = 0; r < pivot.rowHeaders.length; r++) {
    for (let d = 0; d < rowDepth; d++) {
      out[`${dataStartRow + r}_${d}`] = { raw: pivot.rowHeaders[r][d] ?? '' };
    }
    for (let c = 0; c < pivot.cells[r].length; c++) {
      const val = pivot.cells[r][c];
      out[`${dataStartRow + r}_${dataStartCol + c}`] = { raw: typeof val === 'number' ? String(Number(val.toFixed(4))) : String(val) };
    }
    out[`${dataStartRow + r}_${dataStartCol + pivot.cells[r].length}`] = { raw: String(Number(pivot.rowTotals[r].toFixed(4))) };
  }
  out[`${dataStartRow + pivot.rowHeaders.length}_${dataStartCol - 1}`] = { raw: 'Total' };
  for (let c = 0; c < pivot.colTotals.length; c++) {
    out[`${dataStartRow + pivot.rowHeaders.length}_${dataStartCol + c}`] = { raw: String(Number(pivot.colTotals[c].toFixed(4))) };
  }
  out[`${dataStartRow + pivot.rowHeaders.length}_${dataStartCol + pivot.colTotals.length}`] = { raw: String(Number(pivot.grandTotal.toFixed(4))) };

  return { cells: out, rows: dataStartRow + pivot.rowHeaders.length + 2, cols: dataStartCol + pivot.colTotals.length + 2 };
}
