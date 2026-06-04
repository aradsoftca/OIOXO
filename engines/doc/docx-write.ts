/**
 * Minimal DOCX writer — build a valid Word document from plain paragraphs,
 * in the browser (JSZip). Enough for "download translation as .docx": one
 * paragraph per line, Unicode-safe. No external dependency beyond JSZip.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

async function wrapDocx(body: string): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', RELS);
  zip.folder('word')!.file('document.xml', document);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export async function textToDocx(text: string): Promise<Blob> {
  const body = text.split('\n').map((p) =>
    `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`,
  ).join('');
  return wrapDocx(body);
}

// ---- Format-preserving HTML → DOCX (Wave 2) ---------------------------------
// Walks a contentEditable DOM and emits real OOXML runs so bold/italic/underline,
// headings, lists, alignment, and color survive — instead of dropping to plain
// text via innerText. Browser-only (uses DOMParser).

interface RunStyle { b?: boolean; i?: boolean; u?: boolean; color?: string; size?: number }

function runXml(text: string, s: RunStyle): string {
  if (!text) return '';
  const props: string[] = [];
  if (s.b) props.push('<w:b/>');
  if (s.i) props.push('<w:i/>');
  if (s.u) props.push('<w:u w:val="single"/>');
  if (s.color) props.push(`<w:color w:val="${s.color.replace('#', '')}"/>`);
  if (s.size) props.push(`<w:sz w:val="${Math.round(s.size * 2)}"/>`); // half-points
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

const HEADING_SZ: Record<string, number> = { H1: 28, H2: 22, H3: 18 };

function rgbToHex(v: string): string | undefined {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  if (!m) return /^#?[0-9a-f]{6}$/i.test(v) ? v.replace('#', '') : undefined;
  return [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

function collectRuns(node: Node, inherited: RunStyle, out: string[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) { // text
      out.push(runXml(child.textContent ?? '', inherited));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') { out.push('<w:r><w:br/></w:r>'); continue; }
    const s: RunStyle = { ...inherited };
    if (tag === 'B' || tag === 'STRONG' || +(el.style.fontWeight || 0) >= 600 || el.style.fontWeight === 'bold') s.b = true;
    if (tag === 'I' || tag === 'EM' || el.style.fontStyle === 'italic') s.i = true;
    if (tag === 'U' || el.style.textDecoration?.includes('underline')) s.u = true;
    if (el.style.color) { const h = rgbToHex(el.style.color); if (h) s.color = h; }
    collectRuns(el, s, out);
  }
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE']);

function blocksFromDom(root: HTMLElement): string[] {
  const out: string[] = [];
  const emit = (el: HTMLElement, listKind?: 'ul' | 'ol', idx = 0) => {
    const runs: string[] = [];
    const baseSize = HEADING_SZ[el.tagName];
    // List items get a literal bullet/number prefix run — avoids needing a
    // separate numbering.xml part while still rendering everywhere.
    if (listKind) runs.push(runXml(listKind === 'ol' ? `${idx + 1}. ` : '•  ', {}));
    collectRuns(el, baseSize ? { b: true, size: baseSize } : {}, runs);
    if (!runs.length) return;
    const align = el.style.textAlign || (el.getAttribute('align') ?? '');
    const jc = align === 'center' ? 'center' : align === 'right' ? 'right' : align === 'justify' ? 'both' : '';
    const pPr = [
      jc ? `<w:jc w:val="${jc}"/>` : '',
      listKind ? '<w:ind w:left="360"/>' : '',
    ].join('');
    out.push(`<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs.join('')}</w:p>`);
  };
  const walk = (node: HTMLElement) => {
    for (const child of Array.from(node.children) as HTMLElement[]) {
      if (child.tagName === 'UL' || child.tagName === 'OL') {
        const kind = child.tagName === 'OL' ? 'ol' : 'ul';
        const items = Array.from(child.children).filter(c => (c as HTMLElement).tagName === 'LI') as HTMLElement[];
        items.forEach((li, i) => emit(li, kind, i));
        continue;
      }
      if (BLOCK_TAGS.has(child.tagName)) emit(child);
      else walk(child);
    }
  };
  walk(root);
  if (!out.length) out.push(`<w:p>${runXml(root.innerText || '', {})}</w:p>`);
  return out;
}

/** Convert contentEditable HTML to a formatted .docx (runs, headings, lists). */
export async function htmlToDocx(html: string): Promise<Blob> {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const body = blocksFromDom(root).join('');
  return wrapDocx(body);
}
