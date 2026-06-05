/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Document Translator — translate a DOCX, PDF or image while KEEPING the
 * original design, on-device.
 *
 *   DOCX  → translate every text run in the XML, repackage (formatting intact)
 *   Image → OCR the text + boxes, translate, paint the translation back in place
 *   PDF   → render each page, read text positions, paint translations on top →
 *           a new image-based PDF that looks like the original, in your language
 *
 * Uses the existing on-device translate() stack. Canvas text rendering handles
 * any script (incl. RTL / CJK) via the browser's own shaping — no font embedding.
 * Caveats: translated text length differs, so it's auto-shrunk to fit each box;
 * very dense/complex layouts won't be pixel-perfect.
 */

import { translate, detectLanguage } from '@/lib/ai/translate';
import { ocrLangFor } from '@/lib/i18n/languages';

export interface DocTranslateOptions {
  to: string;
  from?: string;             // omit to auto-detect
  onProgress?: (phase: string, ratio: number) => void;
}

/** Translate a batch of strings, preserving blanks; reports 0..1 progress. */
async function translateAll(texts: string[], from: string, to: string, onProgress?: (r: number) => void): Promise<string[]> {
  if (from === to) return texts.slice();
  const out: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (!t.trim()) { out.push(t); }
    else out.push((await translate(t, from, to).catch(() => null)) || t);
    onProgress?.((i + 1) / texts.length);
  }
  return out;
}

async function resolveFrom(sample: string, from?: string): Promise<string> {
  if (from && from !== 'auto') return from;
  return (await detectLanguage(sample).catch(() => null)) || 'en';
}

// ---- DOCX (structured — best fidelity) ------------------------------------
export async function translateDocx(file: File, opts: DocTranslateOptions): Promise<Blob> {
  const report = opts.onProgress ?? (() => {});
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  // document body + headers/footers carry visible text.
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  const parser = new DOMParser();
  const ser = new XMLSerializer();
  const docs: { name: string; doc: Document; nodes: Element[] }[] = [];
  const all: string[] = [];
  for (const name of names) {
    const xml = await zip.file(name)!.async('string');
    const doc = parser.parseFromString(xml, 'application/xml');
    const nodes = Array.from(doc.getElementsByTagName('w:t'));
    docs.push({ name, doc, nodes });
    for (const n of nodes) all.push(n.textContent || '');
  }
  report('Detecting language', 0.02);
  const from = await resolveFrom(all.slice(0, 20).join(' '), opts.from);
  report('Translating', 0.05);
  const translated = await translateAll(all, from, opts.to, (r) => report('Translating', 0.05 + r * 0.9));
  let k = 0;
  for (const d of docs) {
    for (const n of d.nodes) { n.textContent = translated[k++]; }
    zip.file(d.name, ser.serializeToString(d.doc));
  }
  report('Packaging', 0.98);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---- shared canvas painting (image + pdf) ---------------------------------
interface Box { text: string; x: number; y: number; w: number; h: number } // y = top, canvas px

function sampleBg(ctx: CanvasRenderingContext2D, b: Box): string {
  try {
    const px = ctx.getImageData(Math.max(0, b.x + b.w / 2), Math.max(0, b.y - Math.max(2, b.h * 0.4)), 1, 1).data;
    return `rgb(${px[0]},${px[1]},${px[2]})`;
  } catch { return '#ffffff'; }
}
function luminance(rgb: string): number {
  const m = /(\d+),(\d+),(\d+)/.exec(rgb); if (!m) return 255;
  return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
}

/** Cover each box's original text and paint the translation fitted to the box. */
function paintBoxes(ctx: CanvasRenderingContext2D, boxes: Box[], translated: string[]) {
  ctx.textBaseline = 'middle';
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]; const text = translated[i]?.trim(); if (!text) continue;
    const bg = sampleBg(ctx, b);
    ctx.fillStyle = bg;
    ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    // fit font size to box width.
    let size = Math.max(8, Math.floor(b.h * 0.82));
    ctx.font = `${size}px system-ui, "Noto Sans", "Segoe UI", sans-serif`;
    while (size > 7 && ctx.measureText(text).width > b.w) { size -= 1; ctx.font = `${size}px system-ui, "Noto Sans", sans-serif`; }
    ctx.fillStyle = luminance(bg) < 130 ? '#ffffff' : '#111111';
    ctx.fillText(text, b.x, b.y + b.h / 2);
  }
}

// ---- Image (OCR → repaint) ------------------------------------------------
export async function translateImage(file: File, opts: DocTranslateOptions): Promise<Blob> {
  const report = opts.onProgress ?? (() => {});
  const { recognize } = await import('@/engines/ocr');
  report('Reading text', 0.05);
  const res = await recognize(file, { language: ocrLangFor(opts.from), onProgress: (p: any) => report('Reading text', 0.05 + (p.ratio ?? 0) * 0.35) });
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(bmp, 0, 0); bmp.close();
  const lines = res.lines.filter((l) => l.text.trim());
  const boxes: Box[] = lines.map((l) => ({ text: l.text, x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0 }));
  const from = await resolveFrom(lines.slice(0, 10).map((l) => l.text).join(' '), opts.from);
  const translated = await translateAll(boxes.map((b) => b.text), from, opts.to, (r) => report('Translating', 0.4 + r * 0.55));
  paintBoxes(ctx, boxes, translated);
  report('Done', 1);
  return new Promise<Blob>((r, j) => canvas.toBlob((b) => b ? r(b) : j(new Error('export failed')), 'image/png'));
}

