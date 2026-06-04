/**
 * PDF Studio engine — assemble an edited PDF from a working page list plus
 * per-page annotations, entirely with pdf-lib (vector content preserved). The
 * UI works in normalized page coordinates (0..1) so it's resolution-independent;
 * we map to PDF points (bottom-left origin) at export time.
 */

export interface PageRef { id: string; srcId: string; srcIndex: number; rotation: number }

export type Annotation =
  | { kind: 'text'; nx: number; ny: number; text: string; size: number; color: string }
  | { kind: 'rect'; nx: number; ny: number; nw: number; nh: number; color: string; opacity?: number; redact?: boolean } // filled box. redact:true = DESTROY content underneath (page is rasterized & flattened), not just painted over.
  | { kind: 'image'; nx: number; ny: number; nw: number; nh: number; bytes: ArrayBuffer; png: boolean }
  | { kind: 'draw'; pts: number[]; color: string; width: number } // freehand / signature — flat [x0,y0,x1,y1,…] normalized
  | { kind: 'line'; nx: number; ny: number; nx2: number; ny2: number; color: string; width: number }
  | { kind: 'ellipse'; nx: number; ny: number; nw: number; nh: number; color: string; width: number };

export interface BuildOptions {
  sources: Record<string, ArrayBuffer>;           // srcId → original PDF bytes
  pages: PageRef[];                                // working order
  annotations: Record<string, Annotation[]>;       // pageRef.id → items
  pageNumbers?: boolean;
  /** DPI for rasterizing pages that contain redactions (higher = sharper, larger file). Default 200. */
  redactDpi?: number;
  /** Re-OCR flattened (redacted) pages so they stay searchable — minus the redacted text. Default true. */
  reOcrRedacted?: boolean;
  onProgress?: (r: number) => void;
}

const isRedaction = (a: Annotation): a is Extract<Annotation, { kind: 'rect' }> =>
  a.kind === 'rect' && a.redact === true;

const hexToRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

/**
 * Render ONE page of a source PDF to a canvas at the requested DPI, using the
 * page's CURRENT rotation. Used for the destructive-redaction flatten path so
 * the raster we burn boxes into matches what the user sees.
 */
async function rasterizeSourcePage(bytes: ArrayBuffer, srcIndex: number, dpi: number, extraRotation: number): Promise<HTMLCanvasElement> {
  const lib = await import('pdfjs-dist');
  try { lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; } catch { /* */ }
  // pdf.js consumes the buffer — hand it a copy so the caller's bytes survive.
  const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
  try {
    const page = await doc.getPage(srcIndex + 1);
    const scale = dpi / 72; // PDF user space is 72 units / inch
    const rotation = (page.rotate + extraRotation) % 360;
    const viewport = page.getViewport({ scale, rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return canvas;
  } finally {
    try { doc.cleanup(); } catch { /* */ }
    try { doc.destroy(); } catch { /* */ }
  }
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    canvas.toBlob((b) => {
      if (!b) return rej(new Error('Could not encode redacted page'));
      b.arrayBuffer().then(res, rej);
    }, 'image/png');
  });
}

