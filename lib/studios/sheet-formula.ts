/**
 * Spreadsheet formula engine (extracted + extended for Wave 2).
 *
 * Was 8 numeric-only functions (SUM/AVERAGE/MIN/MAX/COUNT/PRODUCT/ROUND/ABS).
 * Now supports logical (IF/AND/OR/NOT), lookup (VLOOKUP), conditional
 * aggregates (COUNTIF/SUMIF/AVERAGEIF), text (CONCAT/LEN/UPPER/LOWER/TRIM/
 * LEFT/RIGHT), and date (YEAR/MONTH/DAY) functions — closing the audit's
 * "no IF/VLOOKUP/dates" gap without a CDN dependency. Still SAFE: arithmetic is
 * evaluated only after every identifier is resolved to a literal (no eval of
 * cell names / function names). Extracted to a shared module so it's unit-
 * testable and reusable (e.g. Chart studio binding to a range).
 */

export function colName(c: number): string {
  let s = '';
  c += 1;
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export function parseRef(ref: string): { c: number; r: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  return { c: colIndex(m[1]), r: parseInt(m[2], 10) - 1 };
}
export const cellKey = (r: number, c: number) => `${colName(c)}${r + 1}`;

export type CellValue = number | string;

/** Uppercase everything EXCEPT the contents of double-quoted string literals. */
function upperOutsideStrings(s: string): string {
  let out = '', inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    out += inStr ? ch : ch.toUpperCase();
  }
  return out;
}

