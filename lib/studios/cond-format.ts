export type CondRule =
  | { kind: 'gt'; threshold: number; bg: string; color?: string }
  | { kind: 'lt'; threshold: number; bg: string; color?: string }
  | { kind: 'between'; min: number; max: number; bg: string; color?: string }
  | { kind: 'eq'; value: string | number; bg: string; color?: string }
  | { kind: 'contains'; text: string; bg: string; color?: string }
  | { kind: 'data-bar'; color: string; min?: number; max?: number }
  | { kind: 'color-scale'; colorMin: string; colorMax: string; colorMid?: string; min?: number; max?: number }
  | { kind: 'top'; n: number; bg: string; color?: string; reverse?: boolean }
  | { kind: 'icon-set'; thresholds: number[]; icons: string[] }
  | { kind: 'duplicates'; bg: string; color?: string };

export interface CondFormatRange {
  r0: number; c0: number; r1: number; c1: number;
  rules: CondRule[];
}

function num(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[,$%\s]/g, '')); return isNaN(n) ? NaN : n; }
  return NaN;
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return '#' + [r, g, bl].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function parseHex(s: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})/i.exec(s);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function evalCondFormat(value: any, range: CondFormatRange, allValuesInRange: any[]): { bg?: string; color?: string; bar?: { pct: number; color: string }; icon?: string } {
  for (const rule of range.rules) {
    const n = num(value);
    switch (rule.kind) {
      case 'gt':       if (!isNaN(n) && n > rule.threshold) return { bg: rule.bg, color: rule.color }; break;
      case 'lt':       if (!isNaN(n) && n < rule.threshold) return { bg: rule.bg, color: rule.color }; break;
      case 'between':  if (!isNaN(n) && n >= rule.min && n <= rule.max) return { bg: rule.bg, color: rule.color }; break;
      case 'eq':       if (String(value) === String(rule.value) || n === num(rule.value)) return { bg: rule.bg, color: rule.color }; break;
      case 'contains': if (String(value).toLowerCase().includes(String(rule.text).toLowerCase())) return { bg: rule.bg, color: rule.color }; break;
      case 'data-bar': {
        const nums = allValuesInRange.map(num).filter(v => !isNaN(v));
        if (!nums.length || isNaN(n)) break;
        const mn = rule.min ?? Math.min(...nums, 0);
        const mx = rule.max ?? Math.max(...nums);
        const pct = mx === mn ? 0 : Math.max(0, Math.min(1, (n - mn) / (mx - mn)));
        return { bar: { pct, color: rule.color } };
      }
      case 'color-scale': {
        const nums = allValuesInRange.map(num).filter(v => !isNaN(v));
        if (!nums.length || isNaN(n)) break;
        const mn = rule.min ?? Math.min(...nums);
        const mx = rule.max ?? Math.max(...nums);
        const pct = mx === mn ? 0.5 : Math.max(0, Math.min(1, (n - mn) / (mx - mn)));
        let bg: string;
        if (rule.colorMid) {
          if (pct < 0.5) bg = hexLerp(rule.colorMin, rule.colorMid, pct * 2);
          else bg = hexLerp(rule.colorMid, rule.colorMax, (pct - 0.5) * 2);
        } else {
          bg = hexLerp(rule.colorMin, rule.colorMax, pct);
        }
        return { bg };
      }
      case 'top': {
        const nums = allValuesInRange.map(num).filter(v => !isNaN(v));
        const sorted = [...nums].sort((a, b) => rule.reverse ? a - b : b - a);
        const cutoff = sorted[Math.min(rule.n - 1, sorted.length - 1)];
        if (cutoff != null && !isNaN(n) && (rule.reverse ? n <= cutoff : n >= cutoff)) return { bg: rule.bg, color: rule.color };
        break;
      }
      case 'icon-set': {
        if (isNaN(n)) break;
        for (let i = rule.thresholds.length - 1; i >= 0; i--) {
          if (n >= rule.thresholds[i]) return { icon: rule.icons[i + 1] ?? rule.icons[rule.icons.length - 1] };
        }
        return { icon: rule.icons[0] };
      }
      case 'duplicates': {
        const count = allValuesInRange.filter(v => String(v) === String(value)).length;
        if (count > 1) return { bg: rule.bg, color: rule.color };
        break;
      }
    }
  }
  return {};
}

export const PRESET_RULES: { name: string; rules: CondRule[] }[] = [
  { name: 'Greater than 0 → green', rules: [{ kind: 'gt', threshold: 0, bg: '#dcfce7', color: '#14532d' }] },
  { name: 'Less than 0 → red',      rules: [{ kind: 'lt', threshold: 0, bg: '#fee2e2', color: '#7f1d1d' }] },
  { name: 'Red-Yellow-Green scale', rules: [{ kind: 'color-scale', colorMin: '#fecaca', colorMid: '#fef9c3', colorMax: '#bbf7d0' }] },
  { name: 'Blue gradient',          rules: [{ kind: 'color-scale', colorMin: '#dbeafe', colorMax: '#1e3a8a' }] },
  { name: 'Cyan data bar',          rules: [{ kind: 'data-bar', color: '#22d3ee' }] },
  { name: 'Top 3 → gold',           rules: [{ kind: 'top', n: 3, bg: '#fef3c7', color: '#78350f' }] },
  { name: 'Bottom 3 → red',         rules: [{ kind: 'top', n: 3, bg: '#fee2e2', color: '#7f1d1d', reverse: true }] },
  { name: 'Duplicates → yellow',    rules: [{ kind: 'duplicates', bg: '#fef3c7', color: '#78350f' }] },
  { name: 'Traffic light icons',    rules: [{ kind: 'icon-set', thresholds: [0, 50], icons: ['🔴', '🟡', '🟢'] }] },
];