export async function buildPdf(opts: BuildOptions): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const redactDpi = opts.redactDpi ?? 200;

  // Load + cache each source document.
  const srcDocs: Record<string, Awaited<ReturnType<typeof PDFDocument.load>>> = {};
  for (const [id, bytes] of Object.entries(opts.sources)) {
    srcDocs[id] = await PDFDocument.load(bytes, { ignoreEncryption: true });
  }

  const total = opts.pages.length;
  for (let i = 0; i < opts.pages.length; i++) {
    const ref = opts.pages[i];
    const src = srcDocs[ref.srcId];
    if (!src) continue;
    const annos = opts.annotations[ref.id] ?? [];
    const redactions = annos.filter(isRedaction);

    // ---- DESTRUCTIVE redaction path -------------------------------------
    // If this page has any redaction box, we CANNOT keep the original vector
    // content — the text under the box stays selectable/extractable forever.
    // Instead: rasterize the page, paint the boxes onto the pixels (the bytes
    // beneath are gone), embed the flat image as the page, then draw the
    // remaining (non-redaction) annotations on top.
    if (redactions.length) {
      const srcBytes = opts.sources[ref.srcId];
      const canvas = await rasterizeSourcePage(srcBytes, ref.srcIndex, redactDpi, ref.rotation);
      const cctx = canvas.getContext('2d')!;
      // Burn each redaction box into the raster. Boxes are in normalized,
      // rotation-applied page space (the viewport was rendered WITH rotation),
      // so they map straight onto canvas pixels.
      for (const r of redactions) {
        cctx.fillStyle = '#000000';
        cctx.globalAlpha = 1;
        cctx.fillRect(r.nx * canvas.width, r.ny * canvas.height, r.nw * canvas.width, r.nh * canvas.height);
      }
      const pngBytes = await canvasToPngBytes(canvas);
      const img = await out.embedPng(pngBytes);
      // Page size in points = pixels / (dpi/72). Use the original page's
      // displayed size so downstream layout is unchanged.
      const pageW = (canvas.width * 72) / redactDpi;
      const pageH = (canvas.height * 72) / redactDpi;
      const page = out.addPage([pageW, pageH]);
      page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
      const { width: W, height: H } = page.getSize();

      // Draw the NON-redaction annotations (text, highlights, signatures,
      // images, shapes) on top of the flattened raster.
      for (const a of annos) {
        if (isRedaction(a)) continue;
        await drawAnnotation(page, a, W, H, font, rgb, out);
      }

      // Optionally re-OCR so the flattened page stays searchable, minus the
      // redacted regions (the boxes are already black pixels → OCR finds
      // nothing there). Invisible text layer, render-mode 3.
      if (opts.reOcrRedacted !== false) {
        try { await addInvisibleOcrLayer(page, canvas, font, redactions); } catch { /* OCR is best-effort */ }
      }

      if (opts.pageNumbers) drawPageNumber(page, font, rgb, i + 1, total, W);
      opts.onProgress?.((i + 1) / total);
      continue;
    }

    // ---- fast VECTOR path (no redaction on this page) -------------------
    const [copied] = await out.copyPages(src, [ref.srcIndex]);
    if (ref.rotation) {
      const base = copied.getRotation().angle;
      copied.setRotation(degrees((base + ref.rotation) % 360));
    }
    out.addPage(copied);
    const page = out.getPage(out.getPageCount() - 1);
    const { width: W, height: H } = page.getSize();

    for (const a of opts.annotations[ref.id] ?? []) {
      await drawAnnotation(page, a, W, H, font, rgb, out);
    }

    if (opts.pageNumbers) drawPageNumber(page, font, rgb, i + 1, total, W);
    opts.onProgress?.((i + 1) / total);
  }

  // Brand the export for free users (stampPdfFooter is a no-op when Pro turned
  // the watermark off via setPdfWatermark(null)).
  const { stampPdfFooter } = await import('@/engines/pdf');
  try { await stampPdfFooter(out); } catch { /* never block export */ }
  const bytes = await out.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

type PdfLibPage = ReturnType<Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.create>>['getPage']>;
type RgbFn = typeof import('pdf-lib').rgb;
type PdfFont = Awaited<ReturnType<Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.create>>['embedFont']>>;
type PdfDoc = Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.create>>;

