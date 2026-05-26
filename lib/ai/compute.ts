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
type Dim = 'length' | 'mass' | 'volume';
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
