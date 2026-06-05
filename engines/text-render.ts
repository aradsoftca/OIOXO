/**
 * "Impossible" conversions: render any text-like document (txt, md, rtf, csv,
 * json, xml, html, log, code…) into a real IMAGE or PDF — entirely in the browser.
 * From there it bridges to anything (image → video/pdf already exist), so e.g.
 * rtf → avi becomes: rtf → text → image → video.
 *
 * Plain renderers: monospace, word-wrapped, dark-on-light, paginated. No layout
 * engine — just legible, faithful text. RTF is reduced to its plain text first.
 */

/** Strip RTF control words / groups down to readable plain text. */
export function rtfToText(rtf: string): string {
  let s = rtf;
  s = s.replace(/\\par[d]?/g, '\n').replace(/\\tab/g, '\t');
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(((+n) + 65536) % 65536));
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, ''); // other control words
  s = s.replace(/[{}]/g, '');               // group braces
  return s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Read a file to plain text, decoding RTF / stripping basic HTML tags. */
export async function fileToText(file: File, ext: string): Promise<string> {
  const raw = await file.text();
  if (ext === 'rtf') return rtfToText(raw);
  if (ext === 'html' || ext === 'htm') {
    return raw.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  return raw;
}

const FONT_PX = 15;
const LINE_H = 22;
const PAD = 28;
const WRAP_COLS = 92; // chars per line at this width

function wrap(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= WRAP_COLS) { out.push(raw); continue; }
    let line = raw;
    while (line.length > WRAP_COLS) {
      let cut = line.lastIndexOf(' ', WRAP_COLS);
      if (cut < WRAP_COLS * 0.6) cut = WRAP_COLS; // no good space → hard wrap
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^\s/, '');
    }
    out.push(line);
  }
  return out;
}

/** Render text to a PNG/JPEG image (one tall image; capped so it never explodes). */
export async function renderTextToImage(text: string, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  const lines = wrap(text).slice(0, 4000); // safety cap
  const width = 820;
  const height = Math.min(20000, PAD * 2 + Math.max(1, lines.length) * LINE_H);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#16181d';
  ctx.font = `${FONT_PX}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.textBaseline = 'top';
  let y = PAD;
  for (const ln of lines) { ctx.fillText(ln, PAD, y); y += LINE_H; if (y > height) break; }
  const q = type === 'image/jpeg' ? 0.92 : undefined;
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, q));
}

/** Render text to a paginated PDF (pdf-lib, monospace). */
export async function renderTextToPdf(text: string): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const size = 10, lh = 13, margin = 48;
  const pageW = 595, pageH = 842; // A4 pt
  const maxLines = Math.floor((pageH - margin * 2) / lh);
  const lines = wrap(text);
  for (let i = 0; i < Math.max(1, lines.length); i += maxLines) {
    const page = doc.addPage([pageW, pageH]);
    let y = pageH - margin;
    for (const ln of lines.slice(i, i + maxLines)) {
      // pdf-lib throws on chars outside WinAnsi — sanitize.
      const safe = ln.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '?');
      try { page.drawText(safe, { x: margin, y, size, font }); } catch { /* skip bad line */ }
      y -= lh;
    }
  }
  return new Blob([new Uint8Array(await doc.save())], { type: 'application/pdf' });
}
