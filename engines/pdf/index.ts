/**
 * PDF engine — wraps pdf-lib for merge/split/rotate/etc operations.
 * Each function returns a Uint8Array of the resulting PDF document.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFFont, PageSizes } from 'pdf-lib';
import { BRAND_DOMAIN } from '@/lib/brand';

// ---- Brand footer (free) ----------------------------------------------------
// A faint "Made with xonvert.com" footer on every page of any PDF this engine
// outputs. Default ON (free); Pro calls setPdfWatermark(null). Every save goes
// through saveBranded() so no output is missed. Fully defensive — a footer
// failure never blocks the save.
let _pdfWm: string | null = BRAND_DOMAIN;
export function setPdfWatermark(text: string | null): void { _pdfWm = text; }

/**
 * Draw the brand footer on every page (free; no-op for Pro). Exported so tools
 * that build PDFs DIRECTLY with pdf-lib (images-to-pdf, pdf-sign, pdf-compress,
 * pdf-fill-form, pdf-protect, pdf-unlock) can call it before their own .save() —
 * they bypass this engine's functions, so saveBranded() alone wouldn't cover them.
 * Typed loosely (any) so it also accepts @cantoo/pdf-lib documents. Defensive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stampPdfFooter(doc: any): Promise<void> {
  if (!_pdfWm) return;
  try {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const text = `Made with ${_pdfWm}`;
    const size = 8;
    for (const page of doc.getPages()) {
      const { width } = page.getSize();
      const tw = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: Math.max(8, width - tw - 12),
        y: 10,
        size,
        font,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.6,
      });
    }
  } catch { /* never block the save on a footer */ }
}

async function saveBranded(doc: PDFDocument): Promise<Uint8Array> {
  await stampPdfFooter(doc);
  return doc.save();
}

export interface PdfInfo {
  pageCount: number;
  title: string;
  author: string;
  subject: string;
  keywords: string[];
  producer: string;
  creator: string;
  creationDate: string;
  modificationDate: string;
  pageSize: { width: number; height: number };
  fileSize: number;
  encrypted: boolean;
}

export async function loadPdf(buffer: ArrayBuffer, ignoreEncrypted = false): Promise<PDFDocument> {
  return PDFDocument.load(buffer, { ignoreEncryption: ignoreEncrypted });
}

export async function getPdfInfo(buffer: ArrayBuffer): Promise<PdfInfo> {
  let doc: PDFDocument;
  let encrypted = false;
  try {
    doc = await PDFDocument.load(buffer);
  } catch (e) {
    if ((e as Error).message?.toLowerCase().includes('encrypted')) {
      doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      encrypted = true;
    } else {
      throw e;
    }
  }
  const firstPage = doc.getPageCount() > 0 ? doc.getPage(0) : null;
  return {
    pageCount: doc.getPageCount(),
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords()?.split(/[,\s]+/).filter(Boolean) ?? [],
    producer: doc.getProducer() ?? '',
    creator: doc.getCreator() ?? '',
    creationDate: doc.getCreationDate()?.toISOString() ?? '',
    modificationDate: doc.getModificationDate()?.toISOString() ?? '',
    pageSize: firstPage
      ? { width: firstPage.getWidth(), height: firstPage.getHeight() }
      : { width: 0, height: 0 },
    fileSize: buffer.byteLength,
    encrypted,
  };
}

export async function mergePdfs(buffers: ArrayBuffer[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return saveBranded(out);
}

/**
 * Split into N files based on ranges. Each range is a list of 0-based page indices.
 * Returns one Uint8Array per range.
 */
export async function splitPdf(buffer: ArrayBuffer, ranges: number[][]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out: Uint8Array[] = [];
  for (const range of ranges) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, range);
    pages.forEach((p) => doc.addPage(p));
    out.push(await saveBranded(doc));
  }
  return out;
}

export async function splitEveryPage(buffer: ArrayBuffer): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out: Uint8Array[] = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    out.push(await saveBranded(doc));
  }
  return out;
}

