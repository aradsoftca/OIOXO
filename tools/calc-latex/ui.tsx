'use client';
import * as React from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { parse as mathParse } from 'mathjs';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type Mode = 'plain' | 'tex';

const EXAMPLES: { label: string; input: string; mode: Mode }[] = [
  { label: 'Quadratic', mode: 'tex',   input: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Sum',       mode: 'tex',   input: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}' },
  { label: 'Integral',  mode: 'tex',   input: '\\int_0^{\\pi} \\sin(x) \\, dx = 2' },
  { label: 'Matrix',    mode: 'tex',   input: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Plain',     mode: 'plain', input: '(a + b)^3 / sqrt(c^2 + d^2)' },
];

export default function Tool() {
  const [mode, setMode] = React.useState<Mode>('tex');
  const [input, setInput] = React.useState(EXAMPLES[0].input);
  const [copied, setCopied] = React.useState(false);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const tex = React.useMemo(() => {
    if (mode === 'tex') return input;
    try { return mathParse(input).toTex(); }
    catch { return input; }
  }, [mode, input]);

  const rendered = React.useMemo(() => {
    try { return katex.renderToString(tex, { displayMode: true, throwOnError: false, errorColor: '#dc2626' }); }
    catch { return ''; }
  }, [tex]);

  const copyTex = async () => {
    await navigator.clipboard?.writeText(tex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const downloadPng = async () => {
    if (!previewRef.current) return;
    // Build an SVG-foreignObject of the rendered html, then rasterize to a canvas
    const w = previewRef.current.offsetWidth || 400;
    const h = previewRef.current.offsetHeight || 100;
    const html = previewRef.current.innerHTML;
    // Pull katex stylesheet inline
    const sheets = Array.from(document.styleSheets);
    let katexCss = '';
    for (const s of sheets) {
      try {
        if (s.href && s.href.includes('katex')) {
          const rules = Array.from(s.cssRules);
          katexCss += rules.map((r) => r.cssText).join('\n');
        }
      } catch { /* cross-origin */ }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'KaTeX_Main', serif; padding: 8px; color: #000;">
<style>${katexCss}</style>
${html}
</div>
</foreignObject>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2; c.height = h * 2;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u; a.download = 'equation.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(u);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(['tex', 'plain'] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`border py-2.5 text-[12px] font-bold transition ${mode === m ? 'border-[var(--color-cat-calc)] bg-[var(--color-cat-calc)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
            {m === 'tex' ? 'LaTeX' : 'Plain math'}
          </button>
        ))}
      </div>

      <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Input</div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3}
          className="mt-1 w-full bg-transparent py-1 font-mono text-[14px] outline-none" />
      </label>

      <div className="grid grid-cols-5 gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" onClick={() => { setMode(ex.mode); setInput(ex.input); }}
            className="border border-black/[0.08] py-2 text-[11px] font-bold hover:border-[var(--color-cat-calc)]">
            {ex.label}
          </button>
        ))}
      </div>

      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6 min-h-[120px] flex items-center justify-center">
        <div ref={previewRef} className="text-[24px]" dangerouslySetInnerHTML={{ __html: rendered }} />
      </div>

      {mode === 'plain' && (
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">LaTeX source</div>
          <div className="mt-1 font-mono text-[12px] break-all">{tex}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={copyTex}
          className="inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] text-[var(--color-bg)] py-2.5 text-[12px] font-bold uppercase tracking-wider">
          {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy LaTeX</>}
        </button>
        <button type="button" onClick={downloadPng}
          className="inline-flex items-center justify-center gap-2 bg-[var(--color-cat-calc)] text-white py-2.5 text-[12px] font-bold uppercase tracking-wider">
          <Download className="h-4 w-4" /> PNG
        </button>
      </div>
    </div>
  );
}
