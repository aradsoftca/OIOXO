'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

type Key =
  | { t: 'num'; v: string } | { t: 'op'; v: string } | { t: 'eq' }
  | { t: 'clear' } | { t: 'back' } | { t: 'dot' } | { t: 'neg' }
  | { t: 'fn'; v: string } | { t: 'const'; v: string } | { t: 'pct' };

const BASIC_LAYOUT: Key[][] = [
  [{ t: 'clear' }, { t: 'back' }, { t: 'pct' }, { t: 'op', v: '/' }],
  [{ t: 'num', v: '7' }, { t: 'num', v: '8' }, { t: 'num', v: '9' }, { t: 'op', v: '*' }],
  [{ t: 'num', v: '4' }, { t: 'num', v: '5' }, { t: 'num', v: '6' }, { t: 'op', v: '-' }],
  [{ t: 'num', v: '1' }, { t: 'num', v: '2' }, { t: 'num', v: '3' }, { t: 'op', v: '+' }],
  [{ t: 'neg' }, { t: 'num', v: '0' }, { t: 'dot' }, { t: 'eq' }],
];

const SCI_LAYOUT: Key[][] = [
  [{ t: 'fn', v: 'sin' }, { t: 'fn', v: 'cos' }, { t: 'fn', v: 'tan' }, { t: 'fn', v: 'ln' }, { t: 'fn', v: 'log' }],
  [{ t: 'fn', v: 'asin' }, { t: 'fn', v: 'acos' }, { t: 'fn', v: 'atan' }, { t: 'fn', v: 'sqrt' }, { t: 'fn', v: 'cbrt' }],
  [{ t: 'op', v: '^' }, { t: 'fn', v: 'exp' }, { t: 'fn', v: 'fact' }, { t: 'const', v: 'pi' }, { t: 'const', v: 'e' }],
];

function fmt(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(8);
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  // Cap at 170 — past that, the result overflows to Infinity anyway (170! is
  // the largest factorial representable in a double). Without this cap a user
  // typing "1e100!" would freeze the tab in an unbounded loop.
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Tokenize + shunting-yard eval. Supports + - * / ^, parens, unary minus. */
function evaluate(expr: string, deg: boolean): number {
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'u-': 4 };
  const right: Record<string, boolean> = { '^': true, 'u-': true };
  const tokens = expr.match(/(\d+\.?\d*|\.\d+|[a-z]+|[-+*/^()])/g) ?? [];
  let prev: string | null = null;
  const apply = (op: string) => {
    if (op === 'u-') { const a = out.pop() as number; out.push(-a); return; }
    const b = out.pop() as number; const a = out.pop() as number;
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : Math.pow(a, b));
  };
  const trig = (name: string, x: number): number => {
    const r = deg ? (x * Math.PI) / 180 : x;
    switch (name) {
      case 'sin': return Math.sin(r); case 'cos': return Math.cos(r); case 'tan': return Math.tan(r);
      case 'asin': return deg ? (Math.asin(x) * 180) / Math.PI : Math.asin(x);
      case 'acos': return deg ? (Math.acos(x) * 180) / Math.PI : Math.acos(x);
      case 'atan': return deg ? (Math.atan(x) * 180) / Math.PI : Math.atan(x);
      case 'ln': return Math.log(x); case 'log': return Math.log10(x);
      case 'sqrt': return Math.sqrt(x); case 'cbrt': return Math.cbrt(x);
      case 'exp': return Math.exp(x); case 'fact': return factorial(x);
      default: return NaN;
    }
  };
  const fnQueue: string[] = [];
  for (const tk of tokens) {
    if (/^(\d|\.)/.test(tk)) { out.push(parseFloat(tk)); prev = 'num'; }
    else if (tk === 'pi') { out.push(Math.PI); prev = 'num'; }
    else if (tk === 'e') { out.push(Math.E); prev = 'num'; }
    else if (/^[a-z]+$/.test(tk)) { fnQueue.push(tk); prev = 'fn'; }
    else if (tk === '(') { ops.push('('); prev = '('; }
    else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') apply(ops.pop() as string);
      ops.pop();
      if (fnQueue.length && out.length) { const x = out.pop() as number; out.push(trig(fnQueue.pop() as string, x)); }
      prev = 'num';
    } else {
      let op = tk;
      if (tk === '-' && (prev === null || prev === 'op' || prev === '(')) op = 'u-';
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === '(') break;
        if ((right[op] ? prec[top] > prec[op] : prec[top] >= prec[op])) apply(ops.pop() as string);
        else break;
      }
      ops.push(op); prev = 'op';
    }
  }
  while (ops.length) apply(ops.pop() as string);
  return out.length ? (out[0] as number) : NaN;
}

interface HistoryEntry { expr: string; result: string }