/** Build an evaluator over a flat cell map ({ A1: '5', B1: '=A1*2' }). */
export function makeEvaluator(cells: Record<string, string>): (ref: string) => CellValue {
  const cache = new Map<string, CellValue>();
  const visiting = new Set<string>();
  const key = cellKey;

  function evalRef(ref: string): CellValue {
    if (cache.has(ref)) return cache.get(ref) as CellValue;
    if (visiting.has(ref)) return '#CYCLE';
    const raw = cells[ref];
    if (raw == null || raw === '') return '';
    if (!raw.startsWith('=')) {
      const t = raw.trim();
      const v: CellValue = /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : raw;
      cache.set(ref, v);
      return v;
    }
    visiting.add(ref);
    let out: CellValue;
    try {
      // Uppercase function names + cell refs but PRESERVE the contents of quoted
      // string literals (so =IF(...,"big","small") keeps its lowercase text).
      const n = evalExpr(upperOutsideStrings(raw.slice(1)));
      if (typeof n === 'number') out = isFinite(n) ? n : '#ERR';
      else out = n;
    } catch { out = '#ERR'; }
    visiting.delete(ref);
    cache.set(ref, out);
    return out;
  }

  function num(ref: string): number {
    const v = evalRef(ref);
    const n = typeof v === 'number' ? v : parseFloat(v as string);
    return isNaN(n) ? 0 : n;
  }
  function rangeNums(a: string, b: string): number[] {
    const pa = parseRef(a), pb = parseRef(b);
    if (!pa || !pb) return [];
    const out: number[] = [];
    for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++)
      for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++)
        out.push(num(key(r, c)));
    return out;
  }
  function argVal(s: string): CellValue {
    const t = s.trim();
    if (/^".*"$/.test(t)) return t.slice(1, -1);
    if (parseRef(t)) return evalRef(t);
    if (/^-?\d*\.?\d+$/.test(t)) return parseFloat(t);
    try { return evalExpr(t); } catch { return t; }
  }
  function argNums(s: string): number[] {
    const rm = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(s.trim());
    if (rm) return rangeNums(rm[1], rm[2]);
    const v = argVal(s);
    return typeof v === 'number' ? [v] : [];
  }
  function rangeVals(a: string, b: string): CellValue[] {
    const pa = parseRef(a), pb = parseRef(b);
    if (!pa || !pb) return [];
    const out: CellValue[] = [];
    for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++)
      for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++)
        out.push(evalRef(key(r, c)));
    return out;
  }
  function splitArgs(s: string): string[] {
    const out: string[] = []; let depth = 0, inStr = false, cur = '';
    for (const ch of s) {
      if (ch === '"') inStr = !inStr;
      if (!inStr && ch === '(') depth++;
      if (!inStr && ch === ')') depth--;
      if (!inStr && ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim() || out.length) out.push(cur);
    return out;
  }
  const cmp = (a: CellValue, op: string, b: CellValue): boolean => {
    const na = typeof a === 'number' ? a : parseFloat(a as string);
    const nb = typeof b === 'number' ? b : parseFloat(b as string);
    const bothNum = !isNaN(na) && !isNaN(nb);
    switch (op) {
      case '>': return bothNum ? na > nb : String(a) > String(b);
      case '<': return bothNum ? na < nb : String(a) < String(b);
      case '>=': return bothNum ? na >= nb : String(a) >= String(b);
      case '<=': return bothNum ? na <= nb : String(a) <= String(b);
      case '<>': case '!=': return bothNum ? na !== nb : String(a) !== String(b);
      default: return bothNum ? na === nb : String(a) === String(b);
    }
  };
  const matchCrit = (v: CellValue, crit: string): boolean => {
    const c = crit.trim().replace(/^"|"$/g, '');
    const m = /^(>=|<=|<>|!=|=|>|<)?(.*)$/.exec(c)!;
    const op = m[1] || '=';
    const rhsRaw = m[2].trim();
    const rhs: CellValue = /^-?\d*\.?\d+$/.test(rhsRaw) ? parseFloat(rhsRaw) : rhsRaw;
    return cmp(v, op, rhs);
  };

  function callFn(fn: string, rawArgs: string): CellValue {
    const args = rawArgs.length ? splitArgs(rawArgs) : [];
    const allNums = () => args.flatMap(argNums);
    switch (fn) {
      case 'SUM': return allNums().reduce((a, b) => a + b, 0);
      case 'AVERAGE': { const n = allNums(); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; }
      case 'MIN': { const n = allNums(); return n.length ? Math.min(...n) : 0; }
      case 'MAX': { const n = allNums(); return n.length ? Math.max(...n) : 0; }
      case 'COUNT': return allNums().length;
      case 'COUNTA': return args.flatMap(a => { const rm = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(a.trim()); return rm ? rangeVals(rm[1], rm[2]) : [argVal(a)]; }).filter(v => v !== '' && v != null).length;
      case 'PRODUCT': return allNums().reduce((a, b) => a * b, 1);
      case 'ROUND': { const n = argNums(args[0])[0] ?? 0; const d = Math.round(argNums(args[1] ?? '0')[0] ?? 0); const f = Math.pow(10, d); return Math.round(n * f) / f; }
      case 'ABS': return Math.abs(argNums(args[0])[0] ?? 0);
      case 'POWER': return Math.pow(argNums(args[0])[0] ?? 0, argNums(args[1] ?? '0')[0] ?? 0);
      case 'SQRT': return Math.sqrt(argNums(args[0])[0] ?? 0);
      case 'IF': { const cond = evalCondition(args[0]); return cond ? argVal(args[1] ?? '') : argVal(args[2] ?? ''); }
      case 'AND': return args.every(a => evalCondition(a)) ? 1 : 0;
      case 'OR': return args.some(a => evalCondition(a)) ? 1 : 0;
      case 'NOT': return evalCondition(args[0]) ? 0 : 1;
      case 'COUNTIF': { const rm = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(args[0].trim()); const vals = rm ? rangeVals(rm[1], rm[2]) : []; const crit = args[1] ?? ''; return vals.filter(v => matchCrit(v, crit)).length; }
      case 'SUMIF': case 'AVERAGEIF': {
        const rm = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(args[0].trim());
        const vals = rm ? rangeVals(rm[1], rm[2]) : [];
        const sumRm = args[2] ? /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(args[2].trim()) : rm;
        const sumVals = sumRm ? rangeVals(sumRm[1], sumRm[2]) : vals;
        const crit = args[1] ?? '';
        const picked: number[] = [];
        vals.forEach((v, i) => { if (matchCrit(v, crit)) { const sv = sumVals[i]; const n = typeof sv === 'number' ? sv : parseFloat(sv as string); if (!isNaN(n)) picked.push(n); } });
        if (fn === 'AVERAGEIF') return picked.length ? picked.reduce((a, b) => a + b, 0) / picked.length : 0;
        return picked.reduce((a, b) => a + b, 0);
      }
      case 'VLOOKUP': {
        const keyV = argVal(args[0]);
        const rm = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec((args[1] ?? '').trim());
        if (!rm) return '#REF';
        const pa = parseRef(rm[1])!, pb = parseRef(rm[2])!;
        const col = Math.round(argNums(args[2] ?? '1')[0] ?? 1);
        const c0 = Math.min(pa.c, pb.c), targetC = c0 + (col - 1);
        for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++) {
          if (cmp(evalRef(key(r, c0)), '=', keyV)) return evalRef(key(r, targetC));
        }
        return '#N/A';
      }
      case 'CONCAT': case 'CONCATENATE': return args.map(a => String(argVal(a))).join('');
      case 'LEN': return String(argVal(args[0] ?? '')).length;
      case 'UPPER': return String(argVal(args[0] ?? '')).toUpperCase();
      case 'LOWER': return String(argVal(args[0] ?? '')).toLowerCase();
      case 'TRIM': return String(argVal(args[0] ?? '')).trim();
      case 'LEFT': return String(argVal(args[0] ?? '')).slice(0, Math.round(argNums(args[1] ?? '1')[0] ?? 1));
      case 'RIGHT': { const s = String(argVal(args[0] ?? '')); const n = Math.round(argNums(args[1] ?? '1')[0] ?? 1); return s.slice(Math.max(0, s.length - n)); }
      case 'YEAR': return new Date(String(argVal(args[0] ?? ''))).getFullYear() || 0;
      case 'MONTH': return (new Date(String(argVal(args[0] ?? ''))).getMonth() + 1) || 0;
      case 'DAY': return new Date(String(argVal(args[0] ?? ''))).getDate() || 0;
      default: throw new Error(`Unknown function ${fn}`);
    }
  }

  function evalCondition(expr: string): boolean {
    const e = expr.trim();
    const opM = /(>=|<=|<>|!=|=|>|<)/.exec(e);
    if (opM) {
      const idx = e.indexOf(opM[0]);
      const lhs = argVal(e.slice(0, idx));
      const rhs = argVal(e.slice(idx + opM[0].length));
      return cmp(lhs, opM[0], rhs);
    }
    const v = argVal(e);
    return typeof v === 'number' ? v !== 0 : !!v && v !== 'FALSE';
  }

  function evalExpr(expr: string): CellValue {
    let e = expr;
    const fnRe = /([A-Z][A-Z0-9]*)\(([^()]*)\)/;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = fnRe.exec(e)) && guard++ < 400) {
      const res = callFn(m[1].toUpperCase(), m[2]);
      const lit = typeof res === 'number' ? String(res) : JSON.stringify(res);
      e = e.slice(0, m.index) + lit + e.slice(m.index + m[0].length);
    }
    const strWhole = /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(e);
    if (strWhole) { try { return JSON.parse(`"${strWhole[1]}"`); } catch { return strWhole[1]; } }
    e = e.replace(/[A-Z]+\d+/g, (ref) => String(num(ref)));
    if (/"/.test(e)) {
      const sm = /^\s*"(.*)"\s*$/.exec(e);
      if (sm) return sm[1];
    }
    if (!/^[-+*/().\d\s]*$/.test(e)) throw new Error('Invalid expression');
    if (!e.trim()) return 0;
    // eslint-disable-next-line no-new-func
    const out = Function(`"use strict"; return (${e});`)();
    if (typeof out !== 'number') throw new Error('NaN');
    return out;
  }

  return evalRef;
}
