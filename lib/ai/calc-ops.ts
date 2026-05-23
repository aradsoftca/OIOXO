/**
 * Xonvert AI — inline calculators.
 *
 * The calc category is pure math, so the AI should answer "15% of 80" or "100F
 * in C" directly instead of opening a page (and crucially, instead of letting
 * the language model do arithmetic, which it does badly). Each calc parses its
 * own numbers from the message and returns an answer string, or null if the
 * message isn't that kind of question. `tryCalc` runs them in order.
 *
 * Pure / DOM-free and fully Node-testable.
 */

export interface CalcOp {
  verb: string;
  /** The answer, or null if this calculator doesn't apply to the message. */
  run: (message: string) => string | null;
}

const num = (s: string) => parseFloat(s);
const round = (n: number, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };

function parseDate(s: string): Date | null {
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(+d) ? null : d; }
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) { const d = new Date(+m[3], +m[1] - 1, +m[2]); return isNaN(+d) ? null : d; }
  m = s.match(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i);
  if (m) { const d = new Date(m[0]); return isNaN(+d) ? null : d; }
  return null;
}
function findIsoDates(s: string): { dates: Date[]; strs: string[] } {
  const ms = [...s.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)];
  return { dates: ms.map((m) => new Date(+m[1], +m[2] - 1, +m[3])), strs: ms.map((m) => m[0]) };
}

