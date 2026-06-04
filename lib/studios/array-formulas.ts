export function arrayFilter(array: any[], conditions: any[]): any[] {
  if (!Array.isArray(array) || !Array.isArray(conditions)) return [];
  return array.filter((_, i) => {
    const c = conditions[i];
    if (typeof c === 'boolean') return c;
    if (typeof c === 'number') return c !== 0;
    return !!c;
  });
}

export function arrayUnique(array: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const v of array) {
    const k = String(v);
    if (!seen.has(k)) { seen.add(k); out.push(v); }
  }
  return out;
}

export function arraySort(array: any[], descending = false): any[] {
  const out = [...array];
  out.sort((a, b) => {
    const na = parseFloat(String(a)), nb = parseFloat(String(b));
    if (!isNaN(na) && !isNaN(nb)) return descending ? nb - na : na - nb;
    return descending ? String(b).localeCompare(String(a)) : String(a).localeCompare(String(b));
  });
  return out;
}

export function arrayTranspose(matrix: any[][]): any[][] {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const flat = !Array.isArray(matrix[0]) ? matrix.map(v => [v]) : matrix;
  const rows = flat.length;
  // Find max column count without spreading — `Math.max(...arr)` throws on
  // very large arrays (Chrome/V8 caps argument list around 64-125k; Safari
  // is lower). A 100k-row TRANSPOSE call would crash instead of just being
  // slow. Loop is the safe equivalent.
  let cols = 0;
  for (const r of flat) {
    const len = Array.isArray(r) ? r.length : 1;
    if (len > cols) cols = len;
  }
  const out: any[][] = [];
  for (let c = 0; c < cols; c++) {
    const row: any[] = [];
    for (let r = 0; r < rows; r++) row.push(Array.isArray(flat[r]) ? flat[r][c] : flat[r]);
    out.push(row);
  }
  return out;
}

export function arraySequence(n: number, start = 1, step = 1): number[] {
  // Cap to a sane spreadsheet length. A user can fat-finger SEQUENCE(1e9,…)
  // and OOM-crash the tab; the spreadsheet view can't usefully display more
  // than ~100 k cells anyway, so anything past that is a typo.
  const count = Math.max(0, Math.min(Math.floor(Number(n) || 0), 100_000));
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i++) out[i] = start + i * step;
  return out;
}

export function callArrayFormula(name: string, args: any[]): any {
  switch (name) {
    case 'FILTER':     return arrayFilter(args[0], args[1]);
    case 'UNIQUE':     return arrayUnique(Array.isArray(args[0]) ? args[0] : [args[0]]);
    case 'SORT':       return arraySort(Array.isArray(args[0]) ? args[0] : [args[0]], args.length > 1 ? !!args[1] : false);
    case 'TRANSPOSE':  return arrayTranspose(args[0]);
    case 'SEQUENCE':   return arraySequence(Math.round(args[0] ?? 1), args[1] ?? 1, args[2] ?? 1);
    case 'ARRAYFORMULA': return args[0];
  }
  return null;
}

export const ARRAY_FORMULA_NAMES = ['FILTER', 'UNIQUE', 'SORT', 'TRANSPOSE', 'SEQUENCE', 'ARRAYFORMULA'];
