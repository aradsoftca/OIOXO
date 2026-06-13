export interface PdfFormField {
  id: string;
  pageId: string;
  kind: 'text' | 'checkbox' | 'signature';
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  label: string;
  value?: string;
  checked?: boolean;
  signatureBytes?: ArrayBuffer;
}

export interface PdfWatermark {
  text?: string;
  imageBytes?: ArrayBuffer;
  opacity: number;
  rotation: number;
  color: string;
  fontSize: number;
  position: 'center' | 'top' | 'bottom' | 'top-right' | 'bottom-right';
}

export interface PdfSecurity {
  userPassword?: string;
  ownerPassword?: string;
  allowPrint?: boolean;
  allowCopy?: boolean;
  allowEdit?: boolean;
}

export async function applyWatermarkToPdf(srcBytes: ArrayBuffer, watermark: PdfWatermark): Promise<Blob> {
  const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  let embeddedImage: any = null;
  if (watermark.imageBytes) {
    try {
      embeddedImage = await pdf.embedPng(watermark.imageBytes);
    } catch {
      try { embeddedImage = await pdf.embedJpg(watermark.imageBytes); } catch {}
    }
  }
  const colorRgb = hexToRgb(watermark.color);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    if (watermark.text) {
      const textWidth = font.widthOfTextAtSize(watermark.text, watermark.fontSize);
      const textHeight = watermark.fontSize;
      const { x, y } = computeWatermarkPos(watermark.position, width, height, textWidth, textHeight);
      page.drawText(watermark.text, {
        x, y,
        size: watermark.fontSize,
        font,
        color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
        opacity: watermark.opacity,
        rotate: degrees(watermark.rotation),
      });
    }
    if (embeddedImage) {
      const scale = Math.min(width / embeddedImage.width, height / embeddedImage.height) * 0.5;
      const w = embeddedImage.width * scale;
      const h = embeddedImage.height * scale;
      const { x, y } = computeWatermarkPos(watermark.position, width, height, w, h);
      page.drawImage(embeddedImage, {
        x, y,
        width: w,
        height: h,
        opacity: watermark.opacity,
        rotate: degrees(watermark.rotation),
      });
    }
  }
  const out = await pdf.save();
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' });
}

function computeWatermarkPos(pos: PdfWatermark['position'], pageW: number, pageH: number, w: number, h: number): { x: number; y: number } {
  switch (pos) {
    case 'center':       return { x: (pageW - w) / 2, y: (pageH - h) / 2 };
    case 'top':          return { x: (pageW - w) / 2, y: pageH - h - 32 };
    case 'bottom':       return { x: (pageW - w) / 2, y: 32 };
    case 'top-right':    return { x: pageW - w - 32, y: pageH - h - 32 };
    case 'bottom-right': return { x: pageW - w - 32, y: 32 };
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export async function splitPdf(srcBytes: ArrayBuffer, ranges: Array<{ from: number; to: number; name?: string }>): Promise<Array<{ blob: Blob; name: string }>> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const results: Array<{ blob: Blob; name: string }> = [];
  const totalPages = src.getPageCount();
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const from = Math.max(1, Math.min(totalPages, r.from));
    const to = Math.max(from, Math.min(totalPages, r.to));
    const out = await PDFDocument.create();
    const indices: number[] = [];
    for (let p = from - 1; p < to; p++) indices.push(p);
    const copied = await out.copyPages(src, indices);
    for (const page of copied) out.addPage(page);
    const bytes = await out.save();
    const name = r.name ?? `pages_${from}-${to}.pdf`;
    results.push({ blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), name });
  }
  return results;
}

