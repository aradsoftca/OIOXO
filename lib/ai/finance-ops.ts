/**
 * Xonvert AI — inline finance calculators.
 *
 * Pure money formulas: mortgage/loan monthly payment, future value of regular
 * savings (annuity), and lump-sum investment growth (compound). Currency
 * (needs live rates) and tax (jurisdiction-specific) correctly stay hand-off.
 * Pattern-matched like the calculators. Pure / DOM-free, Node-testable.
 */

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;
const amt = (m: string) => { const x = m.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)/); return x ? num(x[1]) : null; };
const rate = (m: string) => { const x = m.match(/(\d+(?:\.\d+)?)\s*%/); return x ? num(x[1]) : null; };
const years = (m: string) => { const x = m.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i); return x ? num(x[1]) : null; };

export const FINANCE_IDS = ['finance-mortgage', 'finance-savings', 'finance-investment'];
export function isFinanceOp(id: string): boolean { return FINANCE_IDS.includes(id); }

export function tryFinance(text: string): { tool: string; result: string } | null {
  const lc = text.toLowerCase();
  const r = rate(text), y = years(text);

  if (/\bmortgage\b/.test(lc)) {
    const P = amt(text); if (P == null || r == null || y == null) return null;
    const mr = r / 100 / 12, n = y * 12;
    const M = mr === 0 ? P / n : (P * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
    return { tool: 'finance-mortgage', result: `Monthly payment ${round2(M)} · ${P} mortgage at ${r}% over ${y} years` };
  }
  if (/\b(savings?|save)\b/.test(lc) && /month/.test(lc)) {
    const PMT = amt(text); if (PMT == null || r == null || y == null) return null;
    const mr = r / 100 / 12, n = y * 12;
    const FV = mr === 0 ? PMT * n : PMT * ((Math.pow(1 + mr, n) - 1) / mr);
    return { tool: 'finance-savings', result: `Future value ${round2(FV)} · saving ${PMT}/month at ${r}% for ${y} years` };
  }
  if (/\binvest(?:ment|ing)?\b/.test(lc)) {
    const P = amt(text); if (P == null || r == null || y == null) return null;
    const FV = P * Math.pow(1 + r / 100, y);
    return { tool: 'finance-investment', result: `Future value ${round2(FV)} · ${P} invested at ${r}% for ${y} years` };
  }
  return null;
}
