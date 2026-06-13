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
    case 'YEARFRAC':    return Math.abs(getNum(args[1]) - getNum(args[0])) / 365.25;

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
  }
  return '#NAME?';
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
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
  'MEDIAN', 'MODE', 'STDEV', 'STDEVP', 'VAR', 'VARP', 'PERCENTILE', 'QUARTILE', 'RANK', 'CORREL', 'SLOPE', 'INTERCEPT',
  'COUNTIF', 'COUNTIFS', 'SUMIF', 'SUMIFS', 'AVERAGEIF', 'AVERAGEIFS', 'MAXIFS', 'MINIFS',
  'IF', 'IFS', 'IFERROR', 'IFNA', 'SWITCH', 'AND', 'OR', 'XOR', 'NOT', 'TRUE', 'FALSE',
  'CONCATENATE', 'CONCAT', 'TEXTJOIN', 'LEN', 'UPPER', 'LOWER', 'PROPER', 'TRIM', 'CLEAN',
  'LEFT', 'RIGHT', 'MID', 'REPT', 'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH', 'EXACT',
  'TEXT', 'VALUE', 'CHAR', 'CODE', 'UNICHAR', 'UNICODE',
  'REGEXEXTRACT', 'REGEXMATCH', 'REGEXREPLACE', 'SPLIT',
  'NOW', 'TODAY', 'DATE', 'DATEVALUE', 'TIME', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
  'WEEKDAY', 'WEEKNUM', 'DAYS', 'EDATE', 'EOMONTH', 'NETWORKDAYS', 'WORKDAY', 'YEARFRAC',
  'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH', 'CHOOSE', 'ROW', 'COLUMN',
  'ISBLANK', 'ISNUMBER', 'ISTEXT', 'ISLOGICAL', 'ISERROR', 'ISNA', 'ISEVEN', 'ISODD', 'N', 'TYPE',
  'PMT', 'PV', 'FV', 'NPER', 'NPV', 'IRR', 'RATE', 'XNPV', 'XIRR', 'MIRR', 'AGGREGATE',
];
