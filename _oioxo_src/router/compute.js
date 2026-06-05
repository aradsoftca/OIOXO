/**
 * Instant-answer compute extractor — for queries that deserve a direct
 * answer instead of a tool deep-link. Recognises:
 *
 *   - math:    5 + 3, sqrt(16), 2^10
 *   - unit:    5 miles in km, 100 kg to lb, 60 °F in c
 *   - currency: 100 usd to eur, $50 to gbp
 *   - date:    days until christmas, what day is 2027-01-01
 *
 * Returns an "instant answer" intent the card renderer treats specially
 * (huge result number, attribution line). The router puts these BEFORE
 * the catalog fuzzy stage so a user typing "5 miles in km" gets the
 * computed answer instead of a tool match.
 *
 * Exposes window.oioxoCompute = { try, computeMath, computeUnits,
 *                                  computeCurrency, computeDate }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoCompute) return;

  // --- math ----------------------------------------------------------------

  // Natural-language math preprocessor — "what is 5 plus 5", "five times
  // three", "ten divided by two", "what's 12 squared". Strips polite
  // prefixes + maps word operators to symbols + word digits to numbers.
  const WORD_NUM = { zero:'0', one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10', eleven:'11', twelve:'12' };
  function naturalMathPreprocess(s){
    let q = s.toLowerCase()
      // Strip polite/typo prefixes — accept "wat", "watt", "wut" as common
      // misspellings of "what".
      .replace(/^(?:w(?:hat|at|ut)(?:'s|\s+is|\s+are|s)?\s+|calculate\s+|how\s+much\s+(?:is\s+)?)/i, '')
      .replace(/\?+$/, '')
      .trim();
    for (const [w, n] of Object.entries(WORD_NUM)) q = q.replace(new RegExp('\\b' + w + '\\b', 'g'), n);
    // Percentage: "15% of 200" or "15 percent of 200" → (15*200/100)
    q = q.replace(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d+(?:\.\d+)?)/g, '($1*$2/100)');
    // Bare percentage at start: "15% of 200" already handled above
    // "square root of N" → sqrt(N). The "Math." prefix gets added later
    // in computeMath; don't double-prefix here.
    q = q.replace(/\bsquare\s+root\s+of\s+(\d+(?:\.\d+)?)/g, 'sqrt($1)');
    return q
      .replace(/\bplus\b/g, '+')
      .replace(/\bminus\b/g, '-')
      .replace(/\b(?:times|multiplied by)\b/g, '*')
      .replace(/\b(?:divided by|over)\b/g, '/')
      .replace(/\bmod(?:ulo)?\b/g, '%')
      .replace(/\bsquared\b/g, '**2')
      .replace(/\bcubed\b/g, '**3')
      .replace(/\bto the power of\b/g, '**');
  }

  function computeMath(q){
    const cleaned = naturalMathPreprocess(q)
      .replace(/×|✕|⨯/g, '*')
      .replace(/÷|∕/g, '/')
      .replace(/−|–|—/g, '-')
      .replace(/π/g, 'Math.PI')
      .replace(/\bsqrt\(/g, 'Math.sqrt(')
      .replace(/\b(sin|cos|tan|log|ln|exp|abs|floor|ceil|round|min|max)\(/g, 'Math.$1(')
      .replace(/\^/g, '**')
      .replace(/[,  ]/g, '');
    // Reject anything that doesn't look like pure arithmetic.
    if (!/^[\s\d+\-*/().%MathPIE,sqrtinlogexpabsfloorceilroundmnax]+$/i.test(cleaned)) return null;
    if (!/[+\-*/%^]|Math\.|sqrt|sin|cos|tan|log/i.test(cleaned)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict"; return (' + cleaned + ')')();
      if (typeof v !== 'number' || !isFinite(v)) return null;
      return {
        kind: 'compute-math',
        title: 'Math · ' + q.trim(),
        icon: '🧮',
        confidence: 0.95,
        inputType: 'none',
        expression: q.trim(),
        result: v,
        formatted: formatNumber(v),
      };
    } catch { return null; }
  }

  function formatNumber(v){
    if (Math.abs(v) >= 1e9 || (Math.abs(v) > 0 && Math.abs(v) < 0.001)) return v.toExponential(4);
    return Number(v.toFixed(8)).toString().replace(/\.?0+$/, '');
  }

  // --- units --------------------------------------------------------------

  async function computeUnits(q){
    const eng = window.oioxoEngines && window.oioxoEngines.units;
    if (!eng || typeof eng.parse !== 'function') return null;
    const parsed = eng.parse(q);
    if (!parsed) return null;
    const v = eng.convert(parsed.value, parsed.from, parsed.to);
    if (v === null || v === undefined || !isFinite(v)) return null;
    return {
      kind: 'compute-units',
      title: parsed.from + ' → ' + parsed.to,
      icon: '↔',
      confidence: 0.98,
      inputType: 'none',
      from: parsed.from,
      to: parsed.to,
      input: parsed.value,
      result: v,
      formatted: eng.format(v),
    };
  }

  // --- currency -----------------------------------------------------------

  async function computeCurrency(q){
    const skill = window.oioxoSkills && window.oioxoSkills.currency;
    if (!skill || typeof skill.convert !== 'function') return null;
    const m = q.trim().toLowerCase().replace(/,/g, '').match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-z$€£¥]{1,4})\s+(?:to|in|=|->)\s+([a-z$€£¥]{1,4})\??$/i);
    if (!m) return null;
    const amount = parseFloat(m[1]);
    if (!isFinite(amount) || amount <= 0) return null;
    let res;
    try { res = await skill.convert(amount, m[2], m[3]); } catch { return null; }
    if (!res) return null;
    return {
      kind: 'compute-currency',
      title: '💱 ' + res.from + ' → ' + res.to,
      icon: '💱',
      confidence: 0.98,
      inputType: 'none',
      input: amount,
      from: res.from,
      to: res.to,
      result: res.result,
      rate: res.rate,
      date: res.date,
    };
  }

  // --- date math ----------------------------------------------------------

  function computeDate(q){
    const eng = window.oioxoEngines && window.oioxoEngines.datemath;
    if (!eng) return null;
    const text = q.trim().toLowerCase();
    let m = text.match(/^(?:how\s+many\s+)?days?\s+(?:until|till|to)\s+(.+?)\??$/);
    if (m){
      const diff = eng.daysUntil(m[1]);
      if (diff == null) return null;
      const d = eng.parseDate(m[1]);
      return { kind:'compute-date', icon:'📅', title:'Days until ' + m[1],
        confidence:0.95, inputType:'none', result: diff, target: m[1],
        formatted: Math.abs(diff) + ' day' + (Math.abs(diff)===1?'':'s'),
        date: d ? eng.formatDate(d) : null };
    }
    m = text.match(/^what\s+day(?:\s+of\s+the\s+week)?\s+is\s+(.+?)\??$/);
    if (m){
      const wk = eng.weekdayOf(m[1]);
      if (!wk) return null;
      return { kind:'compute-date', icon:'📅', title:'Weekday',
        confidence:0.95, inputType:'none', formatted: wk, target: m[1] };
    }
    return null;
  }

  // --- top-level "try compute" --------------------------------------------

  /** Try every compute extractor in order; return the first that succeeds.
   *  Async because currency conversion may need a network rate fetch (the
   *  skill is itself memoized so subsequent calls are sync-fast). */
  async function tryCompute(q, _catalog){
    if (!q || q.length < 2 || q.length > 100) return null;
    // Currency runs first (most specific pattern + clearest UX).
    const c = await computeCurrency(q);
    if (c) return c;
    // Units next.
    const u = await computeUnits(q);
    if (u) return u;
    // Math last among the conversion-shaped ones.
    const m = computeMath(q);
    if (m) return m;
    // Date math.
    const d = computeDate(q);
    if (d) return d;
    return null;
  }

  window.oioxoCompute = { try: tryCompute, computeMath, computeUnits, computeCurrency, computeDate, formatNumber };
})();
