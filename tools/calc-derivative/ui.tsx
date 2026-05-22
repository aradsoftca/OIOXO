'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { derivative, parse as mathParse, simplify } from 'mathjs';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function Tool() {
  const [expr, setExpr] = React.useState('x^3 + 2x^2 - 5x + 7');
  const [variable, setVariable] = React.useState('x');
  const [order, setOrder] = React.useState(1);
  const [copied, setCopied] = React.useState(false);

  const result = React.useMemo(() => {
    if (!expr.trim()) return { ok: false, msg: '' };
    try {
      let node = mathParse(expr);
      for (let i = 0; i < order; i++) {
        node = derivative(node, variable);
      }
      const simplified = simplify(node);
      const text = simplified.toString();
      const tex = simplified.toTex();
      return { ok: true, text, tex, originalTex: mathParse(expr).toTex() };
    } catch (e) {
      return { ok: false, msg: (e as Error).message };
    }
  }, [expr, variable, order]);

  const copy = async () => {
    if (!result.ok) return;
    await navigator.clipboard?.writeText(result.text!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const renderTex = (tex: string) => {
    try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); }
    catch { return ''; }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Expression f(x)</div>
            <input type="text" value={expr} onChange={(e) => setExpr(e.target.value)}
              placeholder="x^3 + 2x^2 - 5x + 7"
              className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[16px] outline-none focus:border-[var(--color-cat-calc)]" />
          </label>

          {result.ok && (
            <>
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Input</div>
                <div className="text-[18px]" dangerouslySetInnerHTML={{ __html: renderTex(result.originalTex!) }} />
              </div>

              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{order === 1 ? 'd/dx f(x)' : `d^${order}/d${variable}^${order} f(${variable})`}</span>
                  <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                    {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                  </button>
                </div>
                <div className="text-[20px]" dangerouslySetInnerHTML={{ __html: renderTex(result.tex!) }} />
                <div className="mt-3 font-mono text-[12px] text-[var(--color-fg-muted)] border-t border-black/[0.05] pt-2 break-all">{result.text}</div>
              </div>
            </>
          )}
          {!result.ok && result.msg && (
            <div className="border border-red-500/30 bg-red-500/5 p-3 text-[12px] text-red-600">{result.msg}</div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-3">
            <label className="block">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Variable</div>
              <input type="text" value={variable} onChange={(e) => setVariable(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 1) || 'x')}
                className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[14px] outline-none focus:border-[var(--color-cat-calc)]" />
            </label>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Order</div>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => setOrder(n)}
                    className={`border py-2 text-[12px] font-bold transition ${order === n ? 'border-[var(--color-cat-calc)] bg-[var(--color-cat-calc)] text-white' : 'border-black/[0.08]'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[11px] text-[var(--color-fg-muted)] space-y-1">
            <div className="font-bold uppercase tracking-[0.22em] text-[10px] mb-1">Syntax</div>
            <div>x^2 · sin(x) · cos(x) · ln(x) · exp(x)</div>
            <div>sqrt(x) · abs(x) · pi · e</div>
            <div>Multi-var: sin(x*y) with var y</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
