export type FormulaArg = any;

export function getNum(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$%]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function flatNums(arr: any[]): number[] {
  const out: number[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v !== '' && v != null && !isNaN(getNum(v))) out.push(getNum(v));
  };
  for (const v of arr) walk(v);
  return out;
}

// Excel *A-family value extraction: numbers count as-is, TRUE=1 / FALSE=0,
// text (incl. numeric-looking strings) counts as 0, blanks/null are ignored.
function numsA(arr: any[]): number[] {
  const out: number[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v === '' || v == null) return;
    else if (typeof v === 'number') out.push(v);
    else if (typeof v === 'boolean') out.push(v ? 1 : 0);
    else out.push(0);
  };
  for (const v of arr) walk(v);
  return out;
}

function flatAll(arr: any[]): any[] {
  const out: any[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else out.push(v);
  };
  for (const v of arr) walk(v);
  return out;
}

// Safe min/max over an array — Math.max(...arr) throws on arrays larger than
// the V8/JSC argument-list cap (~64k Chrome, ~10k Safari historically). A user
// doing =MAX(A:A) on a 100k-row column would crash the formula engine; this
// loop is the equivalent without the spread.
function maxOf(ns: number[]): number {
  let m = -Infinity;
  for (let i = 0; i < ns.length; i++) if (ns[i] > m) m = ns[i];
  return m;
}
function minOf(ns: number[]): number {
  let m = Infinity;
  for (let i = 0; i < ns.length; i++) if (ns[i] < m) m = ns[i];
  return m;
}

