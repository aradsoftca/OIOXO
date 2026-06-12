// ── Fill-series intelligence ────────────────────────────────────────────────
// Given the source cells (raw strings) the user selected before grabbing the
// fill handle, produce `count` extrapolated values. Mirrors the Google Sheets
// autofill: numeric step (1,2,3 / 10,20,30), date step, weekday/month names,
// "Item 1, Item 2" suffix counting, otherwise copy/cycle.
//
// Extracted from office-studio so it can be unit-tested in isolation (the fill
// HANDLE drag is a React pointer-capture gesture that a synthetic-event test
// harness can't reliably drive — but the series MATH is pure and must be
// provably correct, since a wrong autofill silently corrupts a user's data).

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function _nameSeries(raw: string, names: string[]): { idx: number; cap: boolean; abbr: boolean } | null {
  const t = raw.trim();
  const low = t.toLowerCase();
  for (const n of names) {
    if (low === n) return { idx: names.indexOf(n), cap: t[0] === t[0]?.toUpperCase(), abbr: false };
    if (low === n.slice(0, 3)) return { idx: names.indexOf(n), cap: t[0] === t[0]?.toUpperCase(), abbr: true };
  }
  return null;
}
function _emitName(idx: number, names: string[], cap: boolean, abbr: boolean): string {
  let n = names[((idx % names.length) + names.length) % names.length];
  if (abbr) n = n.slice(0, 3);
  return cap ? n[0].toUpperCase() + n.slice(1) : n;
}
function _fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1e10) / 1e10);
}

export function detectFillSeries(source: string[], count: number, reverse = false): string[] {
  const out: string[] = [];
  const dir = reverse ? -1 : 1;
  const nonEmpty = source.filter(s => s.trim() !== '');
  if (nonEmpty.length === 0) return new Array(count).fill('');

  // Pure numbers → arithmetic step (default +1, or inferred from last two)
  const nums = source.map(s => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? parseFloat(s.trim()) : NaN));
  if (nums.every(n => !isNaN(n)) && source.every(s => s.trim() !== '')) {
    const step = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 1;
    let v = reverse ? nums[0] : nums[nums.length - 1];
    for (let i = 0; i < count; i++) { v += step * dir; out.push(_fmtNum(v)); }
    return out;
  }

  // Month / weekday names
  const lastRaw = reverse ? source.find(s => s.trim() !== '')! : [...source].reverse().find(s => s.trim() !== '')!;
  for (const names of [MONTHS, DAYS]) {
    const m = _nameSeries(lastRaw, names);
    if (m) {
      let idx = m.idx;
      for (let i = 0; i < count; i++) { idx += dir; out.push(_emitName(idx, names, m.cap, m.abbr)); }
      return out;
    }
  }

  // Dates (ISO/parseable) → +1 day step. Checked BEFORE the prefix-number
  // branch so "2024-01-30" extends as a date, not by bumping "30".
  const isDateLike = (s: string) => /^\d{4}-\d{1,2}-\d{1,2}/.test(s.trim()) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s.trim());
  if (source.every(s => s.trim() !== '' && isDateLike(s))) {
    const dParsed = source.map(s => Date.parse(s.trim()));
    if (dParsed.every(d => !isNaN(d))) {
      const DAYMS = 86400000;
      const stepDays = dParsed.length >= 2 ? Math.round((dParsed[dParsed.length - 1] - dParsed[dParsed.length - 2]) / DAYMS) || 1 : 1;
      let t = reverse ? dParsed[0] : dParsed[dParsed.length - 1];
      for (let i = 0; i < count; i++) { t += stepDays * DAYMS * dir; out.push(new Date(t).toISOString().slice(0, 10)); }
      return out;
    }
  }

  // "Prefix <n>" suffix counting (Item 1, Item 2 / Q1, Q2)
  const sm = /^(.*?)(-?\d+)(\D*)$/.exec(lastRaw.trim());
  if (sm) {
    const prefix = sm[1], suffix = sm[3];
    let n = parseInt(sm[2], 10);
    // step from two trailing numeric tails if available
    let step = 1;
    const tails = source.filter(s => s.trim() !== '').map(s => { const mm = /^(.*?)(-?\d+)(\D*)$/.exec(s.trim()); return mm ? parseInt(mm[2], 10) : NaN; }).filter(x => !isNaN(x));
    if (tails.length >= 2) step = tails[tails.length - 1] - tails[tails.length - 2] || 1;
    for (let i = 0; i < count; i++) { n += step * dir; out.push(`${prefix}${n}${suffix}`); }
    return out;
  }

  // Fallback: cycle/copy the source pattern
  for (let i = 0; i < count; i++) out.push(source[i % source.length] ?? source[source.length - 1] ?? '');
  return out;
}