export async function extractPdfText(srcBytes: ArrayBuffer): Promise<Array<{ pageNum: number; text: string }>> {
  const pdfjsLib: any = await import('pdfjs-dist');
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; } catch {}
  const pdfDoc = await pdfjsLib.getDocument({ data: srcBytes.slice(0) }).promise;
  const pages: Array<{ pageNum: number; text: string }> = [];
  try {
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as any[]).map(item => item.str).join(' ');
      pages.push({ pageNum: i, text });
      page.cleanup();
    }
  } finally {
    // Always release the pdfjs document + its worker thread. Previously a
    // mid-iteration exception (or even normal completion on long PDFs) left
    // the worker alive for the rest of the page lifetime.
    try { pdfDoc.destroy(); } catch { /* */ }
  }
  return pages;
}

export async function pdfToDocx(srcBytes: ArrayBuffer, name = 'document'): Promise<Blob> {
  const pages = await extractPdfText(srcBytes);
  const paragraphs: string[] = [];
  for (const p of pages) {
    paragraphs.push(`<h2>Page ${p.pageNum}</h2>`);
    const blocks = p.text.split(/\.\s+/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed) paragraphs.push(`<p>${escapeHtml(trimmed)}.</p>`);
    }
  }
  const html = paragraphs.join('\n');
  const { exportDocx } = await import('./ooxml');
  return exportDocx(html, name);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function makeSearchablePdf(srcBytes: ArrayBuffer, onProgress?: (page: number, total: number) => void): Promise<Blob> {
  const { rasterizePdf } = await import('@/engines/pdf/rasterize');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const { ocrCanvas } = await import('./ocr');
  const rasters = await rasterizePdf(srcBytes.slice(0), { maxEdge: 1600 });
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < rasters.length; i++) {
    onProgress?.(i + 1, rasters.length);
    const ras = rasters[i];
    const page = out.addPage([ras.width, ras.height]);
    const blob = await new Promise<Blob>((res, rej) => ras.canvas.toBlob(b => b ? res(b) : rej(new Error('Could not encode page')), 'image/jpeg', 0.85));
    const imgBytes = await blob.arrayBuffer();
    const img = await out.embedJpg(imgBytes);
    page.drawImage(img, { x: 0, y: 0, width: ras.width, height: ras.height });
    try {
      const ocr = await ocrCanvas(ras.canvas);
      for (const word of ocr.words) {
        const x = word.bbox.x;
        const y = ras.height - word.bbox.y - word.bbox.h;
        const fontSize = Math.max(6, word.bbox.h * 0.8);
        page.drawText(word.text, {
          x, y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      }
    } catch {}
  }
  const result = await out.save();
  return new Blob([new Uint8Array(result)], { type: 'application/pdf' });
}

// 'lossless' preserves the TEXT layer (re-saves with object streams, no
// rasterization — text stays selectable/searchable); light/balanced/strong
// rasterize pages to JPEG (smaller, but text becomes an image — only right for
// scans/image-heavy PDFs).
export type PdfCompressLevel = 'lossless' | 'light' | 'balanced' | 'strong';

/**
 * Content-aware "Reduce File Size" — rasterizes each page and re-embeds it as a
 * quality-controlled JPEG, then saves with object streams. This is the lever
 * Acrobat's daily-use compression pulls for image-heavy / scanned PDFs and was
 * entirely absent (makeSearchablePdf actually INFLATES files). Vector-only PDFs
 * won't shrink much (and may grow) — the caller compares sizes and keeps the
 * smaller of {original, compressed}, so compression can never make a file
 * bigger. Reuses the same rasterize→re-embed mechanic as redaction/deskew.
 */
export async function compressPdf(
  srcBytes: ArrayBuffer,
  level: PdfCompressLevel = 'balanced',
  onProgress?: (page: number, total: number) => void,
): Promise<{ blob: Blob; ratio: number }> {
  const { PDFDocument } = await import('pdf-lib');

  // TEXT-PRESERVING path: re-serialize the original with object streams. No
  // rasterization → text stays selectable/searchable and vectors stay crisp.
  // Modest savings (structure only), but it's the honest "shrink without
  // destroying the document" mode rivals charge for.
  if (level === 'lossless') {
    onProgress?.(1, 1);
    const doc = await PDFDocument.load(srcBytes.slice(0), { ignoreEncryption: true });
    const result = await doc.save({ useObjectStreams: true });
    const out = new Blob([new Uint8Array(result)], { type: 'application/pdf' });
    if (out.size >= srcBytes.byteLength) {
      return { blob: new Blob([new Uint8Array(srcBytes.slice(0))], { type: 'application/pdf' }), ratio: 1 };
    }
    return { blob: out, ratio: out.size / srcBytes.byteLength };
  }

  const { rasterizePdf } = await import('@/engines/pdf/rasterize');
  const cfg = level === 'light' ? { maxEdge: 2200, quality: 0.85 }
    : level === 'strong' ? { maxEdge: 1400, quality: 0.6 }
    : { maxEdge: 1700, quality: 0.72 };
  const rasters = await rasterizePdf(srcBytes.slice(0), { maxEdge: cfg.maxEdge });
  const out = await PDFDocument.create();
  for (let i = 0; i < rasters.length; i++) {
    onProgress?.(i + 1, rasters.length);
    const ras = rasters[i];
    const page = out.addPage([ras.width, ras.height]);
    const blob = await new Promise<Blob>((res, rej) => ras.canvas.toBlob(b => b ? res(b) : rej(new Error('Could not encode page')), 'image/jpeg', cfg.quality));
    const img = await out.embedJpg(await blob.arrayBuffer());
    page.drawImage(img, { x: 0, y: 0, width: ras.width, height: ras.height });
  }
  const result = await out.save({ useObjectStreams: true });
  const compressed = new Blob([new Uint8Array(result)], { type: 'application/pdf' });
  // Never hand back a bigger file than we got.
  if (compressed.size >= srcBytes.byteLength) {
    return { blob: new Blob([new Uint8Array(srcBytes.slice(0))], { type: 'application/pdf' }), ratio: 1 };
  }
  return { blob: compressed, ratio: compressed.size / srcBytes.byteLength };
}

/**
 * Create REAL interactive AcroForm fields (fillable in any PDF reader) — text
 * fields, checkboxes, and signature placeholders — rather than drawing static
 * graphics. Uses pdf-lib's form API. The recipient can type into / check these
 * in Acrobat, Preview, browsers, etc. (For a flattened, non-editable stamp use
 * applyFormFieldsToPdf instead.)
 */
export async function applyInteractiveFormFields(srcBytes: ArrayBuffer, fields: PdfFormField[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const pagesById = new Map<string, any>();
  pages.forEach((p, i) => pagesById.set(`p${i + 1}`, p));
  let uniq = 0;
  for (const f of fields) {
    const page = pagesById.get(f.pageId) ?? pages[0];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const x = f.nx * W, w = f.nw * W, h = f.nh * H;
    const y = H - f.ny * H - h;
    const name = `${f.kind}_${f.id || ++uniq}`;
    try {
      if (f.kind === 'text') {
        const tf = form.createTextField(name);
        if (f.value) tf.setText(f.value);
        tf.addToPage(page, { x, y, width: w, height: h, borderWidth: 1, borderColor: rgb(0.6, 0.6, 0.6) });
      } else if (f.kind === 'checkbox') {
        const cb = form.createCheckBox(name);
        const s = Math.min(w, h, 18);
        cb.addToPage(page, { x, y, width: s, height: s, borderWidth: 1, borderColor: rgb(0.3, 0.3, 0.3) });
        if (f.checked) cb.check();
        if (f.label) page.drawText(f.label, { x: x + s + 6, y: y + (s - 10) / 2, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      } else if (f.kind === 'signature') {
        // pdf-lib has no native signature widget; use a text field as a
        // fill-in signature line + a visible dashed box.
        page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.8, borderDashArray: [4, 3] });
        const tf = form.createTextField(name);
        tf.addToPage(page, { x: x + 2, y: y + 2, width: w - 4, height: h - 4, borderWidth: 0 });
      }
    } catch { /* duplicate field name / unsupported — skip this one */ }
  }
  const out = await pdf.save();
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' });
}

export interface ImageToPdfInput { bytes: ArrayBuffer; type: string; name?: string }
export interface ImagesToPdfOptions {
  /** 'fit' = each page matches its image's pixel size; 'a4'/'letter' = fixed page
   *  with the image centred + scaled to fit inside the margins. */
  pageSize?: 'fit' | 'a4' | 'letter';
  orientation?: 'auto' | 'portrait' | 'landscape';
  /** Margin in points when using a fixed page size. */
  margin?: number;
  onProgress?: (done: number, total: number) => void;
}

// Standard page sizes in PDF points (1pt = 1/72").
const PAGE_SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/**
 * Combine images (JPEG/PNG, and other raster types via a canvas re-encode) into a
 * single PDF — one image per page. The reverse of "PDF → images". Common need
 * (scan a stack of photos/receipts into one document) that rivals all have.
 * Fully on-device.
 */
export async function imagesToPdf(images: ImageToPdfInput[], opts: ImagesToPdfOptions = {}): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const margin = opts.margin ?? 0;
  for (let i = 0; i < images.length; i++) {
    opts.onProgress?.(i + 1, images.length);
    const im = images[i];
    let bytes = im.bytes;
    let kind: 'png' | 'jpg' = /png/i.test(im.type) ? 'png' : 'jpg';
    // pdf-lib only embeds PNG + JPEG. Re-encode anything else (webp/gif/bmp/heic
    // that the browser can decode) to PNG via a canvas.
    if (!/png|jpe?g/i.test(im.type)) {
      const reenc = await reencodeToPng(bytes, im.type);
      if (!reenc) continue;
      bytes = reenc; kind = 'png';
    }
    let embedded;
    try { embedded = kind === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes); }
    catch {
      // Mislabelled type — try the other embedder, then a PNG re-encode.
      try { embedded = kind === 'png' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes); }
      catch { const re = await reencodeToPng(bytes, im.type); if (!re) continue; embedded = await pdf.embedPng(re); }
    }
    const iw = embedded.width, ih = embedded.height;
    if (opts.pageSize && opts.pageSize !== 'fit') {
      let [pw, ph] = PAGE_SIZES[opts.pageSize] ?? PAGE_SIZES.a4;
      const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && iw > ih);
      if (landscape) [pw, ph] = [ph, pw];
      const page = pdf.addPage([pw, ph]);
      const availW = pw - margin * 2, availH = ph - margin * 2;
      const scale = Math.min(availW / iw, availH / ih);
      const dw = iw * scale, dh = ih * scale;
      page.drawImage(embedded, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    } else {
      // Fit: page = image size (in points = pixels at 72dpi).
      const page = pdf.addPage([iw, ih]);
      page.drawImage(embedded, { x: 0, y: 0, width: iw, height: ih });
    }
  }
  if (pdf.getPageCount() === 0) throw new Error('No images could be added');
  const out = await pdf.save();
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' });
}

