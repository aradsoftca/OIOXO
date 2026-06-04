let katexPromise: Promise<any> | null = null;

async function loadKatex(): Promise<any> {
  if (katexPromise) return katexPromise;
  const p = (async () => {
    if ((window as any).katex) return (window as any).katex;
    const cssUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    if (!document.querySelector(`link[href="${cssUrl}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
      document.head.appendChild(link);
    }
    const url = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs';
    const mod: any = await (new Function('u', 'return import(u)'))(url);
    const katex = mod.default ?? mod;
    (window as any).katex = katex;
    return katex;
  })();
  katexPromise = p;
  // Drop the cache on reject so a transient CDN blip doesn't keep equations
  // disabled until reload. Next call to renderEquationToHtml will retry.
  p.catch(() => { if (katexPromise === p) katexPromise = null; });
  return p;
}

export async function renderEquationToHtml(latex: string, displayMode = false): Promise<string> {
  try {
    const katex = await loadKatex();
    return katex.renderToString(latex, { displayMode, throwOnError: false, output: 'html' });
  } catch {
    return `<code style="color:#fca5a5">${escapeHtml(latex)}</code>`;
  }
}

export function renderEquationSync(latex: string, displayMode = false): string {
  const katex = (window as any).katex;
  if (!katex) return `<code style="color:#666">$${escapeHtml(latex)}$</code>`;
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false, output: 'html' });
  } catch {
    return `<code style="color:#fca5a5">${escapeHtml(latex)}</code>`;
  }
}

export async function preloadKatex(): Promise<void> {
  await loadKatex();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const EQUATION_TEMPLATES: { label: string; latex: string }[] = [
  { label: 'Fraction',         latex: '\\frac{a}{b}' },
  { label: 'Square root',      latex: '\\sqrt{x}' },
  { label: 'Nth root',         latex: '\\sqrt[n]{x}' },
  { label: 'Sum',              latex: '\\sum_{i=1}^{n} a_i' },
  { label: 'Integral',         latex: '\\int_a^b f(x)\\,dx' },
  { label: 'Limit',            latex: '\\lim_{x \\to \\infty} f(x)' },
  { label: 'Product',          latex: '\\prod_{i=1}^{n} a_i' },
  { label: 'Matrix 2×2',       latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Pythagoras',       latex: 'a^2 + b^2 = c^2' },
  { label: 'Quadratic',        latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
  { label: 'Euler\'s identity',latex: 'e^{i\\pi} + 1 = 0' },
  { label: "Newton's 2nd",     latex: 'F = m a' },
  { label: 'Einstein',         latex: 'E = mc^2' },
  { label: 'Derivative',       latex: '\\frac{dy}{dx}' },
  { label: 'Partial deriv',    latex: '\\frac{\\partial f}{\\partial x}' },
  { label: 'Greek letters',    latex: '\\alpha \\beta \\gamma \\delta \\Theta \\Lambda \\pi' },
];
