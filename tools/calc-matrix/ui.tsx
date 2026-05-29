'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { matrix, det, inv, transpose, multiply, add, subtract } from 'mathjs';

type Matrix2D = number[][];

function parse(input: string): Matrix2D | null {
  const rows = input.trim().split(/\n/).map((r) => r.trim()).filter(Boolean);
  if (rows.length === 0) return null;
  const parsed = rows.map((r) => r.split(/[,\s]+/).map(Number));
  const w = parsed[0].length;
  if (parsed.some((r) => r.length !== w || r.some(isNaN))) return null;
  return parsed;
}

function format(m: Matrix2D | number): string {
  if (typeof m === 'number') return m.toString();
  const maxW = Math.max(...m.flat().map((v) => String(Number(v.toFixed(4))).length));
  return m.map((r) => r.map((v) => String(Number(v.toFixed(4))).padStart(maxW)).join('  ')).join('\n');
}

type Op = 'inv' | 'det' | 'trans' | 'mult' | 'add' | 'sub';

export default function Tool() {
  const [a, setA] = React.useState('1 2\n3 4');
  const [b, setB] = React.useState('5 6\n7 8');
  const [op, setOp] = React.useState<Op>('inv');
  const [copied, setCopied] = React.useState(false);

  const result = React.useMemo(() => {
    const mA = parse(a);
    if (!mA) return { ok: false, msg: 'Matrix A has invalid format' };
    const needsB = op === 'mult' || op === 'add' || op === 'sub';
    let mB: Matrix2D | null = null;
    if (needsB) {
      mB = parse(b);
      if (!mB) return { ok: false, msg: 'Matrix B has invalid format' };
    }
    try {
      switch (op) {
        case 'inv':  return { ok: true, value: (inv(matrix(mA)).toArray() as Matrix2D) };
        case 'det':  return { ok: true, value: det(matrix(mA)) };
        case 'trans': return { ok: true, value: (transpose(matrix(mA)).toArray() as Matrix2D) };
        case 'mult': return { ok: true, value: (multiply(matrix(mA), matrix(mB!)).toArray() as Matrix2D) };
        case 'add':  return { ok: true, value: (add(matrix(mA), matrix(mB!)).toArray() as Matrix2D) };
        case 'sub':  return { ok: true, value: (subtract(matrix(mA), matrix(mB!)).toArray() as Matrix2D) };
      }
    } catch (e) {
      return { ok: false, msg: (e as Error).message };
    }
  }, [a, b, op]);

  const copy = async () => {
    if (!result?.ok) return;
    try {
      await navigator.clipboard?.writeText(format(result.value!));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* iframe / permission denied */ }
  };

  const OPS: { id: Op; label: string }[] = [
    { id: 'inv', label: 'A⁻¹' },
    { id: 'det', label: 'det(A)' },
    { id: 'trans', label: 'Aᵀ' },
    { id: 'mult', label: 'A × B' },
    { id: 'add', label: 'A + B' },
    { id: 'sub', label: 'A − B' },
  ];

  const needsB = op === 'mult' || op === 'add' || op === 'sub';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {OPS.map((o) => (
          <button key={o.id} type="button" onClick={() => setOp(o.id)}
            className={`border py-3 text-[13px] font-bold transition ${op === o.id ? 'border-[var(--color-cat-calc)] bg-[var(--color-cat-calc)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
            {o.label}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${needsB ? 'lg:grid-cols-2' : ''}`}>
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Matrix A</div>
          <textarea value={a} onChange={(e) => setA(e.target.value)} rows={5}
            placeholder="1 2&#10;3 4"
            className="w-full bg-[var(--color-canvas)] border border-black/[0.08] p-2 font-mono text-[13px] tabular-nums outline-none focus:border-[var(--color-cat-calc)]" />
          <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">Separate values with spaces, rows with newlines.</div>
        </div>
        {needsB && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Matrix B</div>
            <textarea value={b} onChange={(e) => setB(e.target.value)} rows={5}
              className="w-full bg-[var(--color-canvas)] border border-black/[0.08] p-2 font-mono text-[13px] tabular-nums outline-none focus:border-[var(--color-cat-calc)]" />
          </div>
        )}
      </div>

      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</span>
          {result?.ok && (
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          )}
        </div>
        {result?.ok ? (
          <pre className="font-mono text-[14px] tabular-nums whitespace-pre">{format(result.value!)}</pre>
        ) : (
          <div className="text-[12px] text-red-600">{result?.msg}</div>
        )}
      </div>
    </div>
  );
}