// Decode any browser-supported image and re-encode as PNG bytes (for formats
// pdf-lib can't embed natively). Returns null if the image can't be decoded.
async function reencodeToPng(bytes: ArrayBuffer, type: string): Promise<ArrayBuffer | null> {
  try {
    const blob = new Blob([bytes], { type: type || 'image/*' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 1; c.height = img.naturalHeight || 1;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const pngBlob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
      if (!pngBlob) return null;
      return await pngBlob.arrayBuffer();
    } finally { URL.revokeObjectURL(url); }
  } catch { return null; }
}

/**
 * REAL AES password protection (verified: produces an /Encrypt dict, content is
 * not stored in plaintext, and the file can't be opened without the password).
 * Uses the @cantoo/pdf-lib fork's encrypt() API. `userPassword` to open,
 * optional `ownerPassword` for permissions. This replaces the old facade
 * (markPdfRestricted) which only stamped a watermark.
 */
export async function encryptPdf(
  srcBytes: ArrayBuffer,
  userPassword: string,
  opts: { ownerPassword?: string; allowPrint?: boolean; allowCopy?: boolean } = {},
): Promise<Blob> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  pdf.encrypt({
    userPassword,
    ownerPassword: opts.ownerPassword || userPassword,
    permissions: {
      printing: opts.allowPrint === false ? undefined : 'highResolution',
      copying: opts.allowCopy === false ? undefined : true,
    },
  });
  const out = await pdf.save();
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' });
}

