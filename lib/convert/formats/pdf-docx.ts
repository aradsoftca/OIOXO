/**
 * PDF → Word (.docx), entirely in the browser.
 *
 * pdf.js gives positioned text runs; we rebuild the reading flow:
 *   runs → lines (same baseline) → paragraphs (split on a vertical gap larger
 *   than normal line spacing, or a font-size change) → headings (paragraphs set
 *   clearly larger than the document's body size), with a page break between
 *   PDF pages. The .docx is a minimal WordprocessingML package zipped by fflate.
 *
 * Only the text layer is read: a scanned PDF (pictures of pages) has none, and
 * we say so instead of returning an empty document — it needs OCR first.
 */
import { zipSync, strToU8 } from 'fflate';

interface Run { str: string; x: number; y: number; w: number; size: number; font: string }
interface Line { text: string; x: number; y: number; size: number; bold: boolean }
export interface DocxPara { kind: 'h1' | 'h2' | 'p' | 'pagebreak'; text: string; bold?: boolean }

export class NoTextLayerError extends Error {
  constructor() {
    super('This PDF has no selectable text — it is probably scanned. Run it through PDF OCR (/tools/pdf-ocr) first, then convert the result to Word.');
    this.name = 'NoTextLayerError';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadPdfjs(): Promise<any> {
  const lib: any = await import('pdfjs-dist');
  try { lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; } catch { /* */ }
  return lib;
}

function runsToLines(runs: Run[], boldFonts: Set<string>): Line[] {
  const lines: Line[] = [];
  let cur: { runs: Run[]; y: number; size: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const rs = cur.runs.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const r of rs) {
      const gap = r.x - end;
      if (text && gap > r.size * 0.15 && !text.endsWith(' ') && !r.str.startsWith(' ')) text += ' ';
      text += r.str;
      end = r.x + r.w;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text) {
      const chars = rs.reduce((n, r) => n + r.str.length, 0) || 1;
      const boldChars = rs.filter((r) => boldFonts.has(r.font)).reduce((n, r) => n + r.str.length, 0);
      lines.push({ text, x: rs[0].x, y: cur.y, size: cur.size, bold: boldChars / chars > 0.6 });
    }
    cur = null;
  };
  for (const r of runs) {
    if (!r.str) continue;
    if (cur && Math.abs(r.y - cur.y) <= Math.max(cur.size, r.size) * 0.5) {
      cur.runs.push(r);
      if (r.str.trim()) cur.size = Math.max(cur.size, r.size);
    } else {
      flush();
      cur = { runs: [r], y: r.y, size: r.size };
    }
  }
  flush();
  return lines;
}

function joinLine(acc: string, next: string): string {
  // Re-join words hyphenated across a line break ("conver-" + "sion").
  if (/[A-Za-zÀ-ɏ]-$/.test(acc) && /^[a-zß-ɏ]/.test(next)) return acc.slice(0, -1) + next;
  return `${acc} ${next}`;
}

function linesToParas(lines: Line[], body: number): DocxPara[] {
  const out: DocxPara[] = [];
  let cur: { text: string; size: number; bold: boolean; lastY: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const ratio = cur.size / body;
    const short = cur.text.length <= 200;
    const kind: DocxPara['kind'] = short && ratio >= 1.6 ? 'h1' : short && ratio >= 1.2 ? 'h2' : 'p';
    out.push({ kind, text: cur.text, bold: kind === 'p' && cur.bold });
    cur = null;
  };
  for (const l of lines) {
    if (cur) {
      const gap = cur.lastY - l.y; // PDF y grows upward
      const sizeChange = Math.abs(l.size - cur.size) / cur.size > 0.15;
      const newBlock = gap < 0 || gap > Math.max(l.size, cur.size) * 1.75 || sizeChange || l.bold !== cur.bold;
      if (!newBlock) { cur.text = joinLine(cur.text, l.text); cur.lastY = l.y; continue; }
      flush();
    }
    cur = { text: l.text, size: l.size, bold: l.bold, lastY: l.y };
  }
  flush();
  return out;
}

export interface PdfLayout { paras: DocxPara[]; pageWidthPt: number; pageHeightPt: number }

export async function extractPdfLayout(buffer: ArrayBuffer, onProgress?: (ratio: number) => void): Promise<PdfLayout> {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: buffer.slice(0) }).promise;
  const pages: Line[][] = [];
  let pageWidthPt = 612;
  let pageHeightPt = 792;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (i === 1) {
        const vp = page.getViewport({ scale: 1 });
        pageWidthPt = vp.width; pageHeightPt = vp.height;
      }
      const content = await page.getTextContent();
      const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>;
      const boldFonts = new Set<string>();
      const runs: Run[] = [];
      for (const it of content.items as any[]) {
        if (typeof it.str !== 'string') continue;
        const [a, b, c, d, e, f] = it.transform as number[];
        const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10;
        const font = String(it.fontName ?? '');
        // pdf.js keeps the embedded name on the font object; loaded fonts expose it via commonObjs.
        let realName = '';
        try { realName = String(page.commonObjs.get(font)?.name ?? ''); } catch { /* not loaded yet */ }
        if (/bold|black|heavy|semibold/i.test(realName || styles[font]?.fontFamily || '')) boldFonts.add(font);
        runs.push({ str: it.str, x: e, y: f, w: it.width ?? 0, size, font });
      }
      pages.push(runsToLines(runs, boldFonts));
      page.cleanup();
      onProgress?.(i / doc.numPages);
    }
  } finally {
    try { doc.destroy(); } catch { /* */ }
  }

  const all = pages.flat();
  const chars = all.reduce((n, l) => n + l.text.length, 0);
  if (chars < Math.max(20, pages.length * 10)) throw new NoTextLayerError();

  // Body size = the size carrying the most characters (rounded to 0.5pt).
  const bySize = new Map<number, number>();
  for (const l of all) { const k = Math.round(l.size * 2) / 2; bySize.set(k, (bySize.get(k) ?? 0) + l.text.length); }
  const body = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0] || 11;

  const paras: DocxPara[] = [];
  pages.forEach((lines, i) => {
    if (i > 0) paras.push({ kind: 'pagebreak', text: '' });
    paras.push(...linesToParas(lines, body));
  });
  return { paras, pageWidthPt, pageHeightPt };
}

/* ------------------------------ OOXML writer ------------------------------ */

// XML 1.0 forbids most C0 controls; PDFs contain them surprisingly often.
// eslint-disable-next-line no-control-regex
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s: string): string =>
  s.replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paraXml(p: DocxPara): string {
  if (p.kind === 'pagebreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const style = p.kind === 'h1' ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : p.kind === 'h2' ? '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' : '';
  const rPr = p.bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p>${style}<w:r>${rPr}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function buildDocx(layout: PdfLayout, title = 'document'): Blob {
  const twW = Math.round(layout.pageWidthPt * 20);
  const twH = Math.round(layout.pageHeightPt * 20);
  const margin = Math.min(1440, Math.round(Math.min(twW, twH) * 0.1));
  const body = layout.paras.map(paraXml).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="${twW}" w:h="${twH}"${twW > twH ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
</w:styles>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  };
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export async function pdfToDocx(buffer: ArrayBuffer, title: string, onProgress?: (ratio: number) => void): Promise<Blob> {
  return buildDocx(await extractPdfLayout(buffer, onProgress), title);
}
