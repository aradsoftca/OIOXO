export interface XlsxSheetData {
  name: string;
  cells: Record<string, { raw: string }>;
  cols: number;
  rows: number;
}

export interface XlsxWorkbookData {
  name: string;
  sheets: XlsxSheetData[];
}

function colToLetter(c: number): string {
  let s = '';
  c++;
  while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
function letterToCol(s: string): number {
  let c = 0;
  for (const ch of s.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}

export async function importXlsx(file: File | Blob): Promise<XlsxWorkbookData> {
  const XLSX = await import('xlsx');
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array', cellFormula: true, cellNF: false, cellStyles: false });
  const name = (file as File).name?.replace(/\.[^.]+$/, '') ?? 'Untitled';
  const sheets: XlsxSheetData[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const ref = ws['!ref'];
    if (!ref) { sheets.push({ name: sheetName, cells: {}, cols: 26, rows: 100 }); continue; }
    const range = XLSX.utils.decode_range(ref);
    const cells: Record<string, { raw: string }> = {};
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const raw = cell.f ? `=${cell.f}` : (cell.v != null ? String(cell.v) : '');
        if (raw === '') continue;
        cells[`${r}_${c}`] = { raw };
      }
    }
    sheets.push({
      name: sheetName,
      cells,
      cols: Math.max(26, range.e.c + 2),
      rows: Math.max(100, range.e.r + 5),
    });
  }
  return { name, sheets: sheets.length ? sheets : [{ name: 'Sheet 1', cells: {}, cols: 26, rows: 100 }] };
}

export async function exportXlsx(wb: XlsxWorkbookData): Promise<Blob> {
  const XLSX = await import('xlsx');
  const out = XLSX.utils.book_new();
  for (const sheet of wb.sheets) {
    const ws: any = {};
    let maxR = 0, maxC = 0;
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const [r, c] = key.split('_').map(Number);
      const addr = XLSX.utils.encode_cell({ r, c });
      if (r > maxR) maxR = r; if (c > maxC) maxC = c;
      const raw = cell.raw;
      if (raw.startsWith('=')) {
        ws[addr] = { t: 'n', f: raw.slice(1) };
      } else if (/^-?\d+(\.\d+)?$/.test(raw)) {
        ws[addr] = { t: 'n', v: parseFloat(raw) };
      } else if (/^(true|false)$/i.test(raw)) {
        ws[addr] = { t: 'b', v: /^true$/i.test(raw) };
      } else {
        ws[addr] = { t: 's', v: raw };
      }
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    XLSX.utils.book_append_sheet(out, ws, sheet.name.slice(0, 31));
  }
  const ab = XLSX.write(out, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function importDocx(file: File | Blob): Promise<{ name: string; html: string }> {
  const mammoth = (await import('mammoth/mammoth.browser.js' as any)) as any;
  const ab = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer: ab },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "b => strong", "i => em",
      ],
    },
  );
  const name = (file as File).name?.replace(/\.[^.]+$/, '') ?? 'Untitled';
  return { name, html: result.value };
}