function compareVal(v: any, criterion: any): boolean {
  if (typeof criterion === 'string') {
    const m = /^(>=|<=|<>|=|>|<)\s*(.*)$/.exec(criterion);
    if (m) {
      const op = m[1], target = m[2];
      const vn = getNum(v), tn = getNum(target);
      const tIsNum = !isNaN(parseFloat(target));
      switch (op) {
        case '>=': return tIsNum ? vn >= tn : String(v) >= target;
        case '<=': return tIsNum ? vn <= tn : String(v) <= target;
        case '>':  return tIsNum ? vn > tn : String(v) > target;
        case '<':  return tIsNum ? vn < tn : String(v) < target;
        case '<>': return String(v) !== target && vn !== tn;
        case '=':  return String(v) === target || vn === tn;
      }
    }
    if (criterion.includes('*') || criterion.includes('?')) {
      const re = new RegExp('^' + criterion.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      return re.test(String(v));
    }
    return String(v) === criterion;
  }
  return v === criterion || getNum(v) === getNum(criterion);
}

const SERIAL_EPOCH = new Date(Date.UTC(1899, 11, 30)).getTime();

function dateFromSerial(n: number): Date {
  return new Date(SERIAL_EPOCH + n * 86400000);
}

function serialFromDate(d: Date): number {
  return (d.getTime() - SERIAL_EPOCH) / 86400000;
}

import { callArrayFormula, ARRAY_FORMULA_NAMES } from './array-formulas';

export function callFormula(name: string, args: any[]): any {
  if (ARRAY_FORMULA_NAMES.includes(name)) {
    const r = callArrayFormula(name, args);
    if (r !== null) return r;
  }
  switch (name) {
    // --- Math / aggregate ---
    case 'SUM':         return flatNums(args).reduce((s, n) => s + n, 0);
    case 'SUMSQ':       return flatNums(args).reduce((s, n) => s + n * n, 0);
    case 'AVERAGE': case 'AVG': { const ns = flatNums(args); return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0; }
    case 'COUNT':       return flatNums(args).length;
    case 'COUNTA':      return flatAll(args).filter(v => v !== '' && v != null).length;
    case 'COUNTBLANK':  return flatAll(args).filter(v => v === '' || v == null).length;
    case 'MAX':         { const ns = flatNums(args); return ns.length ? maxOf(ns) : 0; }
    case 'MIN':         { const ns = flatNums(args); return ns.length ? minOf(ns) : 0; }
    case 'PRODUCT':     return flatNums(args).reduce((s, n) => s * n, 1);
    case 'SUMPRODUCT': {
      const arrays: number[][] = args.map(a => Array.isArray(a) ? flatNums(a) : [getNum(a)]);
      const len = minOf(arrays.map(a => a.length));
      let total = 0;
      for (let i = 0; i < len; i++) { let p = 1; for (const a of arrays) p *= a[i]; total += p; }
      return total;
    }
    case 'ROUND':       return Number(getNum(args[0]).toFixed(Math.max(0, Math.min(12, Math.round(getNum(args[1] ?? 0))))));
    case 'ROUNDUP':     { const d = Math.round(getNum(args[1] ?? 0)); const m = Math.pow(10, d); return Math.ceil(getNum(args[0]) * m) / m; }
    case 'ROUNDDOWN': case 'TRUNC': { const d = Math.round(getNum(args[1] ?? 0)); const m = Math.pow(10, d); return Math.floor(getNum(args[0]) * m) / m; }
    case 'CEILING': case 'CEIL': return Math.ceil(getNum(args[0]) / Math.max(0.000001, getNum(args[1] ?? 1))) * Math.max(0.000001, getNum(args[1] ?? 1));
    case 'FLOOR':       return Math.floor(getNum(args[0]) / Math.max(0.000001, getNum(args[1] ?? 1))) * Math.max(0.000001, getNum(args[1] ?? 1));
    case 'ABS':         return Math.abs(getNum(args[0]));
    case 'SIGN':        { const n = getNum(args[0]); return n > 0 ? 1 : n < 0 ? -1 : 0; }
    case 'SQRT':        return Math.sqrt(getNum(args[0]));
    case 'POWER':       return Math.pow(getNum(args[0]), getNum(args[1]));
    case 'EXP':         return Math.exp(getNum(args[0]));
    case 'LN':          return Math.log(getNum(args[0]));
    case 'LOG':         { const n = getNum(args[0]); const base = args.length > 1 ? getNum(args[1]) : 10; return Math.log(n) / Math.log(base); }
    case 'LOG10':       return Math.log10(getNum(args[0]));
    case 'MOD':         return getNum(args[0]) - Math.floor(getNum(args[0]) / getNum(args[1])) * getNum(args[1]);
    case 'INT':         return Math.floor(getNum(args[0]));
    case 'PI':          return Math.PI;
    case 'EVEN':        { const n = getNum(args[0]); return n >= 0 ? Math.ceil(n / 2) * 2 : Math.floor(n / 2) * 2; }
    case 'ODD':         { const n = getNum(args[0]); const r = n >= 0 ? Math.ceil(n / 2) * 2 - 1 : Math.floor(n / 2) * 2 - 1; return r === 0 ? 1 : r; }
    case 'GCD':         { const ns = flatNums(args).map(n => Math.abs(Math.round(n))); return ns.reduce((a, b) => b ? gcd(a, b) : a, ns[0] || 0); }
    case 'LCM':         { const ns = flatNums(args).map(n => Math.abs(Math.round(n))); return ns.reduce((a, b) => a * b / gcd(a, b), 1); }
    case 'RAND':        return Math.random();
    case 'RANDBETWEEN': { const a = getNum(args[0]), b = getNum(args[1]); return Math.floor(Math.random() * (b - a + 1)) + a; }

    // --- Trig ---
    case 'SIN':         return Math.sin(getNum(args[0]));
    case 'COS':         return Math.cos(getNum(args[0]));
    case 'TAN':         return Math.tan(getNum(args[0]));
    case 'ASIN':        return Math.asin(getNum(args[0]));
    case 'ACOS':        return Math.acos(getNum(args[0]));
    case 'ATAN':        return Math.atan(getNum(args[0]));
    case 'ATAN2':       return Math.atan2(getNum(args[0]), getNum(args[1]));
    case 'SINH':        return Math.sinh(getNum(args[0]));
    case 'COSH':        return Math.cosh(getNum(args[0]));
    case 'TANH':        return Math.tanh(getNum(args[0]));
    case 'RADIANS':     return getNum(args[0]) * Math.PI / 180;
    case 'DEGREES':     return getNum(args[0]) * 180 / Math.PI;

    // --- Stat ---
    case 'MEDIAN':      { const ns = flatNums(args).sort((a, b) => a - b); if (!ns.length) return 0; const m = ns.length / 2; return ns.length % 2 === 0 ? (ns[m - 1] + ns[m]) / 2 : ns[Math.floor(m)]; }
    case 'MODE':        { const ns = flatNums(args); const counts = new Map<number, number>(); for (const n of ns) counts.set(n, (counts.get(n) ?? 0) + 1); let best = 0, bn = 0; for (const [v, c] of counts) if (c > bn) { bn = c; best = v; } return bn > 1 ? best : '#N/A'; }
    case 'STDEV': case 'STDEV.S': { const ns = flatNums(args); if (ns.length < 2) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return Math.sqrt(ns.reduce((s, n) => s + (n - m) ** 2, 0) / (ns.length - 1)); }
    case 'STDEVP': case 'STDEV.P': { const ns = flatNums(args); if (!ns.length) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return Math.sqrt(ns.reduce((s, n) => s + (n - m) ** 2, 0) / ns.length); }
    case 'VAR': case 'VAR.S':     { const ns = flatNums(args); if (ns.length < 2) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return ns.reduce((s, n) => s + (n - m) ** 2, 0) / (ns.length - 1); }
    case 'VARP': case 'VAR.P':    { const ns = flatNums(args); if (!ns.length) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return ns.reduce((s, n) => s + (n - m) ** 2, 0) / ns.length; }
    case 'COUNTUNIQUE':  { const seen = new Set<any>(); for (const v of flatAll(args)) if (v !== '' && v != null) seen.add(typeof v === 'number' ? v : String(v)); return seen.size; }
    case 'AVERAGEA':     { const ns = numsA(args); return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : '#DIV/0!'; }
    case 'MAXA':         { const ns = numsA(args); return ns.length ? maxOf(ns) : 0; }
    case 'MINA':         { const ns = numsA(args); return ns.length ? minOf(ns) : 0; }
    case 'VARA':         { const ns = numsA(args); if (ns.length < 2) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return ns.reduce((s, n) => s + (n - m) ** 2, 0) / (ns.length - 1); }
    case 'VARPA':        { const ns = numsA(args); if (!ns.length) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return ns.reduce((s, n) => s + (n - m) ** 2, 0) / ns.length; }
    case 'STDEVA':       { const ns = numsA(args); if (ns.length < 2) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return Math.sqrt(ns.reduce((s, n) => s + (n - m) ** 2, 0) / (ns.length - 1)); }
    case 'STDEVPA':      { const ns = numsA(args); if (!ns.length) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return Math.sqrt(ns.reduce((s, n) => s + (n - m) ** 2, 0) / ns.length); }
    case 'MODE.MULT':    { const ns = flatNums(args); const counts = new Map<number, number>(); for (const n of ns) counts.set(n, (counts.get(n) ?? 0) + 1); let bn = 0; for (const c of counts.values()) if (c > bn) bn = c; if (bn < 2) return '#N/A'; const modes: number[] = []; for (const [v, c] of counts) if (c === bn) modes.push(v); modes.sort((a, b) => a - b); return modes[0]; }
    case 'PERCENTILE': case 'PERCENTILE.INC': { const ns = flatNums(args[0]).sort((a, b) => a - b); const p = Math.max(0, Math.min(1, getNum(args[1]))); if (!ns.length) return 0; const idx = p * (ns.length - 1); const lo = Math.floor(idx), hi = Math.ceil(idx); return ns[lo] + (ns[hi] - ns[lo]) * (idx - lo); }
    case 'QUARTILE':    { const ns = flatNums(args[0]).sort((a, b) => a - b); const q = getNum(args[1]); if (!ns.length) return 0; const p = q / 4; const idx = p * (ns.length - 1); const lo = Math.floor(idx), hi = Math.ceil(idx); return ns[lo] + (ns[hi] - ns[lo]) * (idx - lo); }
    case 'RANK': case 'RANK.EQ':  { const target = getNum(args[0]); const ns = flatNums(args[1]).sort((a, b) => b - a); return ns.indexOf(target) + 1 || '#N/A'; }
    case 'CORREL':      { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); if (n < 2) return 0; const mx = xs.reduce((s, v) => s + v, 0) / n; const my = ys.reduce((s, v) => s + v, 0) / n; let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; } return num / Math.sqrt(dx * dy); }
    case 'SLOPE':       { const xs = flatNums(args[1]); const ys = flatNums(args[0]); const n = Math.min(xs.length, ys.length); const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return den ? num / den : 0; }
    case 'INTERCEPT':   { const xs = flatNums(args[1]); const ys = flatNums(args[0]); const n = Math.min(xs.length, ys.length); const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } const slope = den ? num / den : 0; return my - slope * mx; }
    case 'COUNTIF':     { let c = 0; const target = args[1]; const arr = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; for (const v of arr) if (compareVal(v, target)) c++; return c; }
    case 'COUNTIFS':    { let c = 0; const arrays: any[][] = []; const crits: any[] = []; for (let i = 0; i < args.length; i += 2) { arrays.push(Array.isArray(args[i]) ? flatAll(args[i]) : [args[i]]); crits.push(args[i + 1]); } const len = Math.min(...arrays.map(a => a.length)); for (let i = 0; i < len; i++) { let ok = true; for (let j = 0; j < crits.length; j++) if (!compareVal(arrays[j][i], crits[j])) { ok = false; break; } if (ok) c++; } return c; }
    case 'SUMIF':       { let s = 0; const target = args[1]; const arr = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; const src = Array.isArray(args[2]) ? flatAll(args[2]) : arr; for (let i = 0; i < arr.length; i++) if (compareVal(arr[i], target)) s += getNum(src[i] ?? 0); return s; }
    case 'SUMIFS':      { let s = 0; const src = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; const arrays: any[][] = []; const crits: any[] = []; for (let i = 1; i < args.length; i += 2) { arrays.push(Array.isArray(args[i]) ? flatAll(args[i]) : [args[i]]); crits.push(args[i + 1]); } const len = Math.min(src.length, ...arrays.map(a => a.length)); for (let i = 0; i < len; i++) { let ok = true; for (let j = 0; j < crits.length; j++) if (!compareVal(arrays[j][i], crits[j])) { ok = false; break; } if (ok) s += getNum(src[i] ?? 0); } return s; }
    case 'AVERAGEIF':   { let s = 0, c = 0; const target = args[1]; const arr = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; const src = Array.isArray(args[2]) ? flatAll(args[2]) : arr; for (let i = 0; i < arr.length; i++) if (compareVal(arr[i], target)) { s += getNum(src[i] ?? 0); c++; } return c ? s / c : 0; }
    case 'AVERAGEIFS':  { let s = 0, c = 0; const src = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; const arrays: any[][] = []; const crits: any[] = []; for (let i = 1; i < args.length; i += 2) { arrays.push(Array.isArray(args[i]) ? flatAll(args[i]) : [args[i]]); crits.push(args[i + 1]); } const len = Math.min(src.length, ...arrays.map(a => a.length)); for (let i = 0; i < len; i++) { let ok = true; for (let j = 0; j < crits.length; j++) if (!compareVal(arrays[j][i], crits[j])) { ok = false; break; } if (ok) { s += getNum(src[i] ?? 0); c++; } } return c ? s / c : 0; }
    case 'MAXIFS':      { let m = -Infinity; const src = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; const arrays: any[][] = []; const crits: any[] = []; for (let i = 1; i < args.length; i += 2) { arrays.push(Array.isArray(args[i]) ? flatAll(args[i]) : [args[i]]); crits.push(args[i + 1]); } const len = Math.min(src.length, ...arrays.map(a => a.length)); for (let i = 0; i < len; i++) { let ok = true; for (let j = 0; j < crits.length; j++) if (!compareVal(arrays[j][i], crits[j])) { ok = false; break; } if (ok) m = Math.max(m, getNum(src[i] ?? 0)); } return m === -Infinity ? 0 : m; }
    case 'MINIFS':      { let m = Infinity; const src = Array.isArray(args[0]) ? flatAll(args[0]) : [args[0]]; const arrays: any[][] = []; const crits: any[] = []; for (let i = 1; i < args.length; i += 2) { arrays.push(Array.isArray(args[i]) ? flatAll(args[i]) : [args[i]]); crits.push(args[i + 1]); } const len = Math.min(src.length, ...arrays.map(a => a.length)); for (let i = 0; i < len; i++) { let ok = true; for (let j = 0; j < crits.length; j++) if (!compareVal(arrays[j][i], crits[j])) { ok = false; break; } if (ok) m = Math.min(m, getNum(src[i] ?? 0)); } return m === Infinity ? 0 : m; }

    // --- Logical ---
    case 'IF':          return getNum(args[0]) !== 0 ? args[1] : args[2];
    case 'IFS':         { for (let i = 0; i < args.length - 1; i += 2) if (getNum(args[i]) !== 0) return args[i + 1]; return '#N/A'; }
    case 'IFERROR':     { const v = args[0]; const s = String(v); if (s.startsWith('#') && s.length < 8) return args[1]; return v; }
    case 'IFNA':        return String(args[0]) === '#N/A' ? args[1] : args[0];
    case 'SWITCH':      { const expr = args[0]; for (let i = 1; i < args.length - 1; i += 2) if (args[i] === expr || getNum(args[i]) === getNum(expr)) return args[i + 1]; return args.length % 2 === 0 ? args[args.length - 1] : '#N/A'; }
    case 'AND':         return args.every(a => getNum(a) !== 0) ? 1 : 0;
    case 'OR':          return args.some(a => getNum(a) !== 0) ? 1 : 0;
    case 'XOR':         return args.filter(a => getNum(a) !== 0).length % 2 === 1 ? 1 : 0;
    case 'NOT':         return getNum(args[0]) === 0 ? 1 : 0;
    case 'TRUE':        return 1;
    case 'FALSE':       return 0;

    // --- Text ---
    case 'CONCATENATE': case 'CONCAT': return args.map(a => Array.isArray(a) ? a.join('') : String(a ?? '')).join('');
    case 'TEXTJOIN':    { const sep = String(args[0] ?? ''); const ignoreEmpty = getNum(args[1]) !== 0; const items = flatAll(args.slice(2)).filter(v => !ignoreEmpty || (v !== '' && v != null)); return items.join(sep); }
    case 'LEN':         return String(args[0] ?? '').length;
    case 'UPPER':       return String(args[0] ?? '').toUpperCase();
    case 'LOWER':       return String(args[0] ?? '').toLowerCase();
    case 'PROPER':      return String(args[0] ?? '').replace(/\w\S*/g, s => s.charAt(0).toUpperCase() + s.substr(1).toLowerCase());
    case 'TRIM':        return String(args[0] ?? '').trim().replace(/\s+/g, ' ');
    case 'CLEAN':       return String(args[0] ?? '').replace(/[\x00-\x1F\x7F]/g, '');
    case 'LEFT':        return String(args[0] ?? '').slice(0, Math.max(0, getNum(args[1] ?? 1)));
    case 'RIGHT':       { const n = Math.max(0, getNum(args[1] ?? 1)); return String(args[0] ?? '').slice(-n); }
    case 'MID':         { const start = getNum(args[1] ?? 1) - 1; const len = getNum(args[2] ?? 0); return String(args[0] ?? '').slice(start, start + len); }
    case 'REPT':        return String(args[0] ?? '').repeat(Math.max(0, Math.round(getNum(args[1] ?? 0))));
    case 'SUBSTITUTE':  { const text = String(args[0] ?? ''); const find = String(args[1] ?? ''); const replace = String(args[2] ?? ''); const which = args.length > 3 ? Math.round(getNum(args[3])) : 0; if (which === 0) return text.split(find).join(replace); let idx = -1; let c = 0; while ((idx = text.indexOf(find, idx + 1)) !== -1) { c++; if (c === which) return text.slice(0, idx) + replace + text.slice(idx + find.length); } return text; }
    case 'REPLACE':     { const text = String(args[0] ?? ''); const start = getNum(args[1]) - 1; const len = getNum(args[2]); return text.slice(0, start) + String(args[3] ?? '') + text.slice(start + len); }
    case 'FIND':        { const text = String(args[1] ?? ''); const find = String(args[0] ?? ''); const start = args.length > 2 ? getNum(args[2]) - 1 : 0; const i = text.indexOf(find, start); return i < 0 ? '#VALUE!' : i + 1; }
    case 'SEARCH':      { const text = String(args[1] ?? '').toLowerCase(); const find = String(args[0] ?? '').toLowerCase(); const start = args.length > 2 ? getNum(args[2]) - 1 : 0; const i = text.indexOf(find, start); return i < 0 ? '#VALUE!' : i + 1; }
    case 'EXACT':       return String(args[0]) === String(args[1]) ? 1 : 0;
    case 'TEXT':        { const v = getNum(args[0]); const fmt = String(args[1] ?? ''); return formatExcelStyle(v, fmt); }
    case 'VALUE':       { const n = parseFloat(String(args[0] ?? '').replace(/[,$%\s]/g, '')); return isNaN(n) ? '#VALUE!' : n; }
    case 'CHAR':        return String.fromCharCode(Math.round(getNum(args[0])));
    case 'CODE':        return String(args[0] ?? '').charCodeAt(0) || 0;
    case 'UNICHAR':     return String.fromCodePoint(Math.round(getNum(args[0])));
    case 'UNICODE':     return String(args[0] ?? '').codePointAt(0) ?? 0;
    case 'REGEXEXTRACT': { try { const m = new RegExp(String(args[1] ?? '')).exec(String(args[0] ?? '')); return m ? (m[1] ?? m[0]) : '#N/A'; } catch { return '#VALUE!'; } }
    case 'REGEXMATCH':  { try { return new RegExp(String(args[1] ?? '')).test(String(args[0] ?? '')) ? 1 : 0; } catch { return '#VALUE!'; } }
    case 'REGEXREPLACE': { try { return String(args[0] ?? '').replace(new RegExp(String(args[1] ?? ''), 'g'), String(args[2] ?? '')); } catch { return '#VALUE!'; } }
    case 'SPLIT':       return String(args[0] ?? '').split(String(args[1] ?? ' '));
    case 'TEXTSPLIT':   { const text = String(args[0] ?? ''); const colDelims = (Array.isArray(args[1]) ? flatAll(args[1]) : [args[1]]).map(d => String(d ?? '')).filter(d => d !== ''); const rowDelims = args.length > 2 && args[2] != null ? (Array.isArray(args[2]) ? flatAll(args[2]) : [args[2]]).map(d => String(d ?? '')).filter(d => d !== '') : []; const ignoreEmpty = args.length > 3 ? getNum(args[3]) !== 0 : false; const splitBy = (s: string, delims: string[]): string[] => { if (!delims.length) return [s]; const re = new RegExp(delims.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')); let parts = [s]; for (let changed = true; changed;) { changed = false; const next: string[] = []; for (const p of parts) { const idx = p.search(re); if (idx >= 0) { const m = re.exec(p)!; next.push(p.slice(0, idx)); next.push(p.slice(idx + m[0].length)); changed = true; } else next.push(p); } parts = next; } return parts; }; const rows = rowDelims.length ? splitBy(text, rowDelims) : [text]; const grid = rows.map(r => { let cols = splitBy(r, colDelims); if (ignoreEmpty) cols = cols.filter(c => c !== ''); return cols; }); return rowDelims.length ? grid : grid[0]; }

    // --- Date / time ---
    case 'NOW':         return serialFromDate(new Date()) + (new Date().getHours() / 24) + (new Date().getMinutes() / 1440);
    case 'TODAY':       { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(serialFromDate(d)); }
    case 'DATE':        return serialFromDate(new Date(getNum(args[0]), getNum(args[1]) - 1, getNum(args[2])));
    case 'DATEVALUE':   { const d = new Date(String(args[0] ?? '')); return isNaN(d.getTime()) ? '#VALUE!' : Math.floor(serialFromDate(d)); }
    case 'TIME':        return (getNum(args[0]) + getNum(args[1]) / 60 + getNum(args[2]) / 3600) / 24;
    case 'YEAR':        return dateFromSerial(getNum(args[0])).getUTCFullYear();
    case 'MONTH':       return dateFromSerial(getNum(args[0])).getUTCMonth() + 1;
    case 'DAY':         return dateFromSerial(getNum(args[0])).getUTCDate();
    case 'HOUR':        { const f = getNum(args[0]) % 1; return Math.floor(f * 24); }
    case 'MINUTE':      { const f = (getNum(args[0]) * 24) % 1; return Math.floor(f * 60); }
    case 'SECOND':      { const f = (getNum(args[0]) * 24 * 60) % 1; return Math.floor(f * 60); }
    case 'WEEKDAY':     { const d = dateFromSerial(getNum(args[0])).getUTCDay(); const type = args.length > 1 ? getNum(args[1]) : 1; if (type === 1) return d + 1; if (type === 2) return d === 0 ? 7 : d; if (type === 3) return d === 0 ? 6 : d - 1; return d + 1; }
    case 'WEEKNUM':     { const d = dateFromSerial(getNum(args[0])); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + yearStart.getUTCDay() + 1) / 7); }
    case 'DAYS':        return Math.floor(getNum(args[0]) - getNum(args[1]));
    case 'EDATE':       { const d = dateFromSerial(getNum(args[0])); d.setUTCMonth(d.getUTCMonth() + Math.round(getNum(args[1]))); return Math.floor(serialFromDate(d)); }
    case 'EOMONTH':     { const d = dateFromSerial(getNum(args[0])); const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.round(getNum(args[1])) + 1, 0)); return Math.floor(serialFromDate(target)); }
    case 'NETWORKDAYS': { let s = Math.floor(getNum(args[0])); const e = Math.floor(getNum(args[1])); let count = 0; for (let i = s; i <= e; i++) { const d = dateFromSerial(i).getUTCDay(); if (d !== 0 && d !== 6) count++; } return count; }
    case 'WORKDAY':     { let n = Math.floor(getNum(args[0])); let days = Math.round(getNum(args[1])); const step = days >= 0 ? 1 : -1; while (days !== 0) { n += step; const d = dateFromSerial(n).getUTCDay(); if (d !== 0 && d !== 6) days -= step; } return n; }
    case 'WORKDAY.INTL': { let n = Math.floor(getNum(args[0])); let days = Math.round(getNum(args[1])); const wkArg = args.length > 2 ? args[2] : 1; const wkStr = typeof wkArg === 'string' && /^[01]{7}$/.test(wkArg) ? wkArg : (['','1111111','0000011','0000110','0001100','0011000','0110000','1100000','1000001','','','','0000001','0000010','0000100','0001000','0010000','0100000','1000000'][Math.floor(getNum(wkArg))] ?? '0000011'); const weekend = wkStr.split('').map(c => c === '1'); if (weekend.every(Boolean)) return '#NUM!'; const step = days >= 0 ? 1 : -1; while (days !== 0) { n += step; const idx = (dateFromSerial(n).getUTCDay() + 6) % 7; if (!weekend[idx]) days -= step; } return n; }
    case 'YEARFRAC':    return Math.abs(getNum(args[1]) - getNum(args[0])) / 365.25;
    case 'DATEDIF':     { let s = dateFromSerial(Math.floor(getNum(args[0]))); let e = dateFromSerial(Math.floor(getNum(args[1]))); const unit = String(args[2] ?? '').toUpperCase(); if (e.getTime() < s.getTime()) return '#NUM!'; const sy = s.getUTCFullYear(), sm = s.getUTCMonth(), sd = s.getUTCDate(); const ey = e.getUTCFullYear(), em = e.getUTCMonth(), ed = e.getUTCDate(); switch (unit) { case 'Y': { let y = ey - sy; if (em < sm || (em === sm && ed < sd)) y--; return y; } case 'M': { let m = (ey - sy) * 12 + (em - sm); if (ed < sd) m--; return m; } case 'D': return Math.floor(getNum(args[1])) - Math.floor(getNum(args[0])); case 'MD': { let d = ed - sd; if (d < 0) { const prev = new Date(Date.UTC(ey, em, 0)).getUTCDate(); d += prev; } return d; } case 'YM': { let m = (em - sm + 12) % 12; if (ed < sd) m = (m - 1 + 12) % 12; return m; } case 'YD': { const anchor = new Date(Date.UTC(sy + ((em < sm || (em === sm && ed < sd)) ? ey - sy - 1 : ey - sy), sm, sd)); return Math.floor((e.getTime() - anchor.getTime()) / 86400000); } default: return '#NUM!'; } }
    case 'ISOWEEKNUM':  { const d = dateFromSerial(Math.floor(getNum(args[0]))); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); const firstDay = (firstThu.getUTCDay() + 6) % 7; firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3); return 1 + Math.round((t.getTime() - firstThu.getTime()) / (86400000 * 7)); }
    case 'DAYS360':     { const a = dateFromSerial(Math.floor(getNum(args[0]))); const b = dateFromSerial(Math.floor(getNum(args[1]))); const euro = args.length > 2 && getNum(args[2]) !== 0; let d1 = a.getUTCDate(), d2 = b.getUTCDate(); const m1 = a.getUTCMonth() + 1, m2 = b.getUTCMonth() + 1, y1 = a.getUTCFullYear(), y2 = b.getUTCFullYear(); if (euro) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; } else { if (d1 === 31) d1 = 30; if (d2 === 31 && d1 === 30) d2 = 30; } return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1); }
    case 'TIMEVALUE':   { const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(args[0] ?? '')); if (!m) return '#VALUE!'; let h = parseInt(m[1], 10); const min = parseInt(m[2], 10); const sec = m[3] ? parseInt(m[3], 10) : 0; const ap = (m[4] ?? '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; if (h > 23 || min > 59 || sec > 59) return '#VALUE!'; return (h * 3600 + min * 60 + sec) / 86400; }
    case 'WEEKDAYNAME': { const d = dateFromSerial(Math.floor(getNum(args[0]))).getUTCDay(); const abbr = args.length > 1 && getNum(args[1]) !== 0; const full = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; return abbr ? full[d].slice(0, 3) : full[d]; }
    case 'MONTHNAME':   { const mo = ((Math.floor(getNum(args[0])) - 1) % 12 + 12) % 12; const abbr = args.length > 1 && getNum(args[1]) !== 0; const full = ['January','February','March','April','May','June','July','August','September','October','November','December']; return abbr ? full[mo].slice(0, 3) : full[mo]; }
    case 'QUARTER':     { const d = dateFromSerial(Math.floor(getNum(args[0]))); return Math.floor(d.getUTCMonth() / 3) + 1; }
    case 'ISLEAPYEAR':  { const y = Math.floor(getNum(args[0])); return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 1 : 0; }
    case 'DAYSINMONTH': { const y = Math.floor(getNum(args[0])), mo = Math.floor(getNum(args[1])); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
    case 'NETWORKDAYS.INTL': { let s = Math.floor(getNum(args[0])); const e = Math.floor(getNum(args[1])); const wkStr = args.length > 2 ? String(getNum(args[2])).padStart(7, '0') : '0000011'; const weekend = wkStr.length === 7 ? wkStr.split('').map(c => c === '1') : ['0000011','0000110','0001100','0011000','0110000','1100000','1000001'][Math.max(0, getNum(args[2]) - 1)]?.split('').map(c => c === '1') ?? '0000011'.split('').map(c => c === '1'); let count = 0; const lo = Math.min(s, e), hi = Math.max(s, e); for (let i = lo; i <= hi; i++) { const dow = dateFromSerial(i).getUTCDay(); const idx = (dow + 6) % 7; if (!weekend[idx]) count++; } return e >= s ? count : -count; }
    case 'ISODATE':     { const d = dateFromSerial(Math.floor(getNum(args[0]))); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }

    // --- Lookup ---
    case 'VLOOKUP':     { const lookup = args[0]; const table = args[1]; const colIdx = Math.round(getNum(args[2])) - 1; const exact = args.length > 3 ? getNum(args[3]) === 0 : false; if (!Array.isArray(table)) return '#N/A'; for (const row of table) { if (!Array.isArray(row)) continue; if (compareVal(row[0], lookup)) return row[colIdx] ?? '#N/A'; } if (!exact) { let best: any = '#N/A'; for (const row of table) { if (!Array.isArray(row)) continue; if (getNum(row[0]) <= getNum(lookup)) best = row[colIdx]; } return best; } return '#N/A'; }
    case 'HLOOKUP':     { const lookup = args[0]; const table = args[1]; const rowIdx = Math.round(getNum(args[2])) - 1; if (!Array.isArray(table) || !Array.isArray(table[0])) return '#N/A'; const headers = table[0]; for (let c = 0; c < headers.length; c++) if (compareVal(headers[c], lookup)) return table[rowIdx]?.[c] ?? '#N/A'; return '#N/A'; }
    case 'XLOOKUP':     { const lookup = args[0]; const lookupRange = args[1]; const returnRange = args[2]; const notFound = args.length > 3 ? args[3] : '#N/A'; if (!Array.isArray(lookupRange) || !Array.isArray(returnRange)) return notFound; for (let i = 0; i < lookupRange.length; i++) if (compareVal(lookupRange[i], lookup)) return returnRange[i] ?? notFound; return notFound; }
    case 'INDEX':       { const arr = args[0]; const r = Math.round(getNum(args[1])) - 1; const c = args.length > 2 ? Math.round(getNum(args[2])) - 1 : -1; if (Array.isArray(arr)) { const row = arr[r]; if (c < 0) return row ?? '#REF!'; return Array.isArray(row) ? (row[c] ?? '#REF!') : (r === 0 ? (arr[c] ?? '#REF!') : '#REF!'); } return arr; }
    case 'MATCH':       { const lookup = args[0]; const arr = Array.isArray(args[1]) ? flatAll(args[1]) : [args[1]]; const type = args.length > 2 ? getNum(args[2]) : 1; if (type === 0) { for (let i = 0; i < arr.length; i++) if (compareVal(arr[i], lookup)) return i + 1; return '#N/A'; } let best = -1; for (let i = 0; i < arr.length; i++) { if (type === 1 && getNum(arr[i]) <= getNum(lookup)) best = i; if (type === -1 && getNum(arr[i]) >= getNum(lookup)) best = i; } return best >= 0 ? best + 1 : '#N/A'; }
    case 'CHOOSE':      { const idx = Math.round(getNum(args[0])); return args[idx] ?? '#N/A'; }
    case 'ROW':         return 1;
    case 'COLUMN':      return 1;

    // --- Information ---
    case 'ISBLANK':     return args[0] == null || args[0] === '' ? 1 : 0;
    case 'ISNUMBER':    return typeof args[0] === 'number' || !isNaN(parseFloat(String(args[0]))) && args[0] !== '' ? 1 : 0;
    case 'ISTEXT':      return typeof args[0] === 'string' && isNaN(parseFloat(args[0])) ? 1 : 0;
    case 'ISLOGICAL':   return typeof args[0] === 'boolean' ? 1 : 0;
    case 'ISERROR':     { const s = String(args[0]); return s.startsWith('#') && s.length < 8 ? 1 : 0; }
    case 'ISNA':        return String(args[0]) === '#N/A' ? 1 : 0;
    case 'ISEVEN':      return Math.floor(getNum(args[0])) % 2 === 0 ? 1 : 0;
    case 'ISODD':       return Math.floor(getNum(args[0])) % 2 !== 0 ? 1 : 0;
    case 'N':           return getNum(args[0]);
    case 'TYPE':        { const v = args[0]; if (typeof v === 'number') return 1; if (typeof v === 'string') return 2; if (typeof v === 'boolean') return 4; if (Array.isArray(v)) return 64; return 16; }

    // --- Financial ---
    case 'PMT':         { const rate = getNum(args[0]); const nper = getNum(args[1]); const pv = getNum(args[2]); const fv = args.length > 3 ? getNum(args[3]) : 0; if (rate === 0) return -(pv + fv) / nper; return -(rate * (pv * Math.pow(1 + rate, nper) + fv)) / (Math.pow(1 + rate, nper) - 1); }
    case 'PV':          { const rate = getNum(args[0]); const nper = getNum(args[1]); const pmt = getNum(args[2]); const fv = args.length > 3 ? getNum(args[3]) : 0; if (rate === 0) return -fv - pmt * nper; return (-fv - pmt * (Math.pow(1 + rate, nper) - 1) / rate) / Math.pow(1 + rate, nper); }
    case 'FV':          { const rate = getNum(args[0]); const nper = getNum(args[1]); const pmt = getNum(args[2]); const pv = args.length > 3 ? getNum(args[3]) : 0; if (rate === 0) return -pv - pmt * nper; return -pv * Math.pow(1 + rate, nper) - pmt * (Math.pow(1 + rate, nper) - 1) / rate; }
    case 'NPER':        { const rate = getNum(args[0]); const pmt = getNum(args[1]); const pv = getNum(args[2]); const fv = args.length > 3 ? getNum(args[3]) : 0; if (rate === 0) return -(pv + fv) / pmt; return Math.log((pmt - fv * rate) / (pmt + pv * rate)) / Math.log(1 + rate); }
    case 'NPV':         { const rate = getNum(args[0]); const flows = flatNums(args.slice(1)); return flows.reduce((s, n, i) => s + n / Math.pow(1 + rate, i + 1), 0); }
    case 'IRR':         { const flows = flatNums(args[0]); let r = args.length > 1 ? getNum(args[1]) : 0.1; for (let iter = 0; iter < 100; iter++) { let npv = 0, deriv = 0; for (let i = 0; i < flows.length; i++) { npv += flows[i] / Math.pow(1 + r, i); deriv -= i * flows[i] / Math.pow(1 + r, i + 1); } if (Math.abs(npv) < 1e-7) return r; r -= npv / (deriv || 1e-10); } return r; }
    case 'RATE':        { const nper = getNum(args[0]); const pmt = getNum(args[1]); const pv = getNum(args[2]); const fv = args.length > 3 ? getNum(args[3]) : 0; let r = args.length > 5 ? getNum(args[5]) : 0.1; for (let iter = 0; iter < 100; iter++) { const f = pv * Math.pow(1 + r, nper) + pmt * (Math.pow(1 + r, nper) - 1) / r + fv; if (Math.abs(f) < 1e-7) return r; r -= 0.01 * (f > 0 ? 1 : -1); } return r; }
    // --- More financial ---
    case 'SLN':         { const cost = getNum(args[0]), salvage = getNum(args[1]), life = getNum(args[2]); if (life === 0) return '#DIV/0!'; return (cost - salvage) / life; }
    case 'SYD':         { const cost = getNum(args[0]), salvage = getNum(args[1]), life = getNum(args[2]), per = getNum(args[3]); if (life <= 0 || per < 1 || per > life) return '#NUM!'; return (cost - salvage) * (life - per + 1) * 2 / (life * (life + 1)); }
    case 'DDB':         { const cost = getNum(args[0]), salvage = getNum(args[1]), life = getNum(args[2]), period = getNum(args[3]); const factor = args.length > 4 ? getNum(args[4]) : 2; if (life <= 0 || period < 1 || period > life) return '#NUM!'; let bookVal = cost, dep = 0; for (let p = 1; p <= period; p++) { dep = Math.min(bookVal * factor / life, Math.max(bookVal - salvage, 0)); bookVal -= dep; } return dep; }
    case 'DB':          { const cost = getNum(args[0]), salvage = getNum(args[1]), life = getNum(args[2]), period = getNum(args[3]); const month = args.length > 4 ? getNum(args[4]) : 12; if (cost === 0 || life <= 0 || period < 1) return '#NUM!'; const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000; let bookVal = cost, dep = 0; for (let p = 1; p <= period; p++) { if (p === 1) dep = cost * rate * month / 12; else if (p === life + 1) dep = (bookVal) * rate * (12 - month) / 12; else dep = bookVal * rate; bookVal -= dep; } return dep; }
    case 'IPMT':        { const rate = getNum(args[0]), per = getNum(args[1]), nper = getNum(args[2]), pv = getNum(args[3]); const fv = args.length > 4 ? getNum(args[4]) : 0; const type = args.length > 5 ? getNum(args[5]) : 0; if (per < 1 || per > nper) return '#NUM!'; const pmt = rate === 0 ? -(pv + fv) / nper : -(rate * (pv * Math.pow(1 + rate, nper) + fv)) / (Math.pow(1 + rate, nper) - 1); let bal = pv; for (let p = 1; p < per; p++) { const pmtEff = type === 1 && p === 1 ? 0 : pmt; bal = bal * (1 + rate) + pmtEff; } if (type === 1 && per === 1) return 0; let ip = -bal * rate; if (type === 1) ip = ip / (1 + rate); return ip; }
    case 'PPMT':        { const rate = getNum(args[0]), per = getNum(args[1]), nper = getNum(args[2]), pv = getNum(args[3]); const fv = args.length > 4 ? getNum(args[4]) : 0; const type = args.length > 5 ? getNum(args[5]) : 0; if (per < 1 || per > nper) return '#NUM!'; const pmt = rate === 0 ? -(pv + fv) / nper : -(rate * (pv * Math.pow(1 + rate, nper) + fv)) / (Math.pow(1 + rate, nper) - 1); let bal = pv; for (let p = 1; p < per; p++) { const pmtEff = type === 1 && p === 1 ? 0 : pmt; bal = bal * (1 + rate) + pmtEff; } let ip = (type === 1 && per === 1) ? 0 : -bal * rate; if (type === 1 && per !== 1) ip = ip / (1 + rate); return pmt - ip; }
    case 'ISPMT':       { const rate = getNum(args[0]), per = getNum(args[1]), nper = getNum(args[2]), pv = getNum(args[3]); if (nper === 0) return '#DIV/0!'; return pv * rate * (per / nper - 1); }
    case 'EFFECT':      { const nominal = getNum(args[0]), npery = Math.floor(getNum(args[1])); if (nominal <= 0 || npery < 1) return '#NUM!'; return Math.pow(1 + nominal / npery, npery) - 1; }
    case 'NOMINAL':     { const effect = getNum(args[0]), npery = Math.floor(getNum(args[1])); if (effect <= 0 || npery < 1) return '#NUM!'; return (Math.pow(effect + 1, 1 / npery) - 1) * npery; }
    case 'PDURATION':   { const rate = getNum(args[0]), pv = getNum(args[1]), fv = getNum(args[2]); if (rate <= 0 || pv <= 0 || fv <= 0) return '#NUM!'; return (Math.log(fv) - Math.log(pv)) / Math.log(1 + rate); }
    case 'RRI':         { const nper = getNum(args[0]), pv = getNum(args[1]), fv = getNum(args[2]); if (nper <= 0 || pv === 0) return '#NUM!'; return Math.pow(fv / pv, 1 / nper) - 1; }
    case 'FVSCHEDULE':  { let principal = getNum(args[0]); const rates = flatNums(args.slice(1)); for (const r of rates) principal *= (1 + r); return principal; }
    case 'DOLLARDE':    { const dollar = getNum(args[0]), frac = Math.floor(getNum(args[1])); if (frac < 0) return '#NUM!'; if (frac === 0) return '#DIV/0!'; const sign = dollar < 0 ? -1 : 1; const ab = Math.abs(dollar); const intPart = Math.floor(ab); const fracPart = ab - intPart; return sign * (intPart + fracPart * Math.pow(10, Math.ceil(Math.log10(frac))) / frac); }
    case 'DOLLARFR':    { const dollar = getNum(args[0]), frac = Math.floor(getNum(args[1])); if (frac < 0) return '#NUM!'; if (frac === 0) return '#DIV/0!'; const sign = dollar < 0 ? -1 : 1; const ab = Math.abs(dollar); const intPart = Math.floor(ab); const fracPart = ab - intPart; return sign * (intPart + (fracPart * frac) / Math.pow(10, Math.ceil(Math.log10(frac)))); }
    // --- More math ---
    case 'FACT':        { const n = Math.floor(getNum(args[0])); if (n < 0) return '#NUM!'; let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
    case 'FACTDOUBLE':  { const n = Math.floor(getNum(args[0])); if (n < 0) return '#NUM!'; let f = 1; for (let i = n; i > 1; i -= 2) f *= i; return f; }
    case 'COMBIN':      { const n = Math.floor(getNum(args[0])), k = Math.floor(getNum(args[1])); if (k < 0 || k > n) return '#NUM!'; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); }
    case 'PERMUT':      { const n = Math.floor(getNum(args[0])), k = Math.floor(getNum(args[1])); if (k < 0 || k > n) return '#NUM!'; let r = 1; for (let i = 0; i < k; i++) r *= (n - i); return r; }
    case 'PERMUTATIONA': { const n = Math.floor(getNum(args[0])), k = Math.floor(getNum(args[1])); if (n < 0 || k < 0) return '#NUM!'; return Math.round(Math.pow(n, k)); }
    case 'GAMMA':       { const x = getNum(args[0]); if (x === 0 || (x < 0 && x === Math.floor(x))) return '#NUM!'; if (x > 0) return Math.exp(gammaln(x)); return Math.PI / (Math.sin(Math.PI * x) * Math.exp(gammaln(1 - x))); }
    case 'MROUND':      { const x = getNum(args[0]), m = getNum(args[1]); if (m === 0) return 0; return Math.round(x / m) * m; }
    case 'QUOTIENT':    return Math.trunc(getNum(args[0]) / getNum(args[1]));
    case 'SEC':         return 1 / Math.cos(getNum(args[0]));
    case 'CSC':         return 1 / Math.sin(getNum(args[0]));
    case 'COT':         return 1 / Math.tan(getNum(args[0]));
    case 'BASE':        { const n = Math.floor(getNum(args[0])), radix = Math.floor(getNum(args[1])); const minLen = args.length > 2 ? Math.floor(getNum(args[2])) : 0; return n.toString(radix).toUpperCase().padStart(minLen, '0'); }
    case 'DECIMAL':     { const s = String(args[0] ?? '').trim(); const radix = Math.floor(getNum(args[1])); const v = parseInt(s, radix); return isNaN(v) ? '#NUM!' : v; }
    case 'ROMAN':       { let n = Math.floor(getNum(args[0])); if (n < 1 || n > 3999) return '#VALUE!'; const map: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let out = ''; for (const [v, sym] of map) while (n >= v) { out += sym; n -= v; } return out; }
    case 'ARABIC':      { const s = String(args[0] ?? '').toUpperCase(); const val: Record<string, number> = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 }; let total = 0; for (let i = 0; i < s.length; i++) { const c = val[s[i]] ?? 0, nx = val[s[i+1]] ?? 0; total += c < nx ? -c : c; } return total; }
    // --- More stats ---
    case 'GEOMEAN':     { const ns = flatNums(args).filter(n => n > 0); return ns.length ? Math.pow(ns.reduce((p, n) => p * n, 1), 1 / ns.length) : '#NUM!'; }
    case 'HARMEAN':     { const ns = flatNums(args).filter(n => n !== 0); return ns.length ? ns.length / ns.reduce((s, n) => s + 1 / n, 0) : '#NUM!'; }
    case 'AVEDEV':      { const ns = flatNums(args); if (!ns.length) return '#NUM!'; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return ns.reduce((s, n) => s + Math.abs(n - m), 0) / ns.length; }
    case 'DEVSQ':       { const ns = flatNums(args); if (!ns.length) return 0; const m = ns.reduce((s, n) => s + n, 0) / ns.length; return ns.reduce((s, n) => s + (n - m) * (n - m), 0); }
    case 'TRIMMEAN':    { const ns = flatNums(args[0]).sort((a, b) => a - b); const pct = getNum(args[1]); const cut = Math.floor(ns.length * pct / 2); const kept = ns.slice(cut, ns.length - cut); return kept.length ? kept.reduce((s, n) => s + n, 0) / kept.length : '#NUM!'; }
    case 'SKEW':        { const ns = flatNums(args); const n = ns.length; if (n < 3) return '#DIV/0!'; const m = ns.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(ns.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)); if (sd === 0) return '#DIV/0!'; const sum = ns.reduce((s, v) => s + ((v - m) / sd) ** 3, 0); return (n / ((n - 1) * (n - 2))) * sum; }
    case 'SKEW.P':      { const ns = flatNums(args); const n = ns.length; if (n < 1) return '#DIV/0!'; const m = ns.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(ns.reduce((s, v) => s + (v - m) ** 2, 0) / n); if (sd === 0) return '#DIV/0!'; return ns.reduce((s, v) => s + ((v - m) / sd) ** 3, 0) / n; }
    case 'KURT':        { const ns = flatNums(args); const n = ns.length; if (n < 4) return '#DIV/0!'; const m = ns.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(ns.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)); if (sd === 0) return '#DIV/0!'; const sum = ns.reduce((s, v) => s + ((v - m) / sd) ** 4, 0); return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); }
    case 'COVARIANCE.P': case 'COVAR': { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); if (n < 1) return '#DIV/0!'; const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let c = 0; for (let i = 0; i < n; i++) c += (xs[i] - mx) * (ys[i] - my); return c / n; }
    case 'COVARIANCE.S': { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); if (n < 2) return '#DIV/0!'; const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let c = 0; for (let i = 0; i < n; i++) c += (xs[i] - mx) * (ys[i] - my); return c / (n - 1); }
    case 'PEARSON': case 'RSQ': { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); if (n < 2) return '#DIV/0!'; const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; } if (dx === 0 || dy === 0) return '#DIV/0!'; const r = num / Math.sqrt(dx * dy); return name === 'RSQ' ? r * r : r; }
    // --- Text ---
    case 'TEXTBEFORE':  { const s = String(args[0] ?? ''); const delim = String(args[1] ?? ''); const i = s.indexOf(delim); return i < 0 ? '#N/A' : s.slice(0, i); }
    case 'TEXTAFTER':   { const s = String(args[0] ?? ''); const delim = String(args[1] ?? ''); const i = s.indexOf(delim); return i < 0 ? '#N/A' : s.slice(i + delim.length); }
    case 'NUMBERVALUE': { const s = String(args[0] ?? '').replace(/[^\d.\-]/g, ''); const v = parseFloat(s); return isNaN(v) ? '#VALUE!' : v; }
    case 'FIXED':       { const n = getNum(args[0]); const dec = args.length > 1 ? Math.floor(getNum(args[1])) : 2; const noCommas = args.length > 2 && !!args[2]; const fixed = n.toFixed(Math.max(0, dec)); return noCommas ? fixed : fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    case 'DOLLAR':      { const n = getNum(args[0]); const dec = args.length > 1 ? Math.floor(getNum(args[1])) : 2; return '$' + n.toFixed(Math.max(0, dec)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    // --- Advanced financial (XIRR/XNPV use actual dates; MIRR uses two rates) ---
    case 'XNPV': {
      // XNPV(rate, values, dates) — present value of cashflows on actual dates.
      const rate = getNum(args[0]);
      const values = flatNums(args[1]);
      const dates = flatNums(args[2]);
      if (!values.length || values.length !== dates.length) return '#NUM!';
      const d0 = dates[0];
      let pv = 0;
      for (let i = 0; i < values.length; i++) pv += values[i] / Math.pow(1 + rate, (dates[i] - d0) / 365);
      return pv;
    }
    case 'XIRR': {
      // XIRR(values, dates, [guess]) — IRR for cashflows on actual dates.
      const values = flatNums(args[0]);
      const dates = flatNums(args[1]);
      if (!values.length || values.length !== dates.length) return '#NUM!';
      const d0 = dates[0];
      const npvAt = (r: number) => { let s = 0; for (let i = 0; i < values.length; i++) s += values[i] / Math.pow(1 + r, (dates[i] - d0) / 365); return s; };
      const dnpvAt = (r: number) => { let s = 0; for (let i = 0; i < values.length; i++) { const t = (dates[i] - d0) / 365; s -= t * values[i] / Math.pow(1 + r, t + 1); } return s; };
      let r = args.length > 2 ? getNum(args[2]) : 0.1;
      for (let iter = 0; iter < 100; iter++) { const f = npvAt(r); if (Math.abs(f) < 1e-7) return r; const d = dnpvAt(r); if (!d) break; const rn = r - f / d; if (!isFinite(rn) || rn <= -1) break; r = rn; }
      return Math.abs(npvAt(r)) < 1e-4 ? r : '#NUM!';
    }
    case 'MIRR': {
      // MIRR(values, finance_rate, reinvest_rate) — modified IRR.
      const flows = flatNums(args[0]);
      const fin = getNum(args[1]);
      const rein = getNum(args[2]);
      const n = flows.length;
      if (n < 2) return '#NUM!';
      let pvNeg = 0, fvPos = 0;
      for (let i = 0; i < n; i++) {
        if (flows[i] < 0) pvNeg += flows[i] / Math.pow(1 + fin, i);
        else fvPos += flows[i] * Math.pow(1 + rein, n - 1 - i);
      }
      if (pvNeg === 0 || fvPos === 0) return '#DIV/0!';
      return Math.pow(-fvPos / pvNeg, 1 / (n - 1)) - 1;
    }
    case 'AGGREGATE': {
      // AGGREGATE(fn, options, range) — a subset: fn 1..19 over the range,
      // option 6 ignores errors. We support the common stat/agg subset.
      const fn = Math.round(getNum(args[0]));
      const range = args.slice(2);
      const ns = flatNums(range);
      const sorted = [...ns].sort((a, b) => a - b);
      const sum = ns.reduce((s, n) => s + n, 0);
      const avg = ns.length ? sum / ns.length : 0;
      switch (fn) {
        case 1: return avg;                                   // AVERAGE
        case 2: return ns.length;                             // COUNT
        case 3: return flatAll(range).filter(v => v !== '' && v != null).length; // COUNTA
        case 4: return ns.length ? maxOf(ns) : 0;             // MAX
        case 5: return ns.length ? minOf(ns) : 0;             // MIN
        case 6: return ns.reduce((s, n) => s * n, 1);         // PRODUCT
        case 9: return sum;                                   // SUM
        case 12: { const m = sorted.length; return m ? (m % 2 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2) : 0; } // MEDIAN
        case 14: { const k = Math.round(getNum(args[3] ?? 1)); return sorted[sorted.length - k] ?? '#NUM!'; } // LARGE
        case 15: { const k = Math.round(getNum(args[3] ?? 1)); return sorted[k - 1] ?? '#NUM!'; }            // SMALL
        default: return '#VALUE!';
      }
    }

    // --- Engineering / advanced math ---
    case 'CONVERT':     {
      const val = getNum(args[0]); const from = String(args[1] ?? ''); const to = String(args[2] ?? '');
      // factor to a base unit per measurement family
      const length: Record<string, number> = { 'm': 1, 'km': 1000, 'cm': 0.01, 'mm': 0.001, 'in': 0.0254, 'ft': 0.3048, 'yd': 0.9144, 'mi': 1609.344, 'Nmi': 1852, 'ly': 9.4607304725808e15, 'ang': 1e-10, 'pica': 0.0254 / 6 };
      const mass: Record<string, number> = { 'g': 1, 'kg': 1000, 'mg': 0.001, 'lbm': 453.59237, 'ozm': 28.349523125, 'stone': 6350.29318, 'ton': 907184.74, 'u': 1.66053886e-24 };
      const time: Record<string, number> = { 'sec': 1, 's': 1, 'min': 60, 'mn': 60, 'hr': 3600, 'day': 86400, 'd': 86400, 'yr': 31557600 };
      const families = [length, mass, time];
      for (const fam of families) {
        if (from in fam && to in fam) return val * fam[from] / fam[to];
      }
      // temperature (affine, handled separately)
      const tempC = (v: number, u: string): number | null => { if (u === 'C' || u === 'cel') return v; if (u === 'F' || u === 'fah') return (v - 32) * 5 / 9; if (u === 'K' || u === 'kel') return v - 273.15; return null; };
      const fromC = (c: number, u: string): number | null => { if (u === 'C' || u === 'cel') return c; if (u === 'F' || u === 'fah') return c * 9 / 5 + 32; if (u === 'K' || u === 'kel') return c + 273.15; return null; };
      const c = tempC(val, from); if (c !== null) { const r = fromC(c, to); if (r !== null) return r; }
      return '#N/A';
    }
    case 'SQRTPI':      return Math.sqrt(getNum(args[0]) * Math.PI);
    case 'SERIESSUM':   { const x = getNum(args[0]), n = getNum(args[1]), m = getNum(args[2]); const coeffs = flatNums(args.slice(3)); let s = 0; for (let i = 0; i < coeffs.length; i++) s += coeffs[i] * Math.pow(x, n + i * m); return s; }
    case 'MULTINOMIAL': { const ns = flatNums(args).map(v => Math.floor(v)); if (ns.some(v => v < 0)) return '#NUM!'; const total = ns.reduce((a, b) => a + b, 0); let num = factln(total), den = 0; for (const v of ns) den += factln(v); return Math.round(Math.exp(num - den)); }
    case 'COMBINA':     { const n = Math.floor(getNum(args[0])), k = Math.floor(getNum(args[1])); if (n < 0 || k < 0) return '#NUM!'; const nn = n + k - 1; let r = 1; for (let i = 0; i < k; i++) r = r * (nn - i) / (i + 1); return Math.round(r); }
    case 'GAMMALN': case 'GAMMALN.PRECISE': { const x = getNum(args[0]); return x <= 0 ? '#NUM!' : gammaln(x); }

    // --- Statistical distributions ---
    case 'FISHER':      { const x = getNum(args[0]); if (x <= -1 || x >= 1) return '#NUM!'; return 0.5 * Math.log((1 + x) / (1 - x)); }
    case 'FISHERINV':   { const y = getNum(args[0]); return (Math.exp(2 * y) - 1) / (Math.exp(2 * y) + 1); }
    case 'GAUSS':       return normsdist(getNum(args[0])) - 0.5;
    case 'PHI':         { const x = getNum(args[0]); return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI); }
    case 'STANDARDIZE': { const sd = getNum(args[2]); if (sd <= 0) return '#NUM!'; return (getNum(args[0]) - getNum(args[1])) / sd; }
    case 'NORMSDIST': case 'NORM.S.DIST': return normsdist(getNum(args[0]));
    case 'NORMSINV': case 'NORM.S.INV':   { const p = getNum(args[0]); if (p <= 0 || p >= 1) return '#NUM!'; return normsinv(p); }
    case 'CONFIDENCE': case 'CONFIDENCE.NORM': { const alpha = getNum(args[0]), sd = getNum(args[1]), n = getNum(args[2]); if (alpha <= 0 || alpha >= 1 || sd <= 0 || n < 1) return '#NUM!'; return normsinv(1 - alpha / 2) * sd / Math.sqrt(n); }
    case 'EXPONDIST': case 'EXPON.DIST':  { const x = getNum(args[0]), lambda = getNum(args[1]), cum = getNum(args[2]) !== 0; if (x < 0 || lambda <= 0) return '#NUM!'; return cum ? 1 - Math.exp(-lambda * x) : lambda * Math.exp(-lambda * x); }
    case 'POISSON': case 'POISSON.DIST':  { const k = Math.floor(getNum(args[0])), mean = getNum(args[1]), cum = getNum(args[2]) !== 0; if (k < 0 || mean < 0) return '#NUM!'; if (cum) { let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(-mean + i * Math.log(mean) - factln(i)); return s; } return Math.exp(-mean + k * Math.log(mean) - factln(k)); }
    case 'BINOMDIST': case 'BINOM.DIST':  { const k = Math.floor(getNum(args[0])), n = Math.floor(getNum(args[1])), p = getNum(args[2]), cum = getNum(args[3]) !== 0; if (k < 0 || k > n || p < 0 || p > 1) return '#NUM!'; const pmf = (j: number) => Math.exp(factln(n) - factln(j) - factln(n - j) + j * Math.log(p || 1e-300) + (n - j) * Math.log(1 - p || 1e-300)); if (cum) { let s = 0; for (let j = 0; j <= k; j++) s += pmf(j); return s; } return pmf(k); }
    case 'NORMDIST': case 'NORM.DIST':    { const x = getNum(args[0]), mean = getNum(args[1]), sd = getNum(args[2]), cum = getNum(args[3]) !== 0; if (sd <= 0) return '#NUM!'; if (cum) return normsdist((x - mean) / sd); const z = (x - mean) / sd; return Math.exp(-(z * z) / 2) / (sd * Math.sqrt(2 * Math.PI)); }
    case 'NORMINV': case 'NORM.INV':      { const p = getNum(args[0]), mean = getNum(args[1]), sd = getNum(args[2]); if (p <= 0 || p >= 1 || sd <= 0) return '#NUM!'; return mean + sd * normsinv(p); }
    case 'WEIBULL': case 'WEIBULL.DIST':  { const x = getNum(args[0]), alpha = getNum(args[1]), beta = getNum(args[2]), cum = getNum(args[3]) !== 0; if (x < 0 || alpha <= 0 || beta <= 0) return '#NUM!'; if (cum) return 1 - Math.exp(-Math.pow(x / beta, alpha)); return (alpha / Math.pow(beta, alpha)) * Math.pow(x, alpha - 1) * Math.exp(-Math.pow(x / beta, alpha)); }
    case 'LOGNORMDIST': case 'LOGNORM.DIST': { const x = getNum(args[0]), mean = getNum(args[1]), sd = getNum(args[2]), cum = args.length > 3 ? getNum(args[3]) !== 0 : true; if (x <= 0 || sd <= 0) return '#NUM!'; const z = (Math.log(x) - mean) / sd; if (cum) return normsdist(z); return Math.exp(-(z * z) / 2) / (x * sd * Math.sqrt(2 * Math.PI)); }
    case 'LOGINV': case 'LOGNORM.INV':    { const p = getNum(args[0]), mean = getNum(args[1]), sd = getNum(args[2]); if (p <= 0 || p >= 1 || sd <= 0) return '#NUM!'; return Math.exp(mean + sd * normsinv(p)); }
    case 'HYPGEOMDIST': case 'HYPGEOM.DIST': { const k = Math.floor(getNum(args[0])), n = Math.floor(getNum(args[1])), K = Math.floor(getNum(args[2])), N = Math.floor(getNum(args[3])), cum = args.length > 4 && getNum(args[4]) !== 0; if (k < 0 || n < 0 || K < 0 || N < 0 || n > N || K > N || k > K || k > n || n - k > N - K) return '#NUM!'; const pmf = (j: number) => Math.exp(factln(K) - factln(j) - factln(K - j) + factln(N - K) - factln(n - j) - factln(N - K - n + j) - (factln(N) - factln(n) - factln(N - n))); if (cum) { let s = 0; const lo = Math.max(0, n - (N - K)); for (let j = lo; j <= k; j++) s += pmf(j); return s; } return pmf(k); }
    case 'NEGBINOMDIST': case 'NEGBINOM.DIST': { const f = Math.floor(getNum(args[0])), s = Math.floor(getNum(args[1])), p = getNum(args[2]), cum = args.length > 3 && getNum(args[3]) !== 0; if (f < 0 || s < 1 || p <= 0 || p > 1) return '#NUM!'; const pmf = (j: number) => Math.exp(factln(j + s - 1) - factln(j) - factln(s - 1) + s * Math.log(p) + j * Math.log(1 - p || 1e-300)); if (cum) { let acc = 0; for (let j = 0; j <= f; j++) acc += pmf(j); return acc; } return pmf(f); }
    case 'CRITBINOM': case 'BINOM.INV':   { const n = Math.floor(getNum(args[0])), p = getNum(args[1]), alpha = getNum(args[2]); if (n < 0 || p < 0 || p > 1 || alpha <= 0 || alpha > 1) return '#NUM!'; const pmf = (j: number) => Math.exp(factln(n) - factln(j) - factln(n - j) + j * Math.log(p || 1e-300) + (n - j) * Math.log(1 - p || 1e-300)); let acc = 0; for (let j = 0; j <= n; j++) { acc += pmf(j); if (acc >= alpha) return j; } return n; }

    // --- More distributions: chi-square, gamma, beta, Student-t, F ---
    // All built on the regularized incomplete gamma P(a,x) and incomplete beta
    // I_x(a,b) helpers below; these are the "precise" / .RT variants Excel exposes
    // and were genuinely absent (only the normal/binomial/poisson family existed).
    case 'ERF.PRECISE':   return erf(getNum(args[0]));
    case 'ERFC.PRECISE':  return 1 - erf(getNum(args[0]));
    case 'CHISQ.DIST':    { const x = getNum(args[0]), df = Math.floor(getNum(args[1])), cum = getNum(args[2]) !== 0; if (x < 0 || df < 1) return '#NUM!'; if (cum) return gammap(df / 2, x / 2); return Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.LN2 - gammaln(df / 2)); }
    case 'CHISQ.DIST.RT': case 'CHIDIST': { const x = getNum(args[0]), df = Math.floor(getNum(args[1])); if (x < 0 || df < 1) return '#NUM!'; return 1 - gammap(df / 2, x / 2); }
    case 'GAMMA.DIST': case 'GAMMADIST': { const x = getNum(args[0]), alpha = getNum(args[1]), beta = getNum(args[2]), cum = getNum(args[3]) !== 0; if (x < 0 || alpha <= 0 || beta <= 0) return '#NUM!'; if (cum) return gammap(alpha, x / beta); return Math.exp((alpha - 1) * Math.log(x) - x / beta - alpha * Math.log(beta) - gammaln(alpha)); }
    case 'GAMMA.INV': case 'GAMMAINV': { const p = getNum(args[0]), alpha = getNum(args[1]), beta = getNum(args[2]); if (p < 0 || p >= 1 || alpha <= 0 || beta <= 0) return '#NUM!'; return gammapinv(p, alpha) * beta; }
    case 'BETA.DIST': case 'BETADIST': { const x = getNum(args[0]), alpha = getNum(args[1]), beta = getNum(args[2]); const lo = args.length > 4 ? getNum(args[3]) : 0; const hi = args.length > 5 ? getNum(args[4]) : (args.length > 4 ? getNum(args[4]) : 1); if (alpha <= 0 || beta <= 0 || hi <= lo) return '#NUM!'; const z = (x - lo) / (hi - lo); if (z <= 0) return 0; if (z >= 1) return 1; return betai(z, alpha, beta); }
    case 'T.DIST':        { const x = getNum(args[0]), df = Math.floor(getNum(args[1])), cum = getNum(args[2]) !== 0; if (df < 1) return '#NUM!'; if (cum) { const ib = betai(df / (df + x * x), df / 2, 0.5); return x >= 0 ? 1 - ib / 2 : ib / 2; } return Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + x * x / df)); }
    case 'T.DIST.RT':     { const x = getNum(args[0]), df = Math.floor(getNum(args[1])); if (df < 1) return '#NUM!'; const ib = betai(df / (df + x * x), df / 2, 0.5); return x >= 0 ? ib / 2 : 1 - ib / 2; }
    case 'T.DIST.2T': case 'TDIST': { const x = getNum(args[0]), df = Math.floor(getNum(args[1])); if (x < 0 || df < 1) return '#NUM!'; return betai(df / (df + x * x), df / 2, 0.5); }
    case 'F.DIST.RT': case 'FDIST': { const x = getNum(args[0]), d1 = Math.floor(getNum(args[1])), d2 = Math.floor(getNum(args[2])); if (x < 0 || d1 < 1 || d2 < 1) return '#NUM!'; return betai(d2 / (d2 + d1 * x), d2 / 2, d1 / 2); }
    case 'F.DIST':        { const x = getNum(args[0]), d1 = Math.floor(getNum(args[1])), d2 = Math.floor(getNum(args[2])), cum = getNum(args[3]) !== 0; if (x < 0 || d1 < 1 || d2 < 1) return '#NUM!'; if (cum) return 1 - betai(d2 / (d2 + d1 * x), d2 / 2, d1 / 2); return Math.exp(0.5 * (d1 * Math.log(d1) + d2 * Math.log(d2)) + (d1 / 2 - 1) * Math.log(x) - ((d1 + d2) / 2) * Math.log(d2 + d1 * x) - gammaln(d1 / 2) - gammaln(d2 / 2) + gammaln((d1 + d2) / 2)); }
    case 'CHISQ.INV': { const p = getNum(args[0]), df = Math.floor(getNum(args[1])); if (p < 0 || p >= 1 || df < 1) return '#NUM!'; return gammapinv(p, df / 2) * 2; }
    // Legacy CHIINV is RIGHT-tailed (= CHISQ.INV.RT), NOT the left-tail CHISQ.INV.
    case 'CHISQ.INV.RT': case 'CHIINV': { const p = getNum(args[0]), df = Math.floor(getNum(args[1])); if (p <= 0 || p > 1 || df < 1) return '#NUM!'; return gammapinv(1 - p, df / 2) * 2; }
    case 'BETA.INV': case 'BETAINV': { const p = getNum(args[0]), alpha = getNum(args[1]), beta = getNum(args[2]); const lo = args.length > 4 ? getNum(args[3]) : 0; const hi = args.length > 5 ? getNum(args[4]) : (args.length > 4 ? getNum(args[4]) : 1); if (p <= 0 || p >= 1 || alpha <= 0 || beta <= 0 || hi <= lo) return '#NUM!'; return lo + (hi - lo) * betainv(p, alpha, beta); }
    case 'T.INV':         { const p = getNum(args[0]), df = Math.floor(getNum(args[1])); if (p <= 0 || p >= 1 || df < 1) return '#NUM!'; const x = Math.sqrt(df * (1 / betainv(p < 0.5 ? 2 * p : 2 * (1 - p), df / 2, 0.5) - 1)); return p < 0.5 ? -x : x; }
    case 'T.INV.2T': case 'TINV': { const p = getNum(args[0]), df = Math.floor(getNum(args[1])); if (p <= 0 || p > 1 || df < 1) return '#NUM!'; return Math.sqrt(df * (1 / betainv(p, df / 2, 0.5) - 1)); }
    case 'F.INV':         { const p = getNum(args[0]), d1 = Math.floor(getNum(args[1])), d2 = Math.floor(getNum(args[2])); if (p <= 0 || p >= 1 || d1 < 1 || d2 < 1) return '#NUM!'; const z = betainv(1 - p, d2 / 2, d1 / 2); return (d2 / d1) * (1 / z - 1); }
    case 'F.INV.RT': case 'FINV': { const p = getNum(args[0]), d1 = Math.floor(getNum(args[1])), d2 = Math.floor(getNum(args[2])); if (p <= 0 || p > 1 || d1 < 1 || d2 < 1) return '#NUM!'; const z = betainv(p, d2 / 2, d1 / 2); return (d2 / d1) * (1 / z - 1); }

    // --- Engineering: base conversions ---
    case 'BIN2DEC':     { const s = String(args[0] ?? '').trim(); if (!/^[01]{1,10}$/.test(s)) return '#NUM!'; let v = parseInt(s, 2); if (s.length === 10 && s[0] === '1') v -= 1024; return v; }
    case 'DEC2BIN':     { const n = Math.trunc(getNum(args[0])); if (n < -512 || n > 511) return '#NUM!'; const b = (n < 0 ? (n + 1024) : n).toString(2); const places = args.length > 1 ? Math.floor(getNum(args[1])) : 0; return n < 0 ? b : b.padStart(places, '0'); }
    case 'HEX2DEC':     { const s = String(args[0] ?? '').trim(); if (!/^[0-9A-Fa-f]{1,10}$/.test(s)) return '#NUM!'; let v = parseInt(s, 16); if (s.length === 10 && parseInt(s[0], 16) >= 8) v -= Math.pow(16, 10); return v; }
    case 'DEC2HEX':     { const n = Math.trunc(getNum(args[0])); if (n < -549755813888 || n > 549755813887) return '#NUM!'; const h = (n < 0 ? (n + Math.pow(16, 10)) : n).toString(16).toUpperCase(); const places = args.length > 1 ? Math.floor(getNum(args[1])) : 0; return n < 0 ? h : h.padStart(places, '0'); }
    case 'OCT2DEC':     { const s = String(args[0] ?? '').trim(); if (!/^[0-7]{1,10}$/.test(s)) return '#NUM!'; let v = parseInt(s, 8); if (s.length === 10 && parseInt(s[0], 8) >= 4) v -= Math.pow(8, 10); return v; }
    case 'DEC2OCT':     { const n = Math.trunc(getNum(args[0])); if (n < -536870912 || n > 536870911) return '#NUM!'; const o = (n < 0 ? (n + Math.pow(8, 10)) : n).toString(8); const places = args.length > 1 ? Math.floor(getNum(args[1])) : 0; return n < 0 ? o : o.padStart(places, '0'); }
    // --- Engineering: bitwise ---
    case 'BITAND':      { const a = Math.trunc(getNum(args[0])), b = Math.trunc(getNum(args[1])); if (a < 0 || b < 0) return '#NUM!'; return (a & b) >>> 0; }
    case 'BITOR':       { const a = Math.trunc(getNum(args[0])), b = Math.trunc(getNum(args[1])); if (a < 0 || b < 0) return '#NUM!'; return (a | b) >>> 0; }
    case 'BITXOR':      { const a = Math.trunc(getNum(args[0])), b = Math.trunc(getNum(args[1])); if (a < 0 || b < 0) return '#NUM!'; return (a ^ b) >>> 0; }
    case 'BITLSHIFT':   { const a = Math.trunc(getNum(args[0])), s = Math.trunc(getNum(args[1])); if (a < 0) return '#NUM!'; return s >= 0 ? a * Math.pow(2, s) : Math.floor(a / Math.pow(2, -s)); }
    case 'BITRSHIFT':   { const a = Math.trunc(getNum(args[0])), s = Math.trunc(getNum(args[1])); if (a < 0) return '#NUM!'; return s >= 0 ? Math.floor(a / Math.pow(2, s)) : a * Math.pow(2, -s); }
    // --- Engineering: step / delta / erf ---
    case 'GESTEP':      return getNum(args[0]) >= (args.length > 1 ? getNum(args[1]) : 0) ? 1 : 0;
    case 'DELTA':       return getNum(args[0]) === (args.length > 1 ? getNum(args[1]) : 0) ? 1 : 0;
    case 'ERF':         { const a = getNum(args[0]); return args.length > 1 ? erf(getNum(args[1])) - erf(a) : erf(a); }
    case 'ERFC':        return 1 - erf(getNum(args[0]));
    // --- Engineering: complex numbers (string in/out, e.g. "3+4i") ---
    case 'COMPLEX':     { const re = getNum(args[0]); const im = getNum(args[1]); const suf = args.length > 2 ? String(args[2]) : 'i'; if (suf !== 'i' && suf !== 'j') return '#VALUE!'; return imToText(re, im, suf); }
    case 'IMREAL':      { const c = parseComplex(args[0]); return c ? c.re : '#NUM!'; }
    case 'IMAGINARY':   { const c = parseComplex(args[0]); return c ? c.im : '#NUM!'; }
    case 'IMABS':       { const c = parseComplex(args[0]); return c ? Math.hypot(c.re, c.im) : '#NUM!'; }
    case 'IMARGUMENT':  { const c = parseComplex(args[0]); if (!c) return '#NUM!'; if (c.re === 0 && c.im === 0) return '#DIV/0!'; return Math.atan2(c.im, c.re); }
    case 'IMCONJUGATE': { const c = parseComplex(args[0]); return c ? imToText(c.re, -c.im, c.suf) : '#NUM!'; }
    case 'IMSUM':       { let re = 0, im = 0, suf = 'i'; for (const a of flatAll(args)) { const c = parseComplex(a); if (!c) return '#NUM!'; re += c.re; im += c.im; if (c.suf === 'j') suf = 'j'; } return imToText(re, im, suf); }
    case 'IMSUB':       { const a = parseComplex(args[0]); const b = parseComplex(args[1]); if (!a || !b) return '#NUM!'; const suf = a.suf === 'j' || b.suf === 'j' ? 'j' : 'i'; return imToText(a.re - b.re, a.im - b.im, suf); }
    case 'IMPRODUCT':   { let re = 1, im = 0, suf = 'i'; for (const a of flatAll(args)) { const c = parseComplex(a); if (!c) return '#NUM!'; const nr = re * c.re - im * c.im; const ni = re * c.im + im * c.re; re = nr; im = ni; if (c.suf === 'j') suf = 'j'; } return imToText(re, im, suf); }
    case 'IMDIV':       { const a = parseComplex(args[0]); const b = parseComplex(args[1]); if (!a || !b) return '#NUM!'; const den = b.re * b.re + b.im * b.im; if (den === 0) return '#NUM!'; const suf = a.suf === 'j' || b.suf === 'j' ? 'j' : 'i'; return imToText((a.re * b.re + a.im * b.im) / den, (a.im * b.re - a.re * b.im) / den, suf); }
    // --- More trig: inverse hyperbolic + reciprocal hyperbolic ---
    case 'ASINH':       return Math.asinh(getNum(args[0]));
    case 'ACOSH':       return Math.acosh(getNum(args[0]));
    case 'ATANH':       return Math.atanh(getNum(args[0]));
    case 'CSCH':        return 1 / Math.sinh(getNum(args[0]));
    case 'SECH':        return 1 / Math.cosh(getNum(args[0]));
    case 'COTH':        return 1 / Math.tanh(getNum(args[0]));
    // --- More trig: inverse reciprocal (Excel principal-value conventions) ---
    case 'ACOT':        return Math.PI / 2 - Math.atan(getNum(args[0]));
    case 'ACOTH':       { const x = getNum(args[0]); if (x > -1 && x < 1) return '#NUM!'; return 0.5 * Math.log((x + 1) / (x - 1)); }
    case 'ACSC':        { const x = getNum(args[0]); if (x > -1 && x < 1) return '#NUM!'; return Math.asin(1 / x); }
    case 'ASEC':        { const x = getNum(args[0]); if (x > -1 && x < 1) return '#NUM!'; return Math.acos(1 / x); }
    // --- Text ---
    case 'VALUETOTEXT': return Array.isArray(args[0]) ? String(flatAll(args[0])[0] ?? '') : String(args[0] ?? '');
    case 'ENCODEURL':   return encodeURIComponent(String(args[0] ?? ''));
    case 'DECODEURL':   { try { return decodeURIComponent(String(args[0] ?? '')); } catch { return '#VALUE!'; } }
    // --- Byte-wise text aliases (single-byte locale: byte length == char length) ---
    case 'LENB':        return String(args[0] ?? '').length;
    case 'LEFTB':       return String(args[0] ?? '').slice(0, Math.max(0, getNum(args[1] ?? 1)));
    case 'RIGHTB':      { const n = Math.max(0, getNum(args[1] ?? 1)); return String(args[0] ?? '').slice(-n); }
    case 'MIDB':        { const start = getNum(args[1] ?? 1) - 1; const len = getNum(args[2] ?? 0); return String(args[0] ?? '').slice(start, start + len); }
    case 'FINDB':       { const text = String(args[1] ?? ''); const find = String(args[0] ?? ''); const start = args.length > 2 ? getNum(args[2]) - 1 : 0; const i = text.indexOf(find, start); return i < 0 ? '#VALUE!' : i + 1; }
    case 'SEARCHB':     { const text = String(args[1] ?? '').toLowerCase(); const find = String(args[0] ?? '').toLowerCase(); const start = args.length > 2 ? getNum(args[2]) - 1 : 0; const i = text.indexOf(find, start); return i < 0 ? '#VALUE!' : i + 1; }
    case 'REPLACEB':    { const text = String(args[0] ?? ''); const start = getNum(args[1]) - 1; const len = getNum(args[2]); return text.slice(0, start) + String(args[3] ?? '') + text.slice(start + len); }
    // --- More info / error helpers ---
    case 'ISNONTEXT':   return typeof args[0] === 'string' && isNaN(parseFloat(args[0])) ? 0 : 1;
    case 'ISERR':       { const s = String(args[0]); return s.startsWith('#') && s.length < 8 && s !== '#N/A' ? 1 : 0; }
    case 'NA':          return '#N/A';
    case 'ERROR.TYPE':  { const s = String(args[0]); const map: Record<string, number> = { '#NULL!':1,'#DIV/0!':2,'#VALUE!':3,'#REF!':4,'#NAME?':5,'#NUM!':6,'#N/A':7 }; return map[s] ?? '#N/A'; }
    case 'T':           return typeof args[0] === 'string' ? args[0] : '';

    // --- More math: directional / significance rounding (CEILING.MATH family) ---
    case 'CEILING.MATH': case 'CEILING.PRECISE': case 'ISO.CEILING': {
      // CEILING.MATH(x, [significance], [mode]) — round x up to a multiple of
      // significance. mode != 0 rounds away from zero for negatives; default
      // (and CEILING.PRECISE / ISO.CEILING) always rounds toward +infinity.
      const x = getNum(args[0]); const sig = args.length > 1 ? Math.abs(getNum(args[1])) : 1;
      if (sig === 0) return 0;
      const mode = name === 'CEILING.MATH' && args.length > 2 ? getNum(args[2]) : 0;
      if (x < 0 && mode !== 0) return -Math.ceil(Math.abs(x) / sig) * sig;
      return Math.ceil(x / sig) * sig;
    }
    case 'FLOOR.MATH': case 'FLOOR.PRECISE': {
      // FLOOR.MATH(x, [significance], [mode]) — round x down to a multiple of
      // significance. mode != 0 rounds toward zero for negatives; default (and
      // FLOOR.PRECISE) always rounds toward -infinity.
      const x = getNum(args[0]); const sig = args.length > 1 ? Math.abs(getNum(args[1])) : 1;
      if (sig === 0) return 0;
      const mode = name === 'FLOOR.MATH' && args.length > 2 ? getNum(args[2]) : 0;
      if (x < 0 && mode !== 0) return -Math.floor(Math.abs(x) / sig) * sig;
      return Math.floor(x / sig) * sig;
    }

    // --- More stats: paired range sums + ranking variants ---
    case 'SUMX2MY2':    { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); let s = 0; for (let i = 0; i < n; i++) s += xs[i] * xs[i] - ys[i] * ys[i]; return s; }
    case 'SUMX2PY2':    { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); let s = 0; for (let i = 0; i < n; i++) s += xs[i] * xs[i] + ys[i] * ys[i]; return s; }
    case 'SUMXMY2':     { const xs = flatNums(args[0]); const ys = flatNums(args[1]); const n = Math.min(xs.length, ys.length); let s = 0; for (let i = 0; i < n; i++) s += (xs[i] - ys[i]) * (xs[i] - ys[i]); return s; }
    case 'RANK.AVG':    { const target = getNum(args[0]); const ord = args.length > 2 && getNum(args[2]) !== 0; const ns = flatNums(args[1]).slice().sort((a, b) => ord ? a - b : b - a); let first = -1, count = 0; for (let i = 0; i < ns.length; i++) if (ns[i] === target) { if (first < 0) first = i; count++; } return first < 0 ? '#N/A' : first + 1 + (count - 1) / 2; }
    case 'LARGE':       { const ns = flatNums(args[0]).slice().sort((a, b) => b - a); const k = Math.round(getNum(args[1])); return k >= 1 && k <= ns.length ? ns[k - 1] : '#NUM!'; }
    case 'SMALL':       { const ns = flatNums(args[0]).slice().sort((a, b) => a - b); const k = Math.round(getNum(args[1])); return k >= 1 && k <= ns.length ? ns[k - 1] : '#NUM!'; }

    // --- More stats: percentile/quartile variants, percent-rank, regression ---
    case 'MODE.SNGL':   { const ns = flatNums(args); const counts = new Map<number, number>(); for (const n of ns) counts.set(n, (counts.get(n) ?? 0) + 1); let best = 0, bn = 0; for (const [v, c] of counts) if (c > bn) { bn = c; best = v; } return bn > 1 ? best : '#N/A'; }
    case 'PERCENTILE.EXC': { const ns = flatNums(args[0]).sort((a, b) => a - b); const p = getNum(args[1]); const N = ns.length; if (!N) return '#NUM!'; if (p <= 0 || p >= 1 || p < 1 / (N + 1) || p > N / (N + 1)) return '#NUM!'; const idx = p * (N + 1) - 1; const lo = Math.floor(idx), hi = Math.ceil(idx); return ns[lo] + (ns[hi] - ns[lo]) * (idx - lo); }
    case 'QUARTILE.INC': { const ns = flatNums(args[0]).sort((a, b) => a - b); const q = getNum(args[1]); if (!ns.length) return 0; const p = q / 4; const idx = p * (ns.length - 1); const lo = Math.floor(idx), hi = Math.ceil(idx); return ns[lo] + (ns[hi] - ns[lo]) * (idx - lo); }
    case 'QUARTILE.EXC': { const ns = flatNums(args[0]).sort((a, b) => a - b); const q = getNum(args[1]); const N = ns.length; if (!N) return '#NUM!'; const p = q / 4; if (p <= 0 || p >= 1) return '#NUM!'; const idx = p * (N + 1) - 1; const lo = Math.floor(idx), hi = Math.ceil(idx); return ns[lo] + (ns[hi] - ns[lo]) * (idx - lo); }
    case 'PERCENTRANK': case 'PERCENTRANK.INC': { const ns = flatNums(args[0]).slice().sort((a, b) => a - b); const x = getNum(args[1]); const sig = args.length > 2 ? Math.max(1, Math.floor(getNum(args[2]))) : 3; const N = ns.length; if (!N) return '#NUM!'; if (x < ns[0] || x > ns[N - 1]) return '#N/A'; let i = 0; while (i < N && ns[i] <= x) i++; const below = i - 1; let rank: number; if (below >= 0 && ns[below] === x) rank = below / (N - 1); else { const lo = below, hi = below + 1; const frac = (x - ns[lo]) / (ns[hi] - ns[lo]); rank = (lo + frac) / (N - 1); } const m = Math.pow(10, sig); return Math.floor(rank * m) / m; }
    case 'PERCENTRANK.EXC': { const ns = flatNums(args[0]).slice().sort((a, b) => a - b); const x = getNum(args[1]); const sig = args.length > 2 ? Math.max(1, Math.floor(getNum(args[2]))) : 3; const N = ns.length; if (!N) return '#NUM!'; if (x < ns[0] || x > ns[N - 1]) return '#N/A'; let lo = 0; while (lo + 1 < N && ns[lo + 1] <= x) lo++; let rank: number; if (ns[lo] === x) rank = (lo + 1) / (N + 1); else { const frac = (x - ns[lo]) / (ns[lo + 1] - ns[lo]); rank = (lo + 1 + frac) / (N + 1); } const m = Math.pow(10, sig); return Math.floor(rank * m) / m; }
    case 'FORECAST': case 'FORECAST.LINEAR': { const x = getNum(args[0]); const ys = flatNums(args[1]); const xs = flatNums(args[2]); const n = Math.min(xs.length, ys.length); if (n < 1) return '#N/A'; const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } if (den === 0) return '#DIV/0!'; const slope = num / den; return my + slope * (x - mx); }
    case 'STEYX':       { const ys = flatNums(args[0]); const xs = flatNums(args[1]); const n = Math.min(xs.length, ys.length); if (n < 3) return '#DIV/0!'; const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n; const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } if (sxx === 0) return '#DIV/0!'; return Math.sqrt((syy - (sxy * sxy) / sxx) / (n - 2)); }

    // --- Hypothesis tests (return the p-value / probability mass) ---
    case 'ZTEST': case 'Z.TEST': { const ns = flatNums(args[0]); const x = getNum(args[1]); const n = ns.length; if (n < 2) return '#N/A'; const m = ns.reduce((s, v) => s + v, 0) / n; const sigma = args.length > 2 ? getNum(args[2]) : Math.sqrt(ns.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)); if (sigma === 0) return '#DIV/0!'; const z = (m - x) / (sigma / Math.sqrt(n)); return 1 - normsdist(z); }
    case 'TTEST': case 'T.TEST': { const a = flatNums(args[0]); const b = flatNums(args[1]); const tails = Math.round(getNum(args[2])); const type = Math.round(getNum(args[3])); if (a.length < 2 || b.length < 2) return '#DIV/0!'; const ma = a.reduce((s, v) => s + v, 0) / a.length; const mb = b.reduce((s, v) => s + v, 0) / b.length; let t = 0, df = 0; if (type === 1) { const n = Math.min(a.length, b.length); if (n < 2) return '#DIV/0!'; let sd = 0, md = 0; const diffs: number[] = []; for (let i = 0; i < n; i++) diffs.push(a[i] - b[i]); md = diffs.reduce((s, v) => s + v, 0) / n; sd = diffs.reduce((s, v) => s + (v - md) ** 2, 0) / (n - 1); if (sd === 0) return '#DIV/0!'; t = md / Math.sqrt(sd / n); df = n - 1; } else { const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1); const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1); if (type === 2) { const dfp = a.length + b.length - 2; const sp = ((a.length - 1) * va + (b.length - 1) * vb) / dfp; if (sp === 0) return '#DIV/0!'; t = (ma - mb) / Math.sqrt(sp * (1 / a.length + 1 / b.length)); df = dfp; } else { const se = va / a.length + vb / b.length; if (se === 0) return '#DIV/0!'; t = (ma - mb) / Math.sqrt(se); df = (se * se) / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1)); } } const p1 = 0.5 * betai(df / (df + t * t), df / 2, 0.5); return tails === 1 ? p1 : 2 * p1; }
    case 'FTEST': case 'F.TEST': { const a = flatNums(args[0]); const b = flatNums(args[1]); if (a.length < 2 || b.length < 2) return '#DIV/0!'; const ma = a.reduce((s, v) => s + v, 0) / a.length; const mb = b.reduce((s, v) => s + v, 0) / b.length; const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1); const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1); if (va === 0 || vb === 0) return '#DIV/0!'; let f = va / vb, d1 = a.length - 1, d2 = b.length - 1; if (f < 1) { f = vb / va; d1 = b.length - 1; d2 = a.length - 1; } const tail = betai(d2 / (d2 + d1 * f), d2 / 2, d1 / 2); return Math.min(1, 2 * tail); }
    case 'CHITEST': case 'CHISQ.TEST': { const obs = flatNums(args[0]); const exp = flatNums(args[1]); const n = Math.min(obs.length, exp.length); if (n < 2) return '#N/A'; let chi = 0; for (let i = 0; i < n; i++) { if (exp[i] === 0) return '#DIV/0!'; chi += (obs[i] - exp[i]) ** 2 / exp[i]; } const r0 = Array.isArray(args[0]) ? args[0].length : 0; const rows = Array.isArray(args[0]) && Array.isArray(args[0][0]) ? r0 : 1; const cols = rows > 1 ? n / rows : n; const df = rows > 1 ? (rows - 1) * (cols - 1) : n - 1; if (df < 1) return '#N/A'; return 1 - gammap(df / 2, chi / 2); }
    case 'PROB':        { const xs = flatNums(args[0]); const ps = flatNums(args[1]); const lo = getNum(args[2]); const hi = args.length > 3 ? getNum(args[3]) : lo; const n = Math.min(xs.length, ps.length); let s = 0; for (let i = 0; i < n; i++) if (xs[i] >= Math.min(lo, hi) && xs[i] <= Math.max(lo, hi)) s += ps[i]; return s; }

    // --- More financial: cumulative loan amounts + discount-security yields ---
    case 'CUMIPMT': case 'CUMPRINC': { const rate = getNum(args[0]); const nper = getNum(args[1]); const pv = getNum(args[2]); const start = Math.round(getNum(args[3])); const end = Math.round(getNum(args[4])); const typ = args.length > 5 ? Math.round(getNum(args[5])) : 0; if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper) return '#NUM!'; const pmt = -pv * rate / (1 - Math.pow(1 + rate, -nper)) / (typ === 1 ? 1 + rate : 1); let bal = pv, ci = 0, cp = 0; for (let per = 1; per <= end; per++) { let interest: number, principal: number; if (typ === 1 && per === 1) { interest = 0; principal = pmt; } else { interest = -bal * rate; principal = pmt - interest; } if (per >= start) { ci += interest; cp += principal; } bal += principal; } return name === 'CUMIPMT' ? ci : cp; }
    case 'INTRATE':     { const settle = getNum(args[0]); const mat = getNum(args[1]); const inv = getNum(args[2]); const redeem = getNum(args[3]); const basis = args.length > 4 ? Math.round(getNum(args[4])) : 0; if (inv <= 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : basis === 2 ? 360 : 360; return (redeem - inv) / inv * (yearDays / (mat - settle)); }
    case 'DISC':        { const settle = getNum(args[0]); const mat = getNum(args[1]); const price = getNum(args[2]); const redeem = getNum(args[3]); const basis = args.length > 4 ? Math.round(getNum(args[4])) : 0; if (price <= 0 || redeem <= 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; return (redeem - price) / redeem * (yearDays / (mat - settle)); }
    case 'RECEIVED':    { const settle = getNum(args[0]); const mat = getNum(args[1]); const inv = getNum(args[2]); const disc = getNum(args[3]); const basis = args.length > 4 ? Math.round(getNum(args[4])) : 0; if (inv <= 0 || disc <= 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; const d = 1 - disc * (mat - settle) / yearDays; if (d <= 0) return '#NUM!'; return inv / d; }
    case 'PRICEDISC':   { const settle = getNum(args[0]); const mat = getNum(args[1]); const disc = getNum(args[2]); const redeem = getNum(args[3]); const basis = args.length > 4 ? Math.round(getNum(args[4])) : 0; if (disc <= 0 || redeem <= 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; return redeem - disc * redeem * (mat - settle) / yearDays; }
    case 'YIELDDISC':   { const settle = getNum(args[0]); const mat = getNum(args[1]); const price = getNum(args[2]); const redeem = getNum(args[3]); const basis = args.length > 4 ? Math.round(getNum(args[4])) : 0; if (price <= 0 || redeem <= 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; return (redeem - price) / price * (yearDays / (mat - settle)); }
    case 'PRICEMAT':    { const settle = getNum(args[0]); const mat = getNum(args[1]); const issue = getNum(args[2]); const rate = getNum(args[3]); const yld = getNum(args[4]); const basis = args.length > 5 ? Math.round(getNum(args[5])) : 0; if (rate < 0 || yld < 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; const dim = (mat - issue) / yearDays; const dsm = (mat - settle) / yearDays; const a = (settle - issue) / yearDays; return ((100 + dim * rate * 100) / (1 + dsm * yld)) - (a * rate * 100); }
    case 'YIELDMAT':    { const settle = getNum(args[0]); const mat = getNum(args[1]); const issue = getNum(args[2]); const rate = getNum(args[3]); const price = getNum(args[4]); const basis = args.length > 5 ? Math.round(getNum(args[5])) : 0; if (rate < 0 || price <= 0 || mat <= settle) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; const dim = (mat - issue) / yearDays; const dsm = (mat - settle) / yearDays; const a = (settle - issue) / yearDays; const num = (1 + dim * rate) / (price / 100 + a * rate) - 1; return num / dsm; }
    case 'ACCRINTM':    { const issue = getNum(args[0]); const settle = getNum(args[1]); const rate = getNum(args[2]); const par = getNum(args[3]); const basis = args.length > 4 ? Math.round(getNum(args[4])) : 0; if (rate <= 0 || par <= 0 || settle <= issue) return '#NUM!'; const yearDays = basis === 3 ? 365 : 360; return par * rate * (settle - issue) / yearDays; }
    case 'TBILLPRICE':  { const settle = getNum(args[0]); const mat = getNum(args[1]); const disc = getNum(args[2]); if (disc <= 0 || mat <= settle) return '#NUM!'; const dsm = mat - settle; if (dsm > 365) return '#NUM!'; return 100 * (1 - disc * dsm / 360); }
    case 'TBILLYIELD':  { const settle = getNum(args[0]); const mat = getNum(args[1]); const price = getNum(args[2]); if (price <= 0 || mat <= settle) return '#NUM!'; const dsm = mat - settle; if (dsm > 365) return '#NUM!'; return (100 - price) / price * (360 / dsm); }
    case 'TBILLEQ':     { const settle = getNum(args[0]); const mat = getNum(args[1]); const disc = getNum(args[2]); if (disc <= 0 || mat <= settle) return '#NUM!'; const dsm = mat - settle; if (dsm > 365) return '#NUM!'; return (365 * disc) / (360 - disc * dsm); }
  }
  return '#NAME?';
}

// Standard normal CDF via the Abramowitz-Stegun erf approximation (7.1.26).
function normsdist(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
// Inverse standard normal CDF — Acklam's rational approximation.
function normsinv(p: number): number {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
// Natural log of the gamma function — Lanczos approximation (g=7).
function gammaln(x: number): number {
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  x -= 1;
  let a = g[0];
  const t = x + 7.5;
  for (let i = 1; i < g.length; i++) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// Natural log of n! via gammaln(n+1).
function factln(n: number): number {
  return n <= 1 ? 0 : gammaln(n + 1);
}

// Regularized lower incomplete gamma P(a,x) = γ(a,x)/Γ(a) — series expansion for
// x < a+1, continued fraction otherwise (Numerical Recipes gser/gcf). Underpins
// the chi-square and gamma distributions.
function gammap(a: number, x: number): number {
  if (x <= 0 || a <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a, ap = a;
    for (let i = 0; i < 200; i++) { ap++; term *= x / ap; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  // Continued fraction for the complement Q(a,x), then P = 1 - Q.
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}
// Inverse of gammap in x for fixed a (bisection on [0, large]) — backs GAMMA.INV.
function gammapinv(p: number, a: number): number {
  if (p <= 0) return 0;
  let lo = 0, hi = Math.max(20, a * 4);
  while (gammap(a, hi) < p && hi < 1e8) hi *= 2;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (gammap(a, mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
// Regularized incomplete beta I_x(a,b) — Lentz continued fraction (Numerical
// Recipes betacf), with the standard symmetry flip for fast convergence.
// Underpins the beta, Student-t and F distributions.
function betai(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
  return 1 - bt * betacf(1 - x, b, a) / b;
}
function betacf(x: number, a: number, b: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
// Inverse of betai in x for fixed a,b (bisection on [0,1]) — backs BETA.INV and
// the t/F inverses (which invert the incomplete beta).
function betainv(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (betai(mid, a, b) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function parseComplex(v: any): { re: number; im: number; suf: string } | null {
  if (typeof v === 'number') return { re: v, im: 0, suf: 'i' };
  const s = String(v ?? '').trim();
  if (s === '') return { re: 0, im: 0, suf: 'i' };
  // pure real (no imaginary suffix)
  if (!/[ij]$/.test(s)) { const n = Number(s); return isNaN(n) ? null : { re: n, im: 0, suf: 'i' }; }
  const suf = s.slice(-1);
  const body = s.slice(0, -1); // strip trailing i/j
  const num = '(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
  // real + imaginary, e.g. "3+4", "-3-4", "+4", "-4", "4", "" (=1), "+"/"-"
  const m = body.match(new RegExp(`^([+-]?${num})?([+-](?:${num})?)?$`));
  if (!m) return null;
  let re: number, imStr: string;
  if (m[2] !== undefined && m[2] !== '') { re = m[1] === undefined || m[1] === '' ? 0 : Number(m[1]); imStr = m[2]; }
  else { re = 0; imStr = m[1] === undefined ? '' : m[1]; }
  const im = imStr === '' || imStr === '+' ? 1 : imStr === '-' ? -1 : Number(imStr);
  if (isNaN(re) || isNaN(im)) return null;
  return { re, im, suf };
}

function imToText(re: number, im: number, suf: string): string {
  const r = Math.abs(re) < 1e-15 ? 0 : re;
  const i = Math.abs(im) < 1e-15 ? 0 : im;
  if (i === 0) return String(r);
  const imPart = (i === 1 ? '' : i === -1 ? '-' : String(i)) + suf;
  if (r === 0) return imPart;
  const sign = i < 0 ? '' : '+';
  return String(r) + sign + imPart;
}

function formatExcelStyle(v: number, fmt: string): string {
  if (!fmt) return String(v);
  if (fmt === '0' || fmt === '0.00') return v.toFixed(fmt === '0.00' ? 2 : 0);
  if (fmt === '0.00%') return (v * 100).toFixed(2) + '%';
  if (fmt === '$#,##0.00' || fmt === '$#,##0') return '$' + (fmt.includes('.00') ? v.toFixed(2) : v.toFixed(0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (/^(yyyy|mm|dd|h|m|s)/i.test(fmt)) {
    const d = dateFromSerial(v);
    return fmt
      .replace(/yyyy/i, String(d.getUTCFullYear()))
      .replace(/yy/i, String(d.getUTCFullYear() % 100).padStart(2, '0'))
      .replace(/mm/i, String(d.getUTCMonth() + 1).padStart(2, '0'))
      .replace(/dd/i, String(d.getUTCDate()).padStart(2, '0'))
      .replace(/hh/i, String(d.getUTCHours()).padStart(2, '0'));
  }
  return String(v);
}

export const FORMULA_NAMES = [
  'SUM', 'SUMSQ', 'SUMPRODUCT', 'AVERAGE', 'AVG', 'COUNT', 'COUNTA', 'COUNTBLANK', 'MAX', 'MIN', 'PRODUCT',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'TRUNC', 'CEILING', 'FLOOR', 'ABS', 'SIGN', 'SQRT', 'POWER', 'EXP', 'LN', 'LOG', 'LOG10', 'MOD', 'INT', 'PI',
  'EVEN', 'ODD', 'GCD', 'LCM', 'RAND', 'RANDBETWEEN',
  'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2', 'SINH', 'COSH', 'TANH', 'RADIANS', 'DEGREES',
  'MEDIAN', 'MODE', 'STDEV', 'STDEV.S', 'STDEVP', 'STDEV.P', 'VAR', 'VAR.S', 'VARP', 'VAR.P', 'PERCENTILE', 'PERCENTILE.INC', 'QUARTILE', 'RANK', 'CORREL', 'SLOPE', 'INTERCEPT',
  'COUNTIF', 'COUNTIFS', 'SUMIF', 'SUMIFS', 'AVERAGEIF', 'AVERAGEIFS', 'MAXIFS', 'MINIFS',
  'IF', 'IFS', 'IFERROR', 'IFNA', 'SWITCH', 'AND', 'OR', 'XOR', 'NOT', 'TRUE', 'FALSE',
  'CONCATENATE', 'CONCAT', 'TEXTJOIN', 'LEN', 'UPPER', 'LOWER', 'PROPER', 'TRIM', 'CLEAN',
  'LEFT', 'RIGHT', 'MID', 'REPT', 'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH', 'EXACT',
  'TEXT', 'VALUE', 'CHAR', 'CODE', 'UNICHAR', 'UNICODE',
  'REGEXEXTRACT', 'REGEXMATCH', 'REGEXREPLACE', 'SPLIT', 'TEXTSPLIT',
  'NOW', 'TODAY', 'DATE', 'DATEVALUE', 'TIME', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
  'WEEKDAY', 'WEEKNUM', 'DAYS', 'EDATE', 'EOMONTH', 'NETWORKDAYS', 'WORKDAY', 'WORKDAY.INTL', 'YEARFRAC',
  'DATEDIF', 'ISOWEEKNUM', 'DAYS360', 'TIMEVALUE', 'WEEKDAYNAME', 'MONTHNAME', 'QUARTER',
  'ISLEAPYEAR', 'DAYSINMONTH', 'NETWORKDAYS.INTL', 'ISODATE',
  'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH', 'CHOOSE', 'ROW', 'COLUMN',
  'ISBLANK', 'ISNUMBER', 'ISTEXT', 'ISLOGICAL', 'ISERROR', 'ISNA', 'ISEVEN', 'ISODD', 'N', 'TYPE',
  'PMT', 'PV', 'FV', 'NPER', 'NPV', 'IRR', 'RATE', 'XNPV', 'XIRR', 'MIRR', 'AGGREGATE',
  'SLN', 'SYD', 'DDB', 'DB', 'IPMT', 'PPMT', 'ISPMT', 'EFFECT', 'NOMINAL', 'PDURATION', 'RRI', 'FVSCHEDULE', 'DOLLARDE', 'DOLLARFR',
  'FACT', 'FACTDOUBLE', 'COMBIN', 'PERMUT', 'PERMUTATIONA', 'GAMMA', 'MROUND', 'QUOTIENT', 'SEC', 'CSC', 'COT',
  'BASE', 'DECIMAL', 'ROMAN', 'ARABIC', 'GEOMEAN', 'HARMEAN', 'AVEDEV', 'DEVSQ', 'TRIMMEAN',
  'SKEW', 'SKEW.P', 'KURT', 'COVARIANCE.P', 'COVAR', 'COVARIANCE.S', 'PEARSON', 'RSQ',
  'TEXTBEFORE', 'TEXTAFTER', 'NUMBERVALUE', 'FIXED', 'DOLLAR',
  'CONVERT', 'SQRTPI', 'SERIESSUM', 'MULTINOMIAL', 'COMBINA', 'GAMMALN', 'GAMMALN.PRECISE',
  'FISHER', 'FISHERINV', 'GAUSS', 'PHI', 'STANDARDIZE',
  'NORMSDIST', 'NORM.S.DIST', 'NORMSINV', 'NORM.S.INV', 'CONFIDENCE', 'CONFIDENCE.NORM',
  'EXPONDIST', 'EXPON.DIST', 'POISSON', 'POISSON.DIST', 'BINOMDIST', 'BINOM.DIST', 'T',
  'NORMDIST', 'NORM.DIST', 'NORMINV', 'NORM.INV', 'WEIBULL', 'WEIBULL.DIST',
  'LOGNORMDIST', 'LOGNORM.DIST', 'LOGINV', 'LOGNORM.INV', 'HYPGEOMDIST', 'HYPGEOM.DIST',
  'NEGBINOMDIST', 'NEGBINOM.DIST', 'CRITBINOM', 'BINOM.INV',
  'ERF.PRECISE', 'ERFC.PRECISE', 'CHISQ.DIST', 'CHISQ.DIST.RT', 'CHIDIST',
  'GAMMA.DIST', 'GAMMADIST', 'GAMMA.INV', 'GAMMAINV', 'BETA.DIST', 'BETADIST',
  'T.DIST', 'T.DIST.RT', 'T.DIST.2T', 'TDIST', 'F.DIST.RT', 'FDIST', 'F.DIST',
  'CHISQ.INV', 'CHIINV', 'CHISQ.INV.RT', 'BETA.INV', 'BETAINV',
  'T.INV', 'T.INV.2T', 'TINV', 'F.INV', 'F.INV.RT', 'FINV',
  'BIN2DEC', 'DEC2BIN', 'HEX2DEC', 'DEC2HEX', 'OCT2DEC', 'DEC2OCT',
  'BITAND', 'BITOR', 'BITXOR', 'BITLSHIFT', 'BITRSHIFT',
  'GESTEP', 'DELTA', 'ERF', 'ERFC',
  'COMPLEX', 'IMREAL', 'IMAGINARY', 'IMABS', 'IMARGUMENT', 'IMCONJUGATE', 'IMSUM', 'IMSUB', 'IMPRODUCT', 'IMDIV',
  'ASINH', 'ACOSH', 'ATANH', 'CSCH', 'SECH', 'COTH',
  'ACOT', 'ACOTH', 'ACSC', 'ASEC',
  'VALUETOTEXT', 'ENCODEURL', 'DECODEURL',
  'LENB', 'LEFTB', 'RIGHTB', 'MIDB', 'FINDB', 'SEARCHB', 'REPLACEB',
  'ISNONTEXT', 'ISERR', 'NA', 'ERROR.TYPE',
  'CEILING.MATH', 'CEILING.PRECISE', 'ISO.CEILING', 'FLOOR.MATH', 'FLOOR.PRECISE',
  'SUMX2MY2', 'SUMX2PY2', 'SUMXMY2', 'RANK.AVG', 'RANK.EQ', 'LARGE', 'SMALL',
  'MODE.SNGL', 'PERCENTILE.EXC', 'QUARTILE.INC', 'QUARTILE.EXC',
  'PERCENTRANK', 'PERCENTRANK.INC', 'PERCENTRANK.EXC',
  'FORECAST', 'FORECAST.LINEAR', 'STEYX',
  'COUNTUNIQUE', 'AVERAGEA', 'MAXA', 'MINA', 'VARA', 'VARPA', 'STDEVA', 'STDEVPA', 'MODE.MULT',
  'ZTEST', 'Z.TEST', 'TTEST', 'T.TEST', 'FTEST', 'F.TEST', 'CHITEST', 'CHISQ.TEST', 'PROB',
  'CUMIPMT', 'CUMPRINC', 'INTRATE', 'DISC', 'RECEIVED',
  'PRICEDISC', 'YIELDDISC', 'PRICEMAT', 'YIELDMAT', 'ACCRINTM', 'TBILLPRICE', 'TBILLYIELD', 'TBILLEQ',
];