/** Parse a page-range expression like "1-3, 5, 7-9" into 0-based indices. */
export function parseRange(input: string, max: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(/[\s,]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    const lo = Math.max(1, Math.min(a, b));
    const hi = Math.min(max, Math.max(a, b));
    for (let i = lo; i <= hi; i++) out.add(i - 1);
  }
  return [...out].sort((a, b) => a - b);
}

export async function rotatePages(
  buffer: ArrayBuffer,
  rotation: 90 | 180 | 270,
  targets: number[] | 'all' = 'all',
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = doc.getPages();
  const indices = targets === 'all' ? pages.map((_, i) => i) : targets;
  for (const i of indices) {
    if (i >= 0 && i < pages.length) {
      const cur = pages[i].getRotation().angle;
      pages[i].setRotation(degrees((cur + rotation) % 360));
    }
  }
  return saveBranded(doc);
}

export async function deletePages(buffer: ArrayBuffer, toDelete: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const sorted = [...new Set(toDelete)].sort((a, b) => b - a);
  for (const i of sorted) {
    if (i >= 0 && i < doc.getPageCount()) doc.removePage(i);
  }
  return saveBranded(doc);
}

export async function extractPages(buffer: ArrayBuffer, toKeep: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const valid = toKeep.filter((i) => i >= 0 && i < src.getPageCount());
  const pages = await out.copyPages(src, valid);
  pages.forEach((p) => out.addPage(p));
  return saveBranded(out);
}

export async function reorderPages(buffer: ArrayBuffer, order: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const valid = order.filter((i) => i >= 0 && i < src.getPageCount());
  const pages = await out.copyPages(src, valid);
  pages.forEach((p) => out.addPage(p));
  return saveBranded(out);
}

export type PageNumberPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export async function addPageNumbers(buffer: ArrayBuffer, opts: {
  position?: PageNumberPosition;
  fontSize?: number;
  format?: string;
  startAt?: number;
  margin?: number;
  color?: { r: number; g: number; b: number };
}): Promise<Uint8Array> {
  const {
    position = 'bottom-center',
    fontSize = 11,
    format = '{n}',
    startAt = 1,
    margin = 24,
    color = { r: 0.1, g: 0.1, b: 0.1 },
  } = opts;
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const text = format
      .replace('{n}', String(i + startAt))
      .replace('{total}', String(total));
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const { x, y } = pickXY(position, width, height, textWidth, fontSize, margin);
    page.drawText(text, { x, y, size: fontSize, font, color: rgb(color.r, color.g, color.b) });
  });
  return saveBranded(doc);
}

function pickXY(
  position: PageNumberPosition,
  w: number, h: number, tw: number, fs: number, m: number,
): { x: number; y: number } {
  let x = m, y = m;
  if (position.endsWith('center')) x = (w - tw) / 2;
  else if (position.endsWith('right')) x = w - tw - m;
  if (position.startsWith('top')) y = h - m - fs;
  return { x, y };
}

export async function addTextWatermark(buffer: ArrayBuffer, opts: {
  text: string;
  fontSize?: number;
  opacity?: number;
  rotation?: number;
  color?: { r: number; g: number; b: number };
}): Promise<Uint8Array> {
  const {
    text, fontSize = 60, opacity = 0.2, rotation = -45,
    color = { r: 0.6, g: 0.6, b: 0.6 },
  } = opts;
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const tw = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: (width - tw * Math.cos(rotation * Math.PI / 180)) / 2,
      y: (height - fontSize * Math.cos(rotation * Math.PI / 180)) / 2,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity,
      rotate: degrees(rotation),
    });
  }
  return saveBranded(doc);
}

export function download(bytes: Uint8Array, filename: string) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  // Defer revoke — mobile Safari/Firefox can abort the download if the blob
  // URL is torn down before the download stream is established. 60s is
  // plenty for any practical PDF; long-deferred revokes are GC'd at tab
  // close so there's no real leak.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type { PageSizes };