export async function applyFormFieldsToPdf(srcBytes: ArrayBuffer, fields: PdfFormField[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const pagesById = new Map<string, any>();
  pages.forEach((p, i) => pagesById.set(`p${i + 1}`, p));
  for (const f of fields) {
    const page = pagesById.get(f.pageId) ?? pages[0];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const x = f.nx * W;
    const yTop = f.ny * H;
    const w = f.nw * W;
    const h = f.nh * H;
    const y = H - yTop - h;
    if (f.kind === 'text') {
      page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.8, opacity: 0 });
      if (f.value) {
        page.drawText(f.value, { x: x + 4, y: y + Math.max(2, (h - 12) / 2), size: 11, font, color: rgb(0.05, 0.05, 0.05) });
      } else {
        page.drawText(f.label, { x: x + 4, y: y + Math.max(2, (h - 10) / 2), size: 9, font, color: rgb(0.65, 0.65, 0.65) });
      }
    } else if (f.kind === 'checkbox') {
      const boxSize = Math.min(w, h, 18);
      page.drawRectangle({ x, y, width: boxSize, height: boxSize, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 });
      if (f.checked) {
        page.drawText('✓', { x: x + 2, y: y + 2, size: boxSize - 4, font: fontBold, color: rgb(0.1, 0.7, 0.3) });
      }
      if (f.label) {
        page.drawText(f.label, { x: x + boxSize + 6, y: y + (boxSize - 10) / 2, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      }
    } else if (f.kind === 'signature') {
      page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.8, borderDashArray: [4, 3] });
      if (f.signatureBytes) {
        try {
          const sig = await pdf.embedPng(f.signatureBytes);
          page.drawImage(sig, { x: x + 4, y: y + 4, width: w - 8, height: h - 8 });
        } catch {}
      } else {
        page.drawText('Sign here', { x: x + 6, y: y + h / 2 - 5, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      }
    }
  }
  const out = await pdf.save();
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' });
}

/**
 * ⚠️ NOT ENCRYPTION. This only stamps a "password-protected" watermark and
 * renames the document title/subject — the PDF stays fully readable with no
 * password. Do NOT surface this as "password protect" / "encrypt" in any UI:
 * that would be a dangerous, false security claim. Kept only as a visual
 * "restricted — please don't share" marker. Real AES encryption needs a
 * qpdf/pdfcpu WASM lib (see STUDIO_ROADMAP.md Wave 0.3) and is not implemented
 * here. Renamed from `encryptPdfWithMetadata` so the name can't mislead.
 */
export async function markPdfRestricted(srcBytes: ArrayBuffer, security: PdfSecurity, watermarkText?: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  if (watermarkText) {
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const size = 14;
      const text = `${watermarkText} · password-protected`;
      page.drawText(text, {
        x: 20,
        y: 12,
        size,
        font,
        color: rgb(0.55, 0.55, 0.55),
        opacity: 0.5,
      });
    }
  }
  if (security.userPassword || security.ownerPassword) {
    pdf.setTitle((pdf.getTitle() ?? 'Document') + ' (password-protected)');
    pdf.setSubject(`Restricted access. Password required.`);
  }
  const out = await pdf.save();
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' });
}
