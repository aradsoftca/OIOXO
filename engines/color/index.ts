/**
 * Color conversion + contrast utilities. Everything stays in numbers; UI layers
 * format to whatever string the user picked.
 */

export interface RGB { r: number; g: number; b: number; a?: number }
export interface HSL { h: number; s: number; l: number; a?: number }
export interface HSV { h: number; s: number; v: number; a?: number }

export function parseHex(input: string): RGB | null {
  const s = input.trim().replace(/^#/, '');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i))) {
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: m[4] ? parseInt(m[4] + m[4], 16) / 255 : undefined,
    };
  }
  if ((m = s.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i))) {
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
      a: m[4] ? parseInt(m[4], 16) / 255 : undefined,
    };
  }
  return null;
}

export function toHex({ r, g, b, a }: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const base = `#${h(r)}${h(g)}${h(b)}`;
  if (a !== undefined && a < 1) return base + h(a * 255);
  return base;
}

export function rgbToHsl({ r, g, b, a }: RGB): HSL {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr: h = ((gg - bb) / d + (gg < bb ? 6 : 0)); break;
      case gg: h = ((bb - rr) / d + 2); break;
      case bb: h = ((rr - gg) / d + 4); break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100), a };
}

export function hslToRgb({ h, s, l, a }: HSL): RGB {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a };
}

export function rgbToHsv({ r, g, b, a }: RGB): HSV {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rr: h = ((gg - bb) / d + (gg < bb ? 6 : 0)); break;
      case gg: h = ((bb - rr) / d + 2); break;
      case bb: h = ((rr - gg) / d + 4); break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(max === 0 ? 0 : (d / max) * 100), v: Math.round(max * 100), a };
}

/** Relative luminance per WCAG 2.x. */
export function luminance({ r, g, b }: RGB): number {
  const ch = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG 2.x contrast ratio between two colors (1..21). */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker  = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function harmonies(base: HSL): Record<string, HSL[]> {
  const wrap = (h: number) => ((h % 360) + 360) % 360;
  const make = (offsets: number[]) => offsets.map((o) => ({ ...base, h: wrap(base.h + o) }));
  return {
    complementary: make([0, 180]),
    analogous:     make([0, -30, 30]),
    triadic:       make([0, 120, 240]),
    tetradic:      make([0, 90, 180, 270]),
    splitComplementary: make([0, 150, 210]),
    monochrome:    [
      { ...base, l: Math.max(10, base.l - 30) },
      { ...base, l: Math.max(20, base.l - 15) },
      base,
      { ...base, l: Math.min(90, base.l + 15) },
      { ...base, l: Math.min(95, base.l + 30) },
    ],
  };
}
