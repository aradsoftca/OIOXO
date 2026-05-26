/**
 * compute — deterministic math, answered on-device, NEVER web-searched.
 *
 * The battery showed "what is 15 percent of 240" and "train 60km in 45min →
 * speed" were sent to web search (→ news headlines) instead of being computed.
 * Math is a place a tiny system should be PERFECT: parse + arithmetic. This is
 * the general compute fast-path; it returns null for anything it can't compute
 * exactly (so normal questions fall through untouched).
 */

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const tidy = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));

// ── UNIT CONVERSION — deterministic, never web-searched ("5 km to miles", "100 f
// to c", "how many ml in a cup"). Factor = how many BASE units one of this unit is
// (length→m, mass→g, volume→ml). Unknown units → null, so prose falls through. ──
type Dim = 'length' | 'mass' | 'volume' | 'time';
const U: Record<string, [Dim, number]> = {};
const addU = (dim: Dim, f: number, ...names: string[]) => names.forEach((n) => (U[n] = [dim, f]));
addU('length', 0.001, 'mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres');
addU('length', 0.01, 'cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres');
addU('length', 1, 'm', 'meter', 'meters', 'metre', 'metres');
addU('length', 1000, 'km', 'kilometer', 'kilometers', 'kilometre', 'kilometres');
addU('length', 0.0254, 'in', 'inch', 'inches');
addU('length', 0.3048, 'ft', 'foot', 'feet');
addU('length', 0.9144, 'yd', 'yard', 'yards');
addU('length', 1609.344, 'mi', 'mile', 'miles');
addU('mass', 0.001, 'mg', 'milligram', 'milligrams');
addU('mass', 1, 'g', 'gram', 'grams');
addU('mass', 1000, 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos');
addU('mass', 28.3495, 'oz', 'ounce', 'ounces');
addU('mass', 453.592, 'lb', 'lbs', 'pound', 'pounds');
addU('mass', 1e6, 't', 'ton', 'tons', 'tonne', 'tonnes');
addU('mass', 6350.29, 'st', 'stone', 'stones');
addU('volume', 1, 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres');
addU('volume', 1000, 'l', 'liter', 'liters', 'litre', 'litres');
addU('volume', 236.588, 'cup', 'cups');
addU('volume', 14.7868, 'tbsp', 'tablespoon', 'tablespoons');
addU('volume', 4.92892, 'tsp', 'teaspoon', 'teaspoons');
addU('volume', 29.5735, 'floz', 'fluid ounce', 'fluid ounces');
addU('volume', 473.176, 'pint', 'pints', 'pt');
addU('volume', 946.353, 'quart', 'quarts', 'qt');
addU('volume', 3785.41, 'gallon', 'gallons', 'gal');
addU('time', 1, 'second', 'seconds', 'sec', 'secs');
addU('time', 60, 'minute', 'minutes', 'min', 'mins');
addU('time', 3600, 'hour', 'hours', 'hr', 'hrs');
addU('time', 86400, 'day', 'days');
addU('time', 604800, 'week', 'weeks');
addU('time', 31536000, 'year', 'years', 'yr', 'yrs');
const TEMP: Record<string, string> = {
  f: 'F', fahrenheit: 'F', c: 'C', celsius: 'C', centigrade: 'C', k: 'K', kelvin: 'K',
};
const toC = (v: number, u: string) => (u === 'F' ? ((v - 32) * 5) / 9 : u === 'K' ? v - 273.15 : v);
const fromC = (v: number, u: string) => (u === 'F' ? (v * 9) / 5 + 32 : u === 'K' ? v + 273.15 : v);
const cleanUnit = (s: string) => s.trim().replace(/[.?!]+$/, '').replace(/\s+/g, ' ');

function convert(value: number, from: string, to: string): string | null {
  const a = TEMP[from], b = TEMP[to];
  if (a && b) {
    const c = toC(value, a);
    const out = fromC(c, b);
    return `${tidy(value)}°${a} = **${tidy(out)}°${b}**.`;
  }
  const fu = U[from], tu = U[to];
  if (fu && tu && fu[0] === tu[0]) {
    return `${tidy(value)} ${from} = **${tidy((value * fu[1]) / tu[1])} ${to}**.`;
  }
  return null;
}

// ── CALENDARS — convert today (or a given date) into any regional calendar, all
// from built-in Intl (no library, offline). "today's date in the persian calendar",
// "convert 2024-01-01 to hijri", "what year is it in the hebrew calendar". ──
const CALS: Record<string, string> = {
  persian: 'persian', jalali: 'persian', iranian: 'persian', shamsi: 'persian', 'solar hijri': 'persian',
  islamic: 'islamic', hijri: 'islamic', muslim: 'islamic', arabic: 'islamic',
  hebrew: 'hebrew', jewish: 'hebrew',
  chinese: 'chinese', buddhist: 'buddhist', thai: 'buddhist',
  japanese: 'japanese', indian: 'indian', hindu: 'indian', saka: 'indian',
  coptic: 'coptic', ethiopian: 'ethiopic', gregorian: 'gregory', western: 'gregory',
};
function tryCalendar(text: string): string | null {
  const t = text.toLowerCase();
  // content questions that merely mention a culture are NOT calendar conversions
  if (/\b(new year|holiday|festival|food|history|zodiac|horoscope|sign|recipe|war|culture)\b/.test(t)) return null;
  if (!/\bcalendar\b/.test(t) && !/\bconvert\b/.test(t) && !/\b(date|today)\b/.test(t)) return null;
  let cal: string | null = null, name = '';
  for (const k of Object.keys(CALS)) if (new RegExp(`\\b${k}\\b`).test(t)) { cal = CALS[k]; name = k; break; }
  if (!cal) return null;
  let d: Date | null = null;
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) d = new Date(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}T12:00:00`);
  else {
    const md = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i)
      || text.match(/\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i);
    if (md) { const p = Date.parse(md[0]); if (!isNaN(p)) d = new Date(p); }
  }
  const when = d ?? new Date();
  try {
    const out = new Intl.DateTimeFormat('en-u-ca-' + cal, { dateStyle: 'long' }).format(when);
    const label = name[0].toUpperCase() + name.slice(1);
    return d ? `That date in the ${label} calendar is **${out}**.` : `Today in the ${label} calendar is **${out}**.`;
  } catch {
    return null;
  }
}

function tryUnitConvert(t: string): string | null {
  // "N U1 to/in/into U2" / "convert N U1 to U2" / "N U1 = U2"
  let m = t.match(/(-?\d+(?:\.\d+)?)\s*([a-z][a-z ]*?)\s+(?:to|in|into|=)\s+([a-z][a-z ]*?)\s*[.?!]?$/);
  if (m) {
    const r = convert(num(m[1]), cleanUnit(m[2]), cleanUnit(m[3]));
    if (r) return r;
  }
  // "how many U2 (are) in/per (a/one) U1" → convert one U1 into U2
  m = t.match(/how many\s+([a-z][a-z ]*?)\s+(?:are\s+)?(?:in|per)\s+(?:a |an |one |1 )?([a-z][a-z ]*?)\s*[.?!]?$/);
  if (m) {
    const r = convert(1, cleanUnit(m[2]), cleanUnit(m[1]));
    if (r) return r;
  }
  return null;
}

export function tryCompute(text: string): string | null {
  const t = text.toLowerCase().trim();

  // percent OF:  "15 percent of 240", "15% of 240"
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s+of\s+(\d[\d,]*(?:\.\d+)?)/);
  if (m) return `${m[1]}% of ${m[2]} = **${tidy((num(m[1]) / 100) * num(m[2]))}**.`;

  // X is what percent of Y:  "what percent of 200 is 30"
  m = t.match(/what\s+percent\s+of\s+(\d[\d,]*(?:\.\d+)?)\s+is\s+(\d[\d,]*(?:\.\d+)?)/);
  if (m) return `${m[2]} is **${tidy((num(m[2]) / num(m[1])) * 100)}%** of ${m[1]}.`;

  // percent OFF (discount):  "20% off of 80", "15 percent off 200"
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s*off\s*(?:of\s*)?(\d[\d,]*(?:\.\d+)?)/);
  if (m) {
    const p = num(m[1]), base = num(m[2]);
    return `${m[1]}% off ${m[2]} = **${tidy(base * (1 - p / 100))}** (you save ${tidy((base * p) / 100)}).`;
  }

  // unit rate → speed:  distance + time + "speed"
  const dist = t.match(/(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|miles?|mi|m)\b/);
  const mins = t.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?)\b/);
  const hrs = t.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
  if (/\b(speed|km\/?h|mph|how fast)\b/.test(t) && dist && (mins || hrs)) {
    const d = num(dist[1]);
    const h = hrs ? num(hrs[1]) : num(mins![1]) / 60;
    const unit = /mile|mph|\bmi\b/.test(dist[2]) ? 'mph' : 'km/h';
    return `Average speed = distance ÷ time = ${d} ÷ ${tidy(h)} h = **${tidy(d / h)} ${unit}**.`;
  }

  // bare arithmetic expression:  "(3+4)*2", "12 * 8", "100 / 4 + 2"
  const expr = text.match(/^[\s\d.+\-*/()%^×÷]+$/);
  if (expr && /[+\-*/^×÷]/.test(expr[0]) && /\d/.test(expr[0])) {
    const safe = expr[0].replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict";return(${safe})`)();
      if (typeof v === 'number' && isFinite(v)) return `= **${tidy(v)}**`;
    } catch { /* not a valid expression */ }
  }

  // natural-language arithmetic:  "what is 2+2", "100 divided by 7", "5 times 8"
  const expr2 = t
    .replace(/^(?:what(?:'?s| is)|whats|calculate|compute|how much is|what does|solve)\s+/, '')
    .replace(/\bdivided by\b|\bover\b/g, '/')
    .replace(/\b(?:multiplied by|times)\b/g, '*')
    .replace(/(\d)\s*x\s*(\d)/g, '$1*$2')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\bto the power of\b/g, '**')
    .replace(/\bsquared\b/g, '**2')
    .replace(/\bcubed\b/g, '**3')
    .replace(/\bmod(?:ulo)?\b/g, '%')
    .replace(/[?=]/g, '')
    .trim();
  if (/^[\s\d.+\-*/()%×÷]+$/.test(expr2.replace(/\*\*/g, '')) && /[+\-*/×÷]/.test(expr2) && /\d/.test(expr2)) {
    const safe = expr2.replace(/×/g, '*').replace(/÷/g, '/');
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict";return(${safe})`)();
      if (typeof v === 'number' && isFinite(v)) return `= **${tidy(v)}**`;
    } catch { /* not valid */ }
  }

  // count a range:  "count from 1 to 5", "count 1 to 10"
  m = t.match(/count\s+(?:from\s+)?(\d+)\s+(?:to|through|up to|until)\s+(\d+)/);
  if (m) {
    let a = +m[1]; const b = +m[2];
    if (Math.abs(b - a) <= 200) {
      const step = a <= b ? 1 : -1, out: number[] = [];
      for (; step > 0 ? a <= b : a >= b; a += step) out.push(a);
      return out.join(', ');
    }
  }

  // square root:  "square root of 144", "sqrt(144)", "√144"
  m = t.match(/(?:square root|sqrt|√)\s*(?:of\s+)?\(?(\d+(?:\.\d+)?)\)?/);
  if (m) return `√${m[1]} = **${tidy(Math.sqrt(num(m[1])))}**.`;

  // is N prime:  "is 7 a prime number", "is 12 prime"
  m = t.match(/\bis\s+(\d{1,9})\s+(?:a\s+)?prime\b/);
  if (m) {
    const n = +m[1];
    const prime = n >= 2 && !(() => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return true; return false; })();
    return `**${n}** is ${prime ? 'a prime number' : 'not a prime number'}.`;
  }

  // bigger/smaller of two numbers:  "whats bigger 0.9 or 0.11", "is 5 bigger than 3"
  if (/\b(bigger|larger|greater|smaller|lesser|less|lower|higher)\b/.test(t) && /\b(or|than|vs)\b/.test(t)) {
    const nums = t.match(/-?\d+(?:\.\d+)?/g);
    if (nums && nums.length === 2) {
      const a = num(nums[0]), b = num(nums[1]);
      if (a === b) return `${nums[0]} and ${nums[1]} are equal.`;
      const small = /\b(smaller|lesser|less|lower)\b/.test(t);
      return `**${tidy(small ? Math.min(a, b) : Math.max(a, b))}** is the ${small ? 'smaller' : 'bigger'} of the two.`;
    }
  }

  // reverse a word:  "reverse the word hello", "reverse hello"
  m = text.match(/^\s*reverse(?:\s+the\s+(?:word|string|text))?\s+["']?([a-z]{1,30})["']?\s*[?.!]*$/i);
  if (m) return `"${m[1]}" reversed is **${m[1].split('').reverse().join('')}**.`;

  // letter count:  "how many letters in mississippi"
  m = t.match(/how many (?:letters|characters|chars)\s+(?:are\s+)?(?:in|does)\s+(?:the word\s+)?["']?([a-z]{1,30})["']?/);
  if (m) return `**${m[1]}** has **${m[1].length}** letters.`;

  // day of week:  "what day comes after friday", "day before monday"
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  m = t.match(/day\s+(?:comes\s+|is\s+)?(after|before|following|preceding)\s+(\w+)/);
  if (m) {
    const i = DAYS.indexOf(m[2]);
    if (i >= 0) {
      const back = /before|preceding/.test(m[1]);
      const d = DAYS[(i + (back ? 6 : 1)) % 7];
      const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
      return `The day ${back ? 'before' : 'after'} ${cap(m[2])} is **${cap(d)}**.`;
    }
  }

  // age from birth year:  "how old is someone born in 1990"
  m = t.match(/how old\b[^]*?\bborn in\s+(\d{4})\b/);
  if (m) {
    const yr = +m[1], now = new Date().getFullYear();
    if (yr >= 1000 && yr <= now) return `Someone born in ${yr} is **${now - yr}** (or about to turn ${now - yr}) this year.`;
  }

  // calendar: "today's date in the persian calendar", "convert 2024-01-01 to hijri"
  const cal = tryCalendar(text);
  if (cal) return cal;

  // unit / measure conversion: "5 km to miles", "100 f to c", "how many ml in a cup"
  const conv = tryUnitConvert(t);
  if (conv) return conv;

  // spelling: "how do you spell restaurant", "spell necessary" → spell it out.
  let sp = text.match(/^\s*(?:how (?:do you|to) spell|spell)\s+["']?([a-z][a-z'-]{1,20})["']?\s*[?.!]*$/i)
        || text.match(/^\s*how is\s+["']?([a-z][a-z'-]{1,20})["']?\s+spell?ed\s*[?.!]*$/i);
  if (sp) {
    const w = sp[1];
    return `**${w}** is spelled ${w.toUpperCase().split('').join('-')}.`;
  }

  return null;
}
