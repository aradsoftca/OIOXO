/**
 * PDF rasterization — converts each PDF page to an HTMLCanvasElement so we can
 * feed it to OCR (or any other image-based engine). Uses pdf.js with a worker
 * served from /public.
 */

import { startJob, updateJob, endJob } from '@/lib/compute/progressBus';

export interface RasterizeProgress {
  page: number;
  pageCount: number;
}

export interface RasterizedPage {
  index: number;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
async function pdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsReady) {
    const p = (async () => {
      const mod = await import('pdfjs-dist');
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    })();
    // Clear the cache on rejection so a transient module-load failure (e.g.
    // dynamic chunk fetch blocked by a brief network drop) doesn't memoise a
    // broken promise that breaks every later PDF op for the rest of the page.
    p.catch(() => { pdfjsReady = null; });
    pdfjsReady = p;
  }
  return pdfjsReady;
}

export interface RasterizeOptions {
  /** Target longest-edge in CSS pixels; higher = sharper OCR but slower. Default 1600. */
  maxEdge?: number;
  /** Page indices to render (0-based). Defaults to all pages. */
  pages?: number[];
  /** Background — pages with transparency get this color (default white for OCR). */
  background?: string;
  onProgress?: (p: RasterizeProgress) => void;
}

export async function rasterizePdf(
  buffer: ArrayBuffer,
  opts: RasterizeOptions = {},
): Promise<RasterizedPage[]> {
  const lib = await pdfjs();
  const maxEdge = opts.maxEdge ?? 1600;
  const background = opts.background ?? '#ffffff';

  const loadingTask = lib.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  const total = doc.numPages;
  const wanted = (opts.pages ?? Array.from({ length: total }, (_, i) => i)).filter((i) => i >= 0 && i < total);

  const out: RasterizedPage[] = [];
  startJob('Rendering');
  try {
  for (let i = 0; i < wanted.length; i++) {
    const idx = wanted[i];
    const page = await doc.getPage(idx + 1);
    const viewport0 = page.getViewport({ scale: 1 });
    const scale = maxEdge / Math.max(viewport0.width, viewport0.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({ index: idx, canvas, width: canvas.width, height: canvas.height });
    opts.onProgress?.({ page: i + 1, pageCount: wanted.length });
    updateJob('Rendering', (i + 1) / wanted.length);
    page.cleanup();
    // Yield a full event-loop turn so the UI repaints between pages.
    await new Promise((r) => setTimeout(r, 0));
  }
  } finally {
    endJob();
    // ALWAYS release the PDFDocumentProxy + its worker resources, even when a
    // page render throws. Previously these calls lived after the try/finally,
    // so any thrown render leaked the document + worker forever.
    try { doc.cleanup(); } catch { /* */ }
    try { doc.destroy(); } catch { /* */ }
  }
  return out;
}

export async function getPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: buffer }).promise;
  try {
    return doc.numPages;
  } finally {
    try { doc.destroy(); } catch { /* */ }
  }
}

export interface ExtractedPage {
  index: number;
  text: string;
}

export interface ExtractTextOptions {
  /** Join text items with newlines when they sit on different vertical positions. Default true. */
  preserveLineBreaks?: boolean;
  onProgress?: (p: { page: number; pageCount: number }) => void;
}

/**
 * Extract the existing text layer of a PDF — fast and exact for PDFs that
 * already contain selectable text. For scanned image-only PDFs use pdf-ocr.
 */
export async function extractPdfText(buffer: ArrayBuffer, opts: ExtractTextOptions = {}): Promise<ExtractedPage[]> {
  const lib = await pdfjs();
  const preserveLineBreaks = opts.preserveLineBreaks ?? true;
  const doc = await lib.getDocument({ data: buffer }).promise;
  const pages: ExtractedPage[] = [];
  startJob('Reading');
  try {
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    if (preserveLineBreaks) {
      const lines: string[] = [];
      let lastY: number | null = null;
      let current = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const transform = (item as { transform: number[] }).transform;
        const y = transform[5];
        if (lastY != null && Math.abs(y - lastY) > 2) {
          if (current.trim()) lines.push(current.trim());
          current = '';
        }
        current += (current && !current.endsWith(' ') ? ' ' : '') + item.str;
        lastY = y;
      }
      if (current.trim()) lines.push(current.trim());
      pages.push({ index: i - 1, text: lines.join('\n') });
    } else {
      const text = content.items.map((it) => 'str' in it ? it.str : '').join(' ');
      pages.push({ index: i - 1, text });
    }
    opts.onProgress?.({ page: i, pageCount: doc.numPages });
    updateJob('Reading', i / doc.numPages);
    page.cleanup();
  }
  } finally {
    endJob();
    try { doc.cleanup(); } catch { /* */ }
    try { doc.destroy(); } catch { /* */ }
  }
  return pages;
}