// ---- PDF (render → reposition text → image PDF) ---------------------------
export async function translatePdf(file: File, opts: DocTranslateOptions): Promise<Blob> {
  const report = opts.onProgress ?? (() => {});
  const lib: any = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const data = await file.arrayBuffer();
  const doc = await lib.getDocument({ data }).promise;
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const scale = 2;
  let detectedFrom = opts.from;

  try {
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const tc = await page.getTextContent();
    // group text items into lines by rounded baseline y.
    const lineMap = new Map<number, { x: number; y: number; h: number; right: number; str: string }>();
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue;
      const tr = lib.Util.transform(viewport.transform, it.transform);
      const x = tr[4]; const yBase = tr[5];
      const h = Math.hypot(tr[2], tr[3]) || (it.height * scale) || 12;
      const w = (it.width || 0) * scale;
      const key = Math.round(yBase / (h * 0.6));
      const cur = lineMap.get(key);
      if (cur) { cur.str += it.str; cur.right = Math.max(cur.right, x + w); cur.x = Math.min(cur.x, x); }
      else lineMap.set(key, { x, y: yBase, h, right: x + w, str: it.str });
    }
    const boxes: Box[] = Array.from(lineMap.values()).map((l) => ({ text: l.str, x: l.x, y: l.y - l.h, w: Math.max(l.right - l.x, l.h), h: l.h * 1.15 }));
    if (boxes.length) {
      if (!detectedFrom || detectedFrom === 'auto') detectedFrom = await resolveFrom(boxes.slice(0, 10).map((b) => b.text).join(' '), opts.from);
      const translated = await translateAll(boxes.map((b) => b.text), detectedFrom!, opts.to);
      paintBoxes(ctx, boxes, translated);
    }
    const jpg: Blob = await new Promise((r, j) => canvas.toBlob((b) => b ? r(b) : j(new Error('e')), 'image/jpeg', 0.9));
    const img = await out.embedJpg(await jpg.arrayBuffer());
    const pg = out.addPage([viewport.width, viewport.height]);
    pg.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    page.cleanup();
    report('Translating', p / doc.numPages);
  }
  } finally {
    // Always release the pdf.js document + worker even on a mid-render
    // exception. Previously `doc.destroy()` only ran on the success path,
    // so a single bad page (OCR translation throw, canvas OOM, network
    // drop on translate()) leaked the document + its worker thread.
    try { doc.destroy(); } catch { /* */ }
  }
  const { stampPdfFooter } = await import('@/engines/pdf');
  try { await stampPdfFooter(out); } catch { /* */ }
  return new Blob([new Uint8Array(await out.save())], { type: 'application/pdf' });
}

// ---- Editable output (for the Translation Studio editor) ------------------
export interface EditorBox { id: string; text: string; original: string; x: number; y: number; w: number; h: number }
export interface ImageEditorData { width: number; height: number; bg: Blob; boxes: EditorBox[]; from: string; to: string }

let _bid = 0;
/** OCR + translate an image but return the original image + editable translated boxes (NOT flattened). */
export async function prepareImageEditor(file: File, opts: DocTranslateOptions): Promise<ImageEditorData> {
  const report = opts.onProgress ?? (() => {});
  const { recognize } = await import('@/engines/ocr');
  report('Reading text', 0.05);
  const res = await recognize(file, { language: ocrLangFor(opts.from), onProgress: (p: any) => report('Reading text', 0.05 + (p.ratio ?? 0) * 0.4) });
  const bmp = await createImageBitmap(file);
  const width = bmp.width, height = bmp.height; bmp.close();
  const lines = res.lines.filter((l) => l.text.trim());
  const from = await resolveFrom(lines.slice(0, 10).map((l) => l.text).join(' '), opts.from);
  const translated = await translateAll(lines.map((l) => l.text), from, opts.to, (r) => report('Translating', 0.45 + r * 0.5));
  const boxes: EditorBox[] = lines.map((l, i) => ({
    id: `b${++_bid}`, text: translated[i] ?? l.text, original: l.text,
    x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0,
  }));
  return { width, height, bg: file, boxes, from, to: opts.to };
}

/** Translate plain text line-by-line (Studio text mode), auto-detecting source. */
export async function translateText(text: string, opts: DocTranslateOptions): Promise<{ text: string; from: string }> {
  const from = await resolveFrom(text.slice(0, 200), opts.from);
  const lines = text.split('\n');
  const outLines = await translateAll(lines, from, opts.to, (r) => opts.onProgress?.('Translating', r));
  return { text: outLines.join('\n'), from };
}

/** Dispatch by file type. */
export async function translateDocument(file: File, opts: DocTranslateOptions): Promise<{ blob: Blob; ext: string }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return { blob: await translateDocx(file, opts), ext: 'docx' };
  if (name.endsWith('.pdf')) return { blob: await translatePdf(file, opts), ext: 'pdf' };
  if (/\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(name) || file.type.startsWith('image/')) return { blob: await translateImage(file, opts), ext: 'png' };
  throw new Error('Unsupported file — use a DOCX, PDF, or image.');
}
