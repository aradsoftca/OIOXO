/**
 * Document engine — spreadsheets via SheetJS, Word docs via mammoth, all in
 * the browser. No server, no GPU.
 */

export type SheetTarget = 'csv' | 'xlsx' | 'html' | 'json';

export interface SheetInfo { sheetNames: string[] }

/** Read a spreadsheet (xlsx/xls/ods/csv/…) and list its sheet names. */
export async function readWorkbook(file: File) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return { XLSX, wb, sheetNames: wb.SheetNames as string[] };
}

export async function convertSheet(file: File, target: SheetTarget, sheetName?: string): Promise<{ blob: Blob; ext: string }> {
  const { XLSX, wb } = await readWorkbook(file);
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (target === 'csv') {
    return { blob: new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv' }), ext: 'csv' };
  }
  if (target === 'html') {
    const body = XLSX.utils.sheet_to_html(ws);
    return { blob: new Blob([body], { type: 'text/html' }), ext: 'html' };
  }
  if (target === 'json') {
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    return { blob: new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), ext: 'json' };
  }
  // xlsx (e.g. from a csv/ods input)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), ext: 'xlsx' };
}

export async function docxToHtml(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const buf = await file.arrayBuffer();
  const res = await (mammoth as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).convertToHtml({ arrayBuffer: buf });
  return res.value;
}

export async function docxToText(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const buf = await file.arrayBuffer();
  const res = await (mammoth as { extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).extractRawText({ arrayBuffer: buf });
  return res.value;
}

/** Render an HTML string to a PDF Blob (rasterized, faithful layout). */
export async function htmlToPdf(html: string, title = 'document'): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { sanitizeHtml } = await import('@/lib/safe-html');
  // Render inside a blank, same-origin iframe: html2canvas 1.4.1 parses every
  // computed colour, and the site's global oklch() palette made it throw
  // "Attempting to parse an unsupported color function \"oklch\"" — doc, ebook
  // and slides → PDF all failed live. No site CSS in the frame = nothing to choke on.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const fdoc = frame.contentDocument!;
  fdoc.open(); fdoc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"></body></html>'); fdoc.close();
  const holder = fdoc.createElement('div');
  holder.style.cssText = 'width:794px;background:#fff;color:#000;padding:48px;font:14px/1.5 system-ui,Arial,sans-serif;';
  // Defence-in-depth: callers include converted-document content (docx/pptx/
  // office) whose authors are untrusted. Without sanitising, attaching the
  // node to document.body would execute any inline event handlers like
  // <img onerror=…> during the html→canvas walk. Sanitise here so every
  // caller is safe even if it skipped the step.
  holder.innerHTML = sanitizeHtml(html);
  fdoc.body.appendChild(holder);
  try {
    // html2canvas directly on the frame's node — jsPDF.html() clones it back into the
    // MAIN document, where the oklch() palette applies again (the iframe alone didn't help).
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(holder, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 24;
    const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
    const slicePx = Math.floor((pageH / pageW) * canvas.width); // canvas px per PDF page
    for (let y = 0, page = 0; y < canvas.height; y += slicePx, page++) {
      const h = Math.min(slicePx, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = h;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageW, (h / canvas.width) * pageW);
    }
    try { const { brandJsPdf } = await import('@/lib/watermark/download'); brandJsPdf(pdf); } catch { /* never break export */ }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

export async function docxToPdf(file: File): Promise<Blob> {
  const html = await docxToHtml(file);
  return htmlToPdf(html, file.name);
}

/**
 * Render plain text to a paginated PDF using pdf-lib only — no DOM, no
 * html2canvas, no rasterization. Fast, tiny output, selectable text, and it
 * runs on literally any device (and in Node). Used as the AI's default doc→PDF
 * so a conversion never stalls or OOMs a low-end phone. `htmlToPdf` remains the
 * full-fidelity path for the tool page.
 */
export async function textToPdf(text: string, title = 'document'): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  try { doc.setTitle(title); } catch { /* non-fatal */ }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 11, margin = 56, lineH = 15.5, pageW = 595.28, pageH = 841.89;
  const maxW = pageW - margin * 2;
  // StandardFonts encode WinAnsi only; replace anything outside it so a stray
  // emoji or CJK char can't throw and abort the whole conversion.
  const safe = (s: string) => s.replace(/[^\t\n\r\x20-\xFF]/g, '?');
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;
  const newline = () => { y -= lineH; if (y < margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; } };
  const draw = (ln: string) => { try { page.drawText(ln, { x: margin, y, size, font }); } catch { /* skip unencodable */ } newline(); };
  for (const raw of safe(text).split(/\r?\n/)) {
    const para = raw.replace(/\t/g, '    ');
    if (!para.trim()) { newline(); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      let width: number;
      try { width = font.widthOfTextAtSize(test, size); } catch { width = test.length * size * 0.5; }
      if (width > maxW && line) { draw(line); line = w; } else line = test;
    }
    if (line) draw(line);
  }
  const bytes = await doc.save();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buf], { type: 'application/pdf' });
}

/** Fast, universal docx→PDF for automated/AI use (text-based, no rasterization). */
export async function docxToPdfText(file: File): Promise<Blob> {
  return textToPdf(await docxToText(file), file.name);
}