export function Calculator({ scientific = false }: { scientific?: boolean }) {
  const [expr, setExpr] = React.useState('');
  const [result, setResult] = React.useState('0');
  const [deg, setDeg] = React.useState(true);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const compute = React.useCallback((e: string) => {
    if (!e.trim()) { setResult('0'); return; }
    try { setResult(fmt(evaluate(e, deg))); } catch { setResult('Error'); }
  }, [deg]);

  React.useEffect(() => { compute(expr); }, [expr, deg, compute]);

  const copyResult = React.useCallback(() => {
    if (result === '0' || result === 'Error') return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(result).then(
      () => {
        setCopied(true);
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1400);
      },
      () => {/* clipboard denied (iframe / insecure context) — silent */},
    );
  }, [result]);
  React.useEffect(() => () => clearTimeout(copyTimer.current), []);

  // "=" commits the current expression to history then keeps the result on the
  // display so it chains into the next calculation (calculator.net behaviour).
  const commit = React.useCallback(() => {
    if (result === 'Error') { setExpr(''); return; }
    setExpr((cur) => {
      if (cur.trim() && cur !== result) {
        setHistory((h) => [{ expr: cur, result }, ...h].slice(0, 12));
      }
      return result;
    });
  }, [result]);

  const press = (k: Key) => {
    if (k.t === 'clear') { setExpr(''); setResult('0'); return; }
    if (k.t === 'back') { setExpr((s) => s.slice(0, -1)); return; }
    if (k.t === 'eq') { commit(); return; }
    if (k.t === 'num') { setExpr((s) => s + k.v); return; }
    if (k.t === 'dot') { setExpr((s) => s + '.'); return; }
    if (k.t === 'op') { setExpr((s) => s + k.v); return; }
    if (k.t === 'neg') { setExpr((s) => (s.startsWith('-') ? s.slice(1) : '-' + s)); return; }
    if (k.t === 'pct') { setExpr((s) => s + '/100'); return; }
    if (k.t === 'const') { setExpr((s) => s + k.v); return; }
    if (k.t === 'fn') {
      if (k.v === 'fact') { setExpr((s) => `fact(${s || result})`); }
      else { setExpr((s) => `${s}${k.v}(`); }
      return;
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing when the user is in a real form field elsewhere on
      // the page (search bar, other inputs) — only drive the calculator when no
      // editable element holds focus.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key;
      if (/[0-9]/.test(k)) setExpr((s) => s + k);
      else if (k === '.') setExpr((s) => s + '.');
      else if (['+', '-', '*', '/', '^', '(', ')'].includes(k)) setExpr((s) => s + k);
      else if (k === 'Enter' || k === '=') { e.preventDefault(); commit(); }
      else if (k === 'Backspace') setExpr((s) => s.slice(0, -1));
      else if (k === 'Escape') { setExpr(''); setResult('0'); }
      else if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'C')) { copyResult(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit, copyResult]);

  const label = (k: Key): string => {
    switch (k.t) {
      case 'num': return k.v; case 'dot': return '.'; case 'eq': return '=';
      case 'clear': return 'C'; case 'back': return '⌫'; case 'neg': return '±'; case 'pct': return '%';
      case 'op': return k.v === '*' ? '×' : k.v === '/' ? '÷' : k.v;
      case 'fn': return k.v === 'fact' ? 'n!' : k.v === 'sqrt' ? '√' : k.v === 'cbrt' ? '∛' : k.v;
      case 'const': return k.v === 'pi' ? 'π' : 'e';
    }
  };

  const btnClass = (k: Key) => cn(
    'flex items-center justify-center py-3.5 text-[15px] font-semibold transition select-none',
    k.t === 'eq' ? 'bg-[var(--color-cat-calc)] text-white hover:brightness-110'
      : k.t === 'op' || k.t === 'fn' || k.t === 'const' ? 'bg-[var(--color-surface-2)] text-[var(--color-cat-calc)] hover:bg-black/[0.06]'
      : k.t === 'clear' || k.t === 'back' ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:bg-black/[0.06]'
      : 'bg-[var(--color-surface-1)] text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]',
  );

  const canCopy = result !== '0' && result !== 'Error';

  return (
    <div className="mx-auto max-w-md space-y-3">
      <button
        type="button"
        onClick={canCopy ? copyResult : undefined}
        title={canCopy ? 'Click to copy result' : undefined}
        className={cn(
          'group block w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-left transition',
          canCopy && 'cursor-pointer hover:border-[color:color-mix(in_oklch,var(--color-cat-calc)_40%,transparent)]',
        )}
      >
        <div className="flex min-h-[20px] items-center justify-between gap-2">
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-[0.16em] transition',
              copied ? 'text-[var(--color-cat-calc)] opacity-100' : 'opacity-0 group-hover:opacity-60',
            )}
          >
            {copied ? 'Copied' : canCopy ? 'Copy' : ''}
          </span>
          <span className="truncate font-mono text-[13px] text-[var(--color-fg-muted)]">{expr || ' '}</span>
        </div>
        <div className="truncate text-right font-mono text-[34px] font-bold tracking-tight text-[var(--color-fg)]">{result}</div>
      </button>

      {scientific && (
        <div className="flex items-center justify-between">
          <div className="inline-flex border border-black/[0.08]">
            {(['deg', 'rad'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setDeg(m === 'deg')}
                className={cn('px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition',
                  (deg ? 'deg' : 'rad') === m ? 'bg-[var(--color-cat-calc)] text-white' : 'text-[var(--color-fg-muted)]')}>
                {m}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--color-fg-subtle)]">Type or click — keyboard works too</span>
        </div>
      )}

      {scientific && (
        <div className="grid grid-cols-5 gap-1.5">
          {SCI_LAYOUT.flat().map((k, i) => (
            <button key={i} type="button" onClick={() => press(k)} className={cn(btnClass(k), 'py-2.5 text-[12px]')}>
              {label(k)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {BASIC_LAYOUT.flat().map((k, i) => (
          <button key={i} type="button" onClick={() => press(k)} className={btnClass(k)}>
            {label(k)}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">History</span>
            <button
              type="button"
              onClick={() => setHistory([])}
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {history.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setExpr(h.result)}
                title="Recall this result"
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left transition hover:bg-[var(--color-surface-2)]"
              >
                <span className="truncate font-mono text-[12px] text-[var(--color-fg-muted)]">{h.expr}</span>
                <span className="shrink-0 font-mono text-[13px] font-semibold text-[var(--color-fg)] tabular-nums">= {h.result}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
