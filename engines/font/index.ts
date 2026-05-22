/**
 * Font engine — wraps opentype.js with helpers for inspection, conversion, and subsetting.
 * All operations are pure functions that take ArrayBuffers and return either metadata
 * or new font blobs.
 */
import * as opentype from 'opentype.js';
import type { Font, Glyph } from 'opentype.js';

export interface FontInfo {
  family: string;
  subfamily: string;
  fullName: string;
  postScriptName: string;
  designer: string;
  manufacturer: string;
  copyright: string;
  version: string;
  license: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphCount: number;
  format: string;
  fileSize: number;
}

export async function loadFont(buffer: ArrayBuffer): Promise<Font> {
  return opentype.parse(buffer);
}

function pickName(font: Font, key: string): string {
  const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
  const entry = names[key];
  if (!entry) return '';
  return entry.en ?? Object.values(entry)[0] ?? '';
}

export function getFontInfo(font: Font, fileSize = 0): FontInfo {
  const tables = (font as unknown as { tables?: { head?: { magicNumber?: number } } }).tables ?? {};
  const hasGlyf = Boolean((tables as Record<string, unknown>).glyf);
  const hasCff = Boolean((tables as Record<string, unknown>).cff);
  const format = hasGlyf ? 'TrueType' : hasCff ? 'OpenType (CFF)' : 'OpenType';
  return {
    family: pickName(font, 'fontFamily'),
    subfamily: pickName(font, 'fontSubfamily'),
    fullName: pickName(font, 'fullName'),
    postScriptName: pickName(font, 'postScriptName'),
    designer: pickName(font, 'designer'),
    manufacturer: pickName(font, 'manufacturer'),
    copyright: pickName(font, 'copyright'),
    version: pickName(font, 'version'),
    license: pickName(font, 'license'),
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphCount: font.glyphs.length,
    format,
    fileSize,
  };
}

export interface GlyphSummary {
  index: number;
  name: string;
  unicode: number | null;
  char: string;
  advanceWidth: number;
}

export function listGlyphs(font: Font, limit = 500, offset = 0): GlyphSummary[] {
  const out: GlyphSummary[] = [];
  const total = Math.min(font.glyphs.length, offset + limit);
  for (let i = offset; i < total; i++) {
    const g: Glyph = font.glyphs.get(i);
    const unicode = g.unicode ?? null;
    out.push({
      index: i,
      name: g.name ?? '',
      unicode,
      char: typeof unicode === 'number' ? String.fromCodePoint(unicode) : '',
      advanceWidth: g.advanceWidth ?? 0,
    });
  }
  return out;
}

export function renderToSvg(font: Font, text: string, fontSizePx: number, color = '#0f172a'): string {
  if (!text) return '';
  const path = font.getPath(text, 0, fontSizePx, fontSizePx);
  const bbox = path.getBoundingBox();
  const width = Math.max(1, Math.ceil(bbox.x2 - bbox.x1) + 4);
  const height = Math.max(1, Math.ceil(bbox.y2 - bbox.y1) + 4);
  const tx = -bbox.x1 + 2;
  const ty = -bbox.y1 + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${tx} ${ty})" fill="${color}">${path.toSVG(2)}</g></svg>`;
}

/**
 * Build a subset font containing only glyphs whose unicode appears in `chars`.
 * Returns an ArrayBuffer in TTF format. opentype.js always writes TTF when toArrayBuffer()
 * is called; CFF input is converted to glyf representation.
 */
export function subsetFont(font: Font, chars: string): ArrayBuffer {
  const wanted = new Set<number>();
  for (const cp of chars) {
    const code = cp.codePointAt(0);
    if (typeof code === 'number') wanted.add(code);
  }

  const notdef = font.glyphs.get(0);
  const newGlyphs: Glyph[] = [notdef];

  for (let i = 1; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    if (typeof g.unicode === 'number' && wanted.has(g.unicode)) {
      newGlyphs.push(g);
    }
  }

  const subset = new opentype.Font({
    familyName: pickName(font, 'fontFamily') || 'Subset',
    styleName: pickName(font, 'fontSubfamily') || 'Regular',
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphs: newGlyphs,
  });

  return subset.toArrayBuffer();
}

/**
 * Wrap a TTF/OTF ArrayBuffer into a WOFF2-compatible format isn't possible without
 * a WOFF2 encoder. We instead provide the original buffer as a TTF blob ready
 * for @font-face. For "Web Font" generation we return the bytes + a ready-to-use
 * @font-face snippet.
 */
export function makeFontFace(family: string, base64: string, format = 'truetype'): string {
  return `@font-face {
  font-family: "${family}";
  src: url(data:font/${format};base64,${base64}) format("${format}");
  font-display: swap;
}`;
}

export function ab2base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
