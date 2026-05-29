'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { lusolve, matrix, parse as mathParse, evaluate, derivative } from 'mathjs';

type Mode = 'single' | 'system';

function solveSingle(eq: string, variable: string): number[] {
  // Accept "f(x) = g(x)" or just "f(x)"
  const parts = eq.split('=').map((s) => s.trim());
  const lhs = parts.length === 2 ? `(${parts[0]}) - (${parts[1]})` : eq;
  const node = mathParse(lhs);
  const code = node.compile();
  const f = (x: number) => Number(code.evaluate({ [variable]: x }));
  // Try analytic derivative for Newton's method
  const dnode = derivative(node, variable);
  const dcode = dnode.compile();
  const df = (x: number) => Number(dcode.evaluate({ [variable]: x }));

  const roots: number[] = [];
  // Scan for sign changes, then refine with Newton
  let prev = f(-100);
  for (let i = -100; i <= 100; i += 0.5) {
    const cur = f(i);
    if (prev * cur < 0 || cur === 0) {
      let x = i;
      for (let k = 0; k < 50; k++) {
        const fx = f(x);
        const dfx = df(x);
        if (Math.abs(dfx) < 1e-12) break;
        const nx = x - fx / dfx;
        if (Math.abs(nx - x) < 1e-10) { x = nx; break; }
        x = nx;
      }
      const rounded = Number(x.toFixed(8));
      if (Math.abs(f(rounded)) < 1e-4 && !roots.some((r) => Math.abs(r - rounded) < 1e-4)) {
        roots.push(rounded);
      }
    }
    prev = cur;
  }
  return roots.sort((a, b) => a - b);
}

function parseSystem(input: string): { A: number[][]; B: number[]; vars: string[] } | null {
  // Each row: "2x + 3y = 7" — we'll parse the coefficients
  const lines = input.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const varSet = new Set<string>();
  lines.forEach((l) => {
    const matches = l.match(/[a-zA-Z]/g) ?? [];
    matches.forEach((c) => varSet.add(c));
  });
  const vars = Array.from(varSet).sort();
  const A: number[][] = [];
  const B: number[] = [];
  for (const line of lines) {
    const [lhs, rhs] = line.split('=').map((s) => s.trim());
    if (!rhs) return null;
    const rhsVal = evaluate(rhs) as number;
    const row: number[] = new Array(vars.length).fill(0);
    // Parse lhs by replacing each var with (var_i * coefSentinel) and evaluating with bases
    for (let i = 0; i < vars.length; i++) {
      const scope: Record<string, number> = {};
      vars.forEach((v) => scope[v] = 0);
      scope[vars[i]] = 1;
      try {
        row[i] = evaluate(lhs, scope) as number;
      } catch { return null; }
    }
    // Constant term (all vars = 0) goes to RHS
    const scope0: Record<string, number> = {};
    vars.forEach((v) => scope0[v] = 0);
    const constant = evaluate(lhs, scope0) as number;
    // Subtract constant column influence
    for (let i = 0; i < row.length; i++) row[i] -= constant;
    A.push(row);
    B.push(rhsVal - constant);
  }
  if (A.length !== vars.length) return null;
  return { A, B, vars };
}

export default function Tool() {
  const [mode, setMode] = React.useState<Mode>('single');
  const [single, setSingle] = React.useState('x^2 - 4 = 0');
  const [singleVar, setSingleVar] = React.useState('x');
  const [system, setSystem] = React.useState('2x + 3y = 13\n4x - y = 5');
  const [copied, setCopied] = React.useState(false);

  const result = React.useMemo(() => {
    try {
      if (mode === 'single') {
        const roots = solveSingle(single, singleVar);
        if (roots.length === 0) return { ok: true, lines: [`No real roots in [-100, 100]`] };
        return { ok: true, lines: roots.map((r, i) => `${singleVar}${roots.length > 1 ? `_${i + 1}` : ''} = ${r}`) };
      } else {
        const parsed = parseSystem(system);
        if (!parsed) return { ok: false, msg: 'Could not parse system. Each line: a*x + b*y = c' };
        const sol = lusolve(matrix(parsed.A), parsed.B) as { toArray(): number[][] };
        const arr = sol.toArray().flat();
        return { ok: true, lines: parsed.vars.map((v, i) => `${v} = ${Number(arr[i].toFixed(8))}`) };
      }
    } catch (e) {
      return { ok: false, msg: (e as Error).message };
    }
  }, [mode, single, singleVar, system]);

  const copy = async () => {
    if (!result.ok) return;
    try {
      await navigator.clipboard?.writeText(result.lines!.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* iframe / permission denied */ }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(['single', 'system'] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`border py-3 text-[13px] font-bold transition ${mode === m ? 'border-[var(--color-cat-calc)] bg-[var(--color-cat-calc)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
            {m === 'single' ? 'Single variable' : 'Linear system'}
          </button>
        ))}
      </div>

      {mode === 'single' ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
          <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Equation</div>
            <input type="text" value={single} onChange={(e) => setSingle(e.target.value)}
              placeholder="x^2 - 4 = 0"
              className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[16px] outline-none focus:border-[var(--color-cat-calc)]" />
          </label>
          <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Variable</div>
            <input type="text" value={singleVar} onChange={(e) => setSingleVar(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 1) || 'x')}
              className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[16px] outline-none focus:border-[var(--color-cat-calc)]" />
          </label>
        </div>
      ) : (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">System</div>
          <textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={5}
            placeholder="2x + 3y = 13&#10;4x - y = 5"
            className="w-full bg-[var(--color-canvas)] border border-black/[0.08] p-2 font-mono text-[14px] outline-none focus:border-[var(--color-cat-calc)]" />
          <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">One equation per line. Variables auto-detected.</div>
        </div>
      )}

      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Solution</span>
          {result.ok && (
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          )}
        </div>
        {result.ok ? (
          <div className="space-y-1 font-mono text-[16px] tabular-nums">
            {result.lines!.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        ) : (
          <div className="text-[12px] text-red-600">{result.msg}</div>
        )}
      </div>
    </div>
  );
}
