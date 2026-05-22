/**
 * Light office engine — no LibreOffice, no 300 MB WASM. Modern OOXML/ODF are
 * just ZIPs of XML (read with JSZip); legacy .doc/.ppt are OLE2 compound files
 * (cracked open with the tiny `cfb` reader, then best-effort text extraction).
 * Everything returns { title, html } so the existing htmlToPdf / plain-text
 * paths can finish the job.
 */

export interface OfficeContent { title: string; html: string }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

// --- ODF (.odt / .odp) — content.xml holds the text -------------------------
async function odfToContent(file: File): Promise<OfficeContent> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file('content.xml');
  if (!entry) throw new Error('Not a valid OpenDocument file (no content.xml).');
  const xml = await entry.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const isPresentation = doc.getElementsByTagName('draw:page').length > 0;
  const parts: string[] = [];
  if (isPresentation) {
    const pages = Array.from(doc.getElementsByTagName('draw:page'));
    pages.forEach((page, i) => {
      const paras = Array.from(page.getElementsByTagName('text:p'))
        .map((p) => p.textContent?.trim()).filter(Boolean);
      parts.push(`<section><h2>Slide ${i + 1}</h2>${paras.map((t) => `<p>${esc(t!)}</p>`).join('')}</section>`);
    });
  } else {
    const body = doc.getElementsByTagName('office:text')[0] || doc.documentElement;
    for (const el of Array.from(body.getElementsByTagName('*'))) {
      const ln = el.localName;
      if (ln === 'h') parts.push(`<h2>${esc(el.textContent?.trim() || '')}</h2>`);
      else if (ln === 'p') { const t = el.textContent?.trim(); if (t) parts.push(`<p>${esc(t)}</p>`); }
    }
  }
  if (!parts.length) throw new Error('No readable text found in this document.');
  return { title: baseName(file), html: parts.join('\n') };
}

// --- PPTX — ppt/slides/slideN.xml, text in <a:t> runs -----------------------
async function pptxToContent(file: File): Promise<OfficeContent> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const slidePaths = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/(\d+)/)![1]) - parseInt(b.match(/(\d+)/)![1])));
  if (!slidePaths.length) throw new Error('No slides found in this presentation.');
  const parts: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i])!.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const runs = Array.from(doc.getElementsByTagName('a:t')).map((t) => t.textContent || '').filter(Boolean);
    parts.push(`<section><h2>Slide ${i + 1}</h2>${runs.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`);
  }
  return { title: baseName(file), html: parts.join('\n') };
}

// --- Legacy OLE2 (.doc / .ppt) via cfb --------------------------------------
async function readStream(file: File, names: string[]): Promise<Uint8Array | null> {
  const CFB = await import('cfb');
  const container = (CFB as { read: (d: Uint8Array, o: unknown) => unknown }).read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  for (const n of names) {
    const found = (CFB as { find: (c: unknown, n: string) => { content?: Uint8Array } | null }).find(container, n);
    if (found?.content) return found.content as Uint8Array;
  }
  return null;
}

/** Best-effort: pull readable text runs out of a binary stream (UTF-16LE + ASCII). */
function scavengeText(data: Uint8Array): string {
  const out: string[] = [];
  // UTF-16LE runs
  let cur = '';
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = data[i] | (data[i + 1] << 8);
    if (code === 0x0d || code === 0x0a) { if (cur.trim().length > 1) out.push(cur.trim()); cur = ''; }
    else if ((code >= 32 && code < 0xd800) || code === 9) cur += String.fromCharCode(code);
    else { if (cur.trim().length > 3) out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim().length > 3) out.push(cur.trim());
  const joined = out.join('\n');
  // If UTF-16 yielded little, try ASCII scan as a fallback.
  if (joined.replace(/\s/g, '').length < 20) {
    let a = ''; const al: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (c === 0x0d || c === 0x0a) { if (a.trim().length > 3) al.push(a.trim()); a = ''; }
      else if (c >= 32 && c < 127) a += String.fromCharCode(c);
      else { if (a.trim().length > 3) al.push(a.trim()); a = ''; }
    }
    if (a.trim().length > 3) al.push(a.trim());
    return al.join('\n');
  }
  return joined;
}

async function docLegacyToContent(file: File): Promise<OfficeContent> {
  const wd = await readStream(file, ['WordDocument']);
  if (!wd) throw new Error('Could not read this .doc file.');
  const text = scavengeText(wd);
  if (!text.trim()) throw new Error('No readable text found in this .doc file.');
  const html = text.split(/\n+/).map((line) => `<p>${esc(line)}</p>`).join('\n');
  return { title: baseName(file), html };
}

async function pptLegacyToContent(file: File): Promise<OfficeContent> {
  const data = await readStream(file, ['PowerPoint Document', 'PowerPoint Document Stream']);
  if (!data) throw new Error('Could not read this .ppt file.');
  // Walk the PPT record tree; collect TextCharsAtom (0x0FA0) + TextBytesAtom (0x0FA8).
  const chunks: string[] = [];
  const walk = (start: number, end: number) => {
    let i = start;
    while (i + 8 <= end) {
      const recVer = data[i] & 0x0f;
      const recType = data[i + 2] | (data[i + 3] << 8);
      const recLen = data[i + 4] | (data[i + 5] << 8) | (data[i + 6] << 16) | (data[i + 7] << 24);
      const bodyStart = i + 8;
      const bodyEnd = Math.min(end, bodyStart + recLen);
      if (recVer === 0xf) {
        walk(bodyStart, bodyEnd); // container
      } else if (recType === 0x0fa0) { // TextCharsAtom = UTF-16LE
        let s = '';
        for (let j = bodyStart; j + 1 < bodyEnd; j += 2) { const c = data[j] | (data[j + 1] << 8); s += c === 0x0b ? '\n' : String.fromCharCode(c); }
        if (s.trim()) chunks.push(s.trim());
      } else if (recType === 0x0fa8) { // TextBytesAtom = ASCII
        let s = '';
        for (let j = bodyStart; j < bodyEnd; j++) { const c = data[j]; s += c === 0x0b ? '\n' : String.fromCharCode(c); }
        if (s.trim()) chunks.push(s.trim());
      }
      i = bodyStart + recLen;
    }
  };
  walk(0, data.length);
  if (!chunks.length) throw new Error('No readable text found in this .ppt file.');
  const html = chunks.map((t, i) => `<section><h2>Block ${i + 1}</h2><p>${esc(t).replace(/\n/g, '<br/>')}</p></section>`).join('\n');
  return { title: baseName(file), html };
}

/** Unified entry: ext → { title, html }. (docx handled by engines/document.) */
export async function officeToContent(file: File, ext: string): Promise<OfficeContent> {
  if (ext === 'odt' || ext === 'odp') return odfToContent(file);
  if (ext === 'pptx') return pptxToContent(file);
  if (ext === 'doc') return docLegacyToContent(file);
  if (ext === 'ppt') return pptLegacyToContent(file);
  throw new Error(`Unsupported office format: .${ext}`);
}