export async function exportDocx(html: string, name = 'document'): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Parse via DOMParser instead of `innerHTML =`. Setting innerHTML on a
  // detached div still fires `onerror`/`onload`/`onanimationstart` handlers
  // on injected tags (Chrome and Firefox both spec this — the document is
  // ours; detachment doesn't disable image-load or animation triggers). A
  // malicious imported document (mammoth output from a hostile .docx) could
  // ship an `<img src=x onerror=fetch(...)>` payload and fire during export.
  // DOMParser('text/html') gives us the same tree without active-content
  // execution: image loads are inert, scripts never run.
  const tmp = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const paragraphs = htmlToDocxParagraphs(tmp);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${paragraphs.join('\n')}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;

  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels')!.file('.rels', rels);
  const wordFolder = zip.folder('word')!;
  wordFolder.file('document.xml', documentXml);
  wordFolder.file('styles.xml', styles);
  wordFolder.folder('_rels')!.file('document.xml.rels', documentRels);

  const ab = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function htmlToDocxParagraphs(root: Element): string[] {
  const out: string[] = [];
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const lvl = tag.charAt(1);
      out.push(`<w:p><w:pPr><w:pStyle w:val="Heading${lvl}"/></w:pPr>${runsForElement(el)}</w:p>`);
    } else if (tag === 'p') {
      out.push(`<w:p>${runsForElement(el)}</w:p>`);
    } else if (tag === 'blockquote') {
      out.push(`<w:p><w:pPr><w:ind w:left="720"/></w:pPr>${runsForElement(el)}</w:p>`);
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        out.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${tag === 'ol' ? '2' : '1'}"/></w:numPr></w:pPr>${runsForElement(li)}</w:p>`);
      }
    } else if (tag === 'pre') {
      out.push(`<w:p><w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:pPr>${runsForElement(el)}</w:p>`);
    } else if (tag === 'table') {
      const rows: string[] = [];
      for (const tr of Array.from(el.querySelectorAll('tr'))) {
        const cells: string[] = [];
        for (const td of Array.from(tr.children)) {
          cells.push(`<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p>${runsForElement(td)}</w:p></w:tc>`);
        }
        rows.push(`<w:tr>${cells.join('')}</w:tr>`);
      }
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${rows.join('')}</w:tbl>`);
    } else {
      for (const child of Array.from(el.children)) walk(child);
      if (!el.children.length && el.textContent?.trim()) {
        out.push(`<w:p>${runsForElement(el)}</w:p>`);
      }
    }
  };
  for (const child of Array.from(root.children)) walk(child);
  return out;
}

// Normalize a CSS colour (#rgb, #rrggbb, rgb(...)) to a 6-hex string, or '' if
// none/unparseable. Word's <w:color> + <w:highlight> need bare hex.
function cssColorToHex(c: string | undefined): string {
  if (!c) return '';
  const s = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split('').map(x => x + x).join('').toUpperCase();
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return '';
}

interface RunStyle { bold: boolean; italic: boolean; underline: boolean; color: string; highlight: string; strike: boolean; }

function runsForElement(el: Element): string {
  const runs: string[] = [];
  const walk = (node: Node, st: RunStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) return;
      const props: string[] = [];
      if (st.bold) props.push('<w:b/>');
      if (st.italic) props.push('<w:i/>');
      if (st.underline) props.push('<w:u w:val="single"/>');
      if (st.strike) props.push('<w:strike/>');
      if (st.color) props.push(`<w:color w:val="${st.color}"/>`);
      // Word highlight takes a named value OR a shading fill; use shading so any
      // hex colour survives (named set is tiny).
      if (st.highlight) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${st.highlight}"/>`);
      runs.push(`<w:r>${props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      const t = e.tagName.toLowerCase();
      const styleColor = cssColorToHex(e.style?.color);
      const styleBg = cssColorToHex(e.style?.backgroundColor);
      const next: RunStyle = {
        bold: st.bold || t === 'b' || t === 'strong' || /font-weight\s*:\s*(bold|[6-9]\d\d)/i.test(e.style?.fontWeight || ''),
        italic: st.italic || t === 'i' || t === 'em',
        underline: st.underline || t === 'u',
        strike: st.strike || t === 's' || t === 'strike' || t === 'del',
        color: styleColor || st.color,
        highlight: styleBg || st.highlight,
      };
      for (const c of Array.from(e.childNodes)) walk(c, next);
    }
  };
  const base: RunStyle = { bold: false, italic: false, underline: false, color: '', highlight: '', strike: false };
  for (const c of Array.from(el.childNodes)) walk(c, base);
  return runs.join('');
}

export interface PptxSlideData {
  background: string;
  texts: Array<{ x: number; y: number; w: number; h: number; text: string; size: number; color: string; bold: boolean; italic?: boolean; rotation?: number; align: 'left' | 'center' | 'right' }>;
  shapes: Array<{ kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; fill: string; rotation?: number }>;
}

export interface PptxData {
  name: string;
  width: number;
  height: number;
  slides: PptxSlideData[];
}

export async function exportPptx(deck: PptxData): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const emu = (px: number) => Math.round(px * 9525);
  const W = emu(deck.width), H = emu(deck.height);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${deck.slides.map((_, i) => `  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n')}
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${deck.slides.map((_, i) => `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('\n')}
</Relationships>`;

  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
${deck.slides.map((_, i) => `    <p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('\n')}
  </p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}"/>
  <p:notesSz cx="${H}" cy="${W}"/>
</p:presentation>`;

  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels')!.file('.rels', rels);
  const pptFolder = zip.folder('ppt')!;
  pptFolder.file('presentation.xml', presentation);
  pptFolder.folder('_rels')!.file('presentation.xml.rels', presentationRels);
  const slidesFolder = pptFolder.folder('slides')!;

  let shapeId = 1;
  for (let i = 0; i < deck.slides.length; i++) {
    const s = deck.slides[i];
    const shapesXml: string[] = [];
    for (const sh of s.shapes) {
      const fill = sh.fill.replace('#', '').padEnd(6, '0').slice(0, 6);
      shapesXml.push(`
      <p:sp>
        <p:nvSpPr><p:cNvPr id="${shapeId++}" name="Shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm${sh.rotation ? ` rot="${Math.round(sh.rotation * 60000)}"` : ''}><a:off x="${emu(sh.x)}" y="${emu(sh.y)}"/><a:ext cx="${emu(sh.w)}" cy="${emu(sh.h)}"/></a:xfrm>
          <a:prstGeom prst="${sh.kind === 'rect' ? 'rect' : 'ellipse'}"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>
        </p:spPr>
      </p:sp>`);
    }
    for (const t of s.texts) {
      const color = t.color.replace('#', '').padEnd(6, '0').slice(0, 6);
      // Emit italic (i="1") alongside bold; PowerPoint reads both on a:rPr.
      const lines = t.text.split('\n').map(line => `<a:p><a:pPr algn="${t.align === 'center' ? 'ctr' : t.align === 'right' ? 'r' : 'l'}"/><a:r><a:rPr lang="en-US" sz="${t.size * 100}" b="${t.bold ? 1 : 0}"${t.italic ? ' i="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`).join('');
      shapesXml.push(`
      <p:sp>
        <p:nvSpPr><p:cNvPr id="${shapeId++}" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm${t.rotation ? ` rot="${Math.round(t.rotation * 60000)}"` : ''}><a:off x="${emu(t.x)}" y="${emu(t.y)}"/><a:ext cx="${emu(t.w)}" cy="${emu(t.h)}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${lines}
        </p:txBody>
      </p:sp>`);
    }
    const bgColor = s.background.replace('#', '').padEnd(6, '0').slice(0, 6);
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapesXml.join('\n')}
    </p:spTree>
  </p:cSld>
</p:sld>`;
    slidesFolder.file(`slide${i + 1}.xml`, slideXml);
  }

  const ab = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
