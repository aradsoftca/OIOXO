/**
 * Xonvert AI — symbolic / scientific math (mathjs).
 *
 * Derivatives, simplification, scientific evaluation (trig/log/sqrt/…) and matrix
 * determinants — computed for real with mathjs (already a dependency, used by the
 * calc pages). Kept in its own module so AiApp can lazy-import it only when a
 * math request appears, keeping mathjs out of the main bundle. Pure / Node-test.
 *
 * Not here: symbolic integration and general equation solving — mathjs has no
 * reliable solver/integrator, so those tools correctly stay hand-off.
 */

import { derivative, evaluate, simplify } from 'mathjs';

export const MATH_IDS = ['calc-derivative', 'calc-scientific', 'calc-matrix'];
export function isMathOp(id: string): boolean { return MATH_IDS.includes(id); }

/** Strip question words / trailing punctuation and normalise "ln" → log. */
function clean(s: string): string {
  return s.trim()
    .replace(/^(what(?:'s| is)?|whats|calculate|compute|evaluate|simplify|find)\s+/i, '')
    .replace(/[?.!]+\s*$/, '')
    .replace(/\bln\b/gi, 'log')
    .trim();
}
function fmt(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String((v as { toString(): string }).toString());
}

export function tryMath(text: string): { tool: string; result: string } | null {
  // Derivative.
  let m = text.match(/(?:derivative|differentiate|d\/dx)\s*(?:of)?\s*(.+)/i);
  if (m) {
    try { const e = clean(m[1]); return { tool: 'calc-derivative', result: `d/dx (${e}) = ${simplify(derivative(e, 'x')).toString()}` }; }
    catch { /* not differentiable input */ }
  }
  // Simplify.
  m = text.match(/simplify\s+(.+)/i);
  if (m) {
    try { return { tool: 'calc-scientific', result: simplify(clean(m[1])).toString() }; }
    catch { /* ignore */ }
  }
  // Matrix determinant.
  if (/\b(determinant|det)\b/i.test(text)) {
    const b = text.match(/\[\[.*?\]\]/);
    if (b) {
      try { const mx = b[0].replace(/^\[/, '').replace(/\]$/, '').replace(/\]\s*,\s*\[/g, ';'); return { tool: 'calc-matrix', result: `determinant = ${fmt(evaluate(`det(${mx})`))}` }; }
      catch { /* ignore */ }
    }
  }
  // Scientific evaluation — only when the expression uses real math (functions,
  // constants, powers, factorial) so it doesn't grab plain prose.
  if (/\b(sqrt|sin|cos|tan|asin|acos|atan|log|exp|abs|round|floor|ceil|pi|e)\b|\d\s*!|\^|\bmod\b/i.test(text)) {
    const e = clean(text);
    if (e && /[\d)]/.test(e)) {
      try { const v = evaluate(e); if (typeof v === 'number' || typeof v === 'object') return { tool: 'calc-scientific', result: `${e} = ${fmt(v)}` }; }
      catch { /* not a valid expression */ }
    }
  }
  return null;
}

/** Cheap pre-test so AiApp only lazy-loads mathjs for plausible math requests. */
export const MATH_TRIGGER = /\b(derivative|differentiate|d\/dx|simplify|determinant|sqrt|sin|cos|tan|log|ln|exp|factorial|pi)\b|\^|\d\s*!/i;