export const CALC_OPS: Record<string, CalcOp> = {
  'calc-percent': {
    verb: 'work out the percentage',
    run: (msg) => {
      let m = msg.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|on)\s*(\d+(?:\.\d+)?)/i);
      if (m) { const v = (num(m[1]) / 100) * num(m[2]); return `${m[1]}% of ${m[2]} = ${round(v)}`; }
      // "what percent is X of Y"
      m = msg.match(/(\d+(?:\.\d+)?)\s*(?:is what|out of|of)\s*(\d+(?:\.\d+)?)/i);
      if (m && /percent|%/i.test(msg)) { const v = (num(m[1]) / num(m[2])) * 100; return `${m[1]} is ${round(v)}% of ${m[2]}`; }
      return null;
    },
  },
  'calc-tip': {
    verb: 'calculate the tip',
    run: (msg) => {
      if (!/\btip\b|gratuity/i.test(msg)) return null;
      const amt = msg.match(/\$?\s*(\d+(?:\.\d+)?)/);
      if (!amt) return null;
      const pctM = msg.match(/(\d+(?:\.\d+)?)\s*%/);
      // The amount is the first number that isn't the percentage.
      const nums = [...msg.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => num(x[1]));
      const pct = pctM ? num(pctM[1]) : 15;
      const bill = nums.find((n) => n !== pct) ?? num(amt[1]);
      const tip = (bill * pct) / 100;
      return `Tip ${round(tip)} (${pct}%) · Total ${round(bill + tip)} on a ${round(bill)} bill`;
    },
  },
  'calc-temp': {
    verb: 'convert the temperature',
    run: (msg) => {
      const hasCtx = /celsius|fahrenheit|°|temperature|degrees?/i.test(msg) || /\b\d+(?:\.\d+)?\s*[cf]\b.*\b(to|in)\b/i.test(msg);
      if (!hasCtx) return null;
      const m = msg.match(/(-?\d+(?:\.\d+)?)\s*°?\s*(celsius|fahrenheit|c|f)\b/i);
      if (!m) return null;
      const v = num(m[1]);
      const isF = /^f/i.test(m[2]);
      if (isF) return `${v}°F = ${round((v - 32) * 5 / 9, 1)}°C`;
      return `${v}°C = ${round(v * 9 / 5 + 32, 1)}°F`;
    },
  },
  'calc-bmi': {
    verb: 'calculate the BMI',
    run: (msg) => {
      if (!/\bbmi\b|body mass/i.test(msg)) return null;
      const w = msg.match(/(\d+(?:\.\d+)?)\s*kg/i);
      const hM = msg.match(/(\d+(?:\.\d+)?)\s*(m|cm|meters?|centimet)/i);
      if (!w || !hM) return null;
      const kg = num(w[1]);
      let h = num(hM[1]);
      if (/^c/i.test(hM[2]) || h > 3) h /= 100; // cm → m (or a bare "175")
      const bmi = kg / (h * h);
      const cat = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese';
      return `BMI ${round(bmi, 1)} — ${cat}`;
    },
  },
  'calc-power': {
    verb: 'work out the power',
    run: (msg) => {
      let m = msg.match(/(\d+(?:\.\d+)?)\s*(?:\^|\*\*|to the power(?:\s+of)?|to the)\s*(\d+(?:\.\d+)?)/i);
      if (m) return `${m[1]}^${m[2]} = ${round(Math.pow(num(m[1]), num(m[2])), 4)}`;
      m = msg.match(/(\d+(?:\.\d+)?)\s*(squared|cubed)/i);
      if (m) { const e = /squared/i.test(m[2]) ? 2 : 3; return `${m[1]}^${e} = ${round(Math.pow(num(m[1]), e), 4)}`; }
      return null;
    },
  },
  'calc-binary': {
    verb: 'convert binary',
    run: (msg) => {
      if (!/\bbinary\b|0b[01]+/i.test(msg)) return null;
      if (/to (?:decimal|base ?10)|in decimal|0b[01]+/i.test(msg)) {
        const m = msg.match(/0b([01]+)|\b([01]{2,})\b/);
        const bits = m ? (m[1] ?? m[2]) : null;
        if (bits) return `binary ${bits} = ${parseInt(bits, 2)} in decimal`;
      }
      const m = msg.match(/(\d+)/);
      if (m) return `${m[1]} in binary = ${(parseInt(m[1], 10) >>> 0).toString(2)}`;
      return null;
    },
  },
  'calc-hex': {
    verb: 'convert hex',
    run: (msg) => {
      if (!/\bhex(?:adecimal)?\b|0x[0-9a-f]+/i.test(msg)) return null;
      if (/to (?:decimal|base ?10)|in decimal|0x[0-9a-f]+/i.test(msg)) {
        const m = msg.match(/0x([0-9a-f]+)|\b([0-9a-f]*[a-f][0-9a-f]*)\b/i);
        const hx = m ? (m[1] ?? m[2]) : null;
        if (hx) return `hex ${hx} = ${parseInt(hx, 16)} in decimal`;
      }
      const m = msg.match(/(\d+)/);
      if (m) return `${m[1]} in hex = ${parseInt(m[1], 10).toString(16)}`;
      return null;
    },
  },
  'calc-loan': {
    verb: 'work out the loan payment',
    run: (msg) => {
      if (!/\bloan\b|borrow/i.test(msg)) return null;
      const amt = msg.match(/\$?\s*(\d{3,}(?:\.\d+)?)/);
      const rate = msg.match(/(\d+(?:\.\d+)?)\s*%/);
      const yrs = msg.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
      if (!amt || !rate || !yrs) return null;
      const P = num(amt[1]), r = num(rate[1]) / 100 / 12, n = num(yrs[1]) * 12;
      const M = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      return `Monthly payment ${round(M)} · ${P} at ${rate[1]}% over ${yrs[1]} years`;
    },
  },
  'calc-age': {
    verb: 'work out the age',
    run: (msg) => {
      if (!/\bage\b|how old|born|birth/i.test(msg)) return null;
      const d = parseDate(msg);
      if (!d) return null;
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const mo = now.getMonth() - d.getMonth();
      if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) age--;
      if (age < 0 || age > 150) return null;
      return `Age: ${age} years`;
    },
  },
  'calc-date': {
    verb: 'work out the date difference',
    run: (msg) => {
      if (!/\bdays?\b|weeks?|between|until|since|till/i.test(msg)) return null;
      const { dates, strs } = findIsoDates(msg);
      if (dates.length >= 2) return `${Math.round(Math.abs(+dates[1] - +dates[0]) / 86400000)} days between ${strs[0]} and ${strs[1]}`;
      if (dates.length === 1 && /until|since|till|from now/i.test(msg)) {
        const diff = Math.round((+dates[0] - Date.now()) / 86400000);
        return diff >= 0 ? `${diff} days until ${strs[0]}` : `${-diff} days since ${strs[0]}`;
      }
      return null;
    },
  },
};

export function calcOpFor(id: string): CalcOp | undefined {
  return CALC_OPS[id];
}

/** First calculator that applies to the message, with its tool id + answer. */
export function tryCalc(message: string): { tool: string; result: string } | null {
  for (const [tool, op] of Object.entries(CALC_OPS)) {
    const result = op.run(message);
    if (result) return { tool, result };
  }
  return null;
}