/** Draw one annotation onto a page. Shared by the vector and redaction paths. */
async function drawAnnotation(page: any, a: Annotation, W: number, H: number, font: PdfFont, rgb: RgbFn, out?: PdfDoc): Promise<void> {
  if (a.kind === 'rect') {
    const c = hexToRgb(a.color);
    page.drawRectangle({ x: a.nx * W, y: H - (a.ny + a.nh) * H, width: a.nw * W, height: a.nh * H, color: rgb(c.r, c.g, c.b), opacity: a.opacity ?? 1 });
  } else if (a.kind === 'text') {
    const c = hexToRgb(a.color);
    const safe = a.text.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '?');
    page.drawText(safe, { x: a.nx * W, y: H - a.ny * H - a.size, size: a.size, font, color: rgb(c.r, c.g, c.b) });
  } else if (a.kind === 'image' && out) {
    try {
      const img = a.png ? await out.embedPng(a.bytes) : await out.embedJpg(a.bytes);
      page.drawImage(img, { x: a.nx * W, y: H - (a.ny + a.nh) * H, width: a.nw * W, height: a.nh * H });
    } catch { /* skip bad image */ }
  } else if (a.kind === 'draw') {
    const c = hexToRgb(a.color);
    for (let k = 2; k < a.pts.length; k += 2) {
      page.drawLine({ start: { x: a.pts[k - 2] * W, y: H - a.pts[k - 1] * H }, end: { x: a.pts[k] * W, y: H - a.pts[k + 1] * H }, thickness: a.width, color: rgb(c.r, c.g, c.b) });
    }
  } else if (a.kind === 'line') {
    const c = hexToRgb(a.color);
    page.drawLine({ start: { x: a.nx * W, y: H - a.ny * H }, end: { x: a.nx2 * W, y: H - a.ny2 * H }, thickness: a.width, color: rgb(c.r, c.g, c.b) });
  } else if (a.kind === 'ellipse') {
    const c = hexToRgb(a.color);
    page.drawEllipse({ x: (a.nx + a.nw / 2) * W, y: H - (a.ny + a.nh / 2) * H, xScale: Math.max(1, (a.nw * W) / 2), yScale: Math.max(1, (a.nh * H) / 2), borderColor: rgb(c.r, c.g, c.b), borderWidth: a.width });
  }
}

function drawPageNumber(page: any, font: PdfFont, rgb: RgbFn, n: number, total: number, W: number): void {
  const label = `${n} / ${total}`;
  const w = font.widthOfTextAtSize(label, 10);
  page.drawText(label, { x: W / 2 - w / 2, y: 18, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
}

/**
 * Re-OCR a flattened (redacted) page and lay down an INVISIBLE text layer
 * (render mode 3) so the page stays searchable/selectable — but only for the
 * text that survived redaction. Redacted regions are solid black in the
 * raster, so OCR returns nothing there; we also defensively skip any OCR word
 * whose box overlaps a redaction box. Best-effort: bails quietly on failure.
 */
async function addInvisibleOcrLayer(page: any, canvas: HTMLCanvasElement, font: PdfFont, redactions: { nx: number; ny: number; nw: number; nh: number }[]): Promise<void> {
  const { ocrCanvas } = await import('@/lib/studios/ocr');
  const r = await ocrCanvas(canvas, 'eng');
  if (!r.words.length) return;
  const W = page.getWidth();
  const H = page.getHeight();
  const sx = W / canvas.width;
  const sy = H / canvas.height;
  const overlapsRedaction = (wx: number, wy: number, ww: number, wh: number): boolean => {
    for (const rd of redactions) {
      const rx = rd.nx * canvas.width, ry = rd.ny * canvas.height, rw = rd.nw * canvas.width, rh = rd.nh * canvas.height;
      if (wx < rx + rw && wx + ww > rx && wy < ry + rh && wy + wh > ry) return true;
    }
    return false;
  };
  for (const w of r.words) {
    if (!w.text.trim() || w.confidence < 40) continue;
    if (overlapsRedaction(w.bbox.x, w.bbox.y, w.bbox.w, w.bbox.h)) continue; // never re-expose redacted text
    const safe = w.text.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');
    if (!safe) continue;
    const size = Math.max(4, w.bbox.h * sy * 0.9);
    // y in pdf-lib is bottom-left origin; canvas bbox is top-left.
    page.drawText(safe, {
      x: w.bbox.x * sx,
      y: H - (w.bbox.y + w.bbox.h) * sy,
      size,
      font,
      opacity: 0, // invisible — selectable/searchable only
    });
  }
}
