/**
 * Small on-device writers/readers behind the cross-category conversions in
 * lib/convert/matrix.ts (image → docx/ico/svg/html, text/doc → docx/epub/md/rtf,
 * json/yaml/xml ⇄ csv/xlsx, files → tar/gz, video → frame sequences,
 * audio → waveform / title card). No server, no new dependencies: fflate,
 * js-yaml and SheetJS are already in the bundle; the rest is plain code.
 */
import { zipSync, strToU8 } from 'fflate';

/* ------------------------------- paragraphs ------------------------------- */

export interface Para { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'pre' | 'pagebreak'; text: string }

// XML 1.0 forbids most C0 controls.
// eslint-disable-next-line no-control-regex
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const escXml = (s: string): string =>
  s.replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text / Markdown → paragraphs (blank line = new paragraph; `#` = heading). */
export function textToParas(text: string, markdown = false): Para[] {
  const out: Para[] = [];
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const b of blocks) {
    const t = b.replace(/\s+$/, '');
    if (!t.trim()) continue;
    if (markdown) {
      const h = /^(#{1,6})\s+(.*)$/.exec(t);
      if (h && !t.includes('\n')) { out.push({ kind: h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', text: h[2] }); continue; }
      if (/^```/.test(t)) { out.push({ kind: 'pre', text: t.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '') }); continue; }
      if (t.split('\n').every((l) => /^\s*([-*+]|\d+\.)\s+/.test(l))) {
        for (const l of t.split('\n')) out.push({ kind: 'li', text: l.replace(/^\s*([-*+]|\d+\.)\s+/, '') });
        continue;
      }
      out.push({ kind: 'p', text: t.replace(/\n/g, ' ').replace(/\*\*|__|`/g, '') });
      continue;
    }
    // Plain text keeps its line breaks (code, logs, poems).
    out.push({ kind: t.includes('\n') ? 'pre' : 'p', text: t });
  }
  return out;
}

/** HTML (from mammoth / office / epub extraction) → paragraphs. Browser-only (DOMParser). */
export function htmlToParas(html: string): Para[] {
  const doc = new DOMParser().parseFromString(/<body|<html/i.test(html) ? html : `<body>${html}</body>`, 'text/html');
  const out: Para[] = [];
  const BLOCK = /^(H[1-6]|P|LI|PRE|BLOCKQUOTE|TR|DT|DD|FIGCAPTION|CAPTION)$/;
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.tagName === 'SCRIPT' || c.tagName === 'STYLE') continue;
      if (BLOCK.test(c.tagName)) {
        const text = c.tagName === 'TR'
          ? Array.from(c.children).map((td) => (td.textContent || '').trim()).join('\t')
          : (c.textContent || '').replace(c.tagName === 'PRE' ? /$^/ : /\s+/g, ' ').trim();
        if (!text) continue;
        const k = c.tagName;
        out.push({ kind: k === 'H1' ? 'h1' : k === 'H2' ? 'h2' : /^H[3-6]$/.test(k) ? 'h3' : k === 'LI' ? 'li' : k === 'PRE' || k === 'TR' ? 'pre' : 'p', text });
      } else if (c.tagName === 'HR' && c.classList.contains('page')) {
        out.push({ kind: 'pagebreak', text: '' });
      } else {
        walk(c);
      }
    }
  };
  walk(doc.body);
  if (!out.length) {
    const t = (doc.body.textContent || '').trim();
    if (t) out.push(...textToParas(t));
  }
  return out;
}

export function parasToHtml(paras: Para[], title: string): string {
  const body: string[] = [];
  let inList = false;
  for (const p of paras) {
    if (p.kind === 'li' && !inList) { body.push('<ul>'); inList = true; }
    if (p.kind !== 'li' && inList) { body.push('</ul>'); inList = false; }
    const t = escXml(p.text);
    if (p.kind === 'pagebreak') body.push('<hr class="page"/>');
    else if (p.kind === 'pre') body.push(`<pre>${t}</pre>`);
    else if (p.kind === 'li') body.push(`<li>${t}</li>`);
    else body.push(`<${p.kind}>${t}</${p.kind}>`);
  }
  if (inList) body.push('</ul>');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escXml(title)}</title>`
    + '<style>body{max-width:46em;margin:2em auto;padding:0 1em;font:16px/1.55 Georgia,serif}pre{white-space:pre-wrap;font:13px/1.45 ui-monospace,Consolas,monospace}</style>'
    + `</head><body>\n${body.join('\n')}\n</body></html>`;
}

export function parasToMd(paras: Para[]): string {
  return paras.map((p) => {
    if (p.kind === 'h1') return `# ${p.text}`;
    if (p.kind === 'h2') return `## ${p.text}`;
    if (p.kind === 'h3') return `### ${p.text}`;
    if (p.kind === 'li') return `- ${p.text}`;
    if (p.kind === 'pre') return '```\n' + p.text + '\n```';
    if (p.kind === 'pagebreak') return '---';
    return p.text;
  }).join('\n\n') + '\n';
}

export function parasToRtf(paras: Para[]): string {
  const enc = (s: string) => {
    let o = '';
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch;
      else if (ch === '\n') o += '\\line ';
      else if (ch === '\t') o += '\\tab ';
      else if (c < 128) o += ch;
      else if (c < 0x10000) o += `\\u${c > 32767 ? c - 65536 : c}?`;
      else { // surrogate pair
        const hi = 0xd800 + ((c - 0x10000) >> 10), lo = 0xdc00 + ((c - 0x10000) & 0x3ff);
        o += `\\u${hi - 65536}?\\u${lo - 65536}?`;
      }
    }
    return o;
  };
  const body = paras.map((p) => {
    if (p.kind === 'pagebreak') return '\\page';
    if (p.kind === 'h1') return `{\\pard\\sb240\\sa120\\b\\fs36 ${enc(p.text)}\\par}`;
    if (p.kind === 'h2') return `{\\pard\\sb200\\sa100\\b\\fs30 ${enc(p.text)}\\par}`;
    if (p.kind === 'h3') return `{\\pard\\sb160\\sa80\\b\\fs26 ${enc(p.text)}\\par}`;
    if (p.kind === 'li') return `{\\pard\\li360\\sa80 \\bullet  ${enc(p.text)}\\par}`;
    if (p.kind === 'pre') return `{\\pard\\sa120\\f1\\fs20 ${enc(p.text)}\\par}`;
    return `{\\pard\\sa160 ${enc(p.text)}\\par}`;
  }).join('\n');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\froman Georgia;}{\\f1\\fmodern Consolas;}}\\fs24\n${body}\n}`;
}

/* ---------------------------------- DOCX ---------------------------------- */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

function docxPara(p: Para): string {
  if (p.kind === 'pagebreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const style = p.kind === 'h1' ? 'Heading1' : p.kind === 'h2' ? 'Heading2' : p.kind === 'h3' ? 'Heading3' : p.kind === 'pre' ? 'Code' : p.kind === 'li' ? 'ListBullet' : '';
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const text = p.kind === 'li' ? `• ${p.text}` : p.text;
  // Keep line breaks inside a paragraph (code / addresses).
  const runs = text.split('\n').map((l, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escXml(l)}</w:t>`).join('');
  return `<w:p>${pPr}<w:r>${runs}</w:r></w:p>`;
}

export interface DocxImage { data: Uint8Array; ext: 'png' | 'jpeg'; width: number; height: number }

/** Minimal valid .docx (A4) from paragraphs, optionally with one embedded picture first. */
export function buildDocx(paras: Para[], title: string, image?: DocxImage): Blob {
  let pic = '';
  if (image) {
    // Fit inside the A4 text area (6.27in × 9.69in); 96 dpi pixels → EMU.
    const EMU_PX = 9525, maxW = 6.2 * 914400, maxH = 9.4 * 914400;
    let cx = image.width * EMU_PX, cy = image.height * EMU_PX;
    const k = Math.min(1, maxW / cx, maxH / cy);
    cx = Math.round(cx * k); cy = Math.round(cy * k);
    pic = `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Picture 1"/>`
      + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
      + `<a:graphic><a:graphicData uri="${PIC_NS}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.${image.ext === 'jpeg' ? 'jpg' : 'png'}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  const body = pic + paras.map(docxPara).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}"><w:body>${body || '<w:p/>'}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const heading = (id: string, name: string, lvl: number, sz: number) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${lvl}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${heading('Heading1', 'heading 1', 0, 36)}${heading('Heading2', 'heading 2', 1, 30)}${heading('Heading3', 'heading 3', 2, 26)}
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="360"/></w:pPr></w:style>
</w:styles>`;
  const imgRel = image ? `<Relationship Id="rIdImg1" Type="${R_NS}/image" Target="media/image1.${image.ext === 'jpeg' ? 'jpg' : 'png'}"/>` : '';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escXml(title)}</dc:title></cp:coreProperties>`),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/styles" Target="styles.xml"/>${imgRel}</Relationships>`),
  };
  if (image) files[`word/media/image1.${image.ext === 'jpeg' ? 'jpg' : 'png'}`] = image.data;
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------------------------------- EPUB ---------------------------------- */

/** EPUB 3 (with an EPUB 2 NCX for older readers). Chapters split at every h1 (or ~200 paragraphs). */
export function buildEpub(paras: Para[], title: string): Blob {
  const chapters: Para[][] = [];
  let cur: Para[] = [];
  for (const p of paras) {
    if ((p.kind === 'h1' && cur.length) || cur.length >= 200) { chapters.push(cur); cur = []; }
    if (p.kind !== 'pagebreak') cur.push(p);
  }
  if (cur.length || !chapters.length) chapters.push(cur);
  const id = `urn:uuid:${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)}`;
  const chapTitle = (c: Para[], i: number) => (c.find((p) => /^h/.test(p.kind))?.text || `Part ${i + 1}`).slice(0, 120);
  const xhtml = (c: Para[], i: number) => {
    const inner = parasToHtml(c, chapTitle(c, i)).replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${escXml(chapTitle(c, i))}</title></head><body>${inner.replace(/<hr class="page"\/>/g, '')}</body></html>`;
  };
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  };
  const manifest: string[] = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'];
  const spine: string[] = [];
  const navLis: string[] = [];
  const ncx: string[] = [];
  chapters.forEach((c, i) => {
    const name = `ch${String(i + 1).padStart(3, '0')}.xhtml`;
    files[`OEBPS/${name}`] = strToU8(xhtml(c, i));
    manifest.push(`<item id="c${i}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${i}"/>`);
    navLis.push(`<li><a href="${name}">${escXml(chapTitle(c, i))}</a></li>`);
    ncx.push(`<navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${escXml(chapTitle(c, i))}</text></navLabel><content src="${name}"/></navPoint>`);
  });
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${escXml(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`);
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc"><ol>${navLis.join('')}</ol></nav></body></html>`);
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${escXml(title)}</text></docTitle><navMap>${ncx.join('')}</navMap></ncx>`);
  const zipped = zipSync(files as Parameters<typeof zipSync>[0], { level: 6 });
  return new Blob([zipped as BlobPart], { type: 'application/epub+zip' });
}

/* ----------------------------------- ICO ---------------------------------- */

/** Wrap PNG-encoded frames (each ≤ 256px) as a Windows .ico / .cur (PNG-in-ICO, Vista+). */
export function buildIco(frames: { png: Uint8Array; width: number; height: number }[], as: 'ico' | 'cur'): Uint8Array {
  const head = 6 + frames.length * 16;
  const total = head + frames.reduce((n, f) => n + f.png.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, as === 'ico' ? 1 : 2, true); dv.setUint16(4, frames.length, true);
  let off = head;
  frames.forEach((f, i) => {
    const o = 6 + i * 16;
    out[o] = f.width >= 256 ? 0 : f.width; out[o + 1] = f.height >= 256 ? 0 : f.height;
    out[o + 2] = 0; out[o + 3] = 0;
    dv.setUint16(o + 4, as === 'ico' ? 1 : 0, true);   // planes | hotspot x
    dv.setUint16(o + 6, as === 'ico' ? 32 : 0, true);  // bpp | hotspot y
    dv.setUint32(o + 8, f.png.length, true); dv.setUint32(o + 12, off, true);
    out.set(f.png, off); off += f.png.length;
  });
  return out;
}

/* ------------------------------- archives --------------------------------- */

/** POSIX ustar archive (names > 100 bytes use the prefix field, else are truncated to the base name). */
export function buildTar(files: { name: string; data: Uint8Array; mtime?: number }[]): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  const oct = (n: number, len: number) => n.toString(8).padStart(len - 1, '0') + '\0';
  for (const f of files) {
    const h = new Uint8Array(512);
    let name = f.name.replace(/^\/+/, ''), prefix = '';
    if (enc.encode(name).length > 100) {
      const cut = name.lastIndexOf('/', 154);
      if (cut > 0 && enc.encode(name.slice(cut + 1)).length <= 100) { prefix = name.slice(0, cut); name = name.slice(cut + 1); }
      else name = name.split('/').pop()!.slice(-100);
    }
    const put = (s: string, at: number, len: number) => h.set(enc.encode(s).slice(0, len), at);
    put(name, 0, 100); put(oct(0o644, 8), 100, 8); put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8);
    put(oct(f.data.length, 12), 124, 12); put(oct(Math.floor((f.mtime ?? Date.now()) / 1000), 12), 136, 12);
    h.fill(32, 148, 156); h[156] = 48; // '0' regular file
    put('ustar\x0000', 257, 8); put(prefix, 345, 155);
    let sum = 0; for (const b of h) sum += b;
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    blocks.push(h, f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let o = 0; for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}

/* ----------------------------- image streams ------------------------------ */

/** Split an ffmpeg `image2pipe` MJPEG stream into single JPEG files (SOI markers cannot occur in entropy data). */
export function splitJpegStream(buf: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let i = 0; i + 2 < buf.length; i++) if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) starts.push(i);
  return starts.map((s, i) => buf.subarray(s, i + 1 < starts.length ? starts[i + 1] : buf.length));
}

/** Split an ffmpeg `image2pipe` PNG stream by walking chunks to each IEND. */
export function splitPngStream(buf: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let start = 0;
  while (start + 8 <= buf.length) {
    let p = start + 8;
    let ended = false;
    while (p + 12 <= buf.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      p += 12 + len;
      if (type === 'IEND') { ended = true; break; }
    }
    if (!ended) break;
    out.push(buf.subarray(start, p));
    start = p;
  }
  return out;
}

/* ------------------------------ audio visuals ----------------------------- */

/** Draw a waveform of the decoded audio on a canvas (peaks per column). */
export function drawWaveform(ctx: CanvasRenderingContext2D, ab: AudioBuffer, x: number, y: number, w: number, h: number, color: string): void {
  const ch = ab.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / w));
  ctx.fillStyle = color;
  const mid = y + h / 2;
  for (let i = 0; i < w; i++) {
    let lo = 1, hi = -1;
    const s = i * step, e = Math.min(ch.length, s + step);
    for (let j = s; j < e; j += Math.max(1, (step / 64) | 0)) { const v = ch[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi < lo) continue;
    ctx.fillRect(x + i, mid - hi * (h / 2), 1, Math.max(1, (hi - lo) * (h / 2)));
  }
}

/* --------------------------- structured data ------------------------------ */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Parse json / yaml / xml text into a plain value. */
export async function parseStructured(text: string, ext: string): Promise<Json> {
  if (ext === 'json') return JSON.parse(text.replace(/^﻿/, ''));
  if (ext === 'yaml' || ext === 'yml') {
    const yaml = await import('js-yaml');
    return (yaml.load(text) ?? null) as Json;
  }
  if (ext === 'xml') return xmlToValue(text);
  throw new Error(`Cannot read .${ext} as data`);
}

function xmlToValue(text: string): Json {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('This XML is not well-formed.');
  const conv = (el: Element): Json => {
    const kids = Array.from(el.children);
    const attrs = Array.from(el.attributes);
    if (!kids.length && !attrs.length) return (el.textContent ?? '').trim();
    const o: { [k: string]: Json } = {};
    for (const a of attrs) o[`@${a.name}`] = a.value;
    for (const k of kids) {
      const v = conv(k);
      if (k.tagName in o) {
        const prev = o[k.tagName];
        o[k.tagName] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else o[k.tagName] = v;
    }
    const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
    if (txt) o['#text'] = txt;
    return o;
  };
  const root = doc.documentElement;
  return { [root.tagName]: conv(root) };
}

const xmlName = (k: string): string => {
  const n = k.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(n) ? n : `_${n}`;
};

/** Plain value → XML (arrays become repeated elements; `@attr` / `#text` keys round-trip). */
export function valueToXml(v: Json, rootName = 'root'): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const emit = (name: string, val: Json, ind: string) => {
    const tag = xmlName(name);
    if (Array.isArray(val)) {
      // A document needs ONE root: a top-level array becomes <name><item/>…</name>.
      if (!ind) { out.push(`<${tag}>`); for (const x of val) emit('item', x, '  '); out.push(`</${tag}>`); return; }
      for (const x of val) emit(name, x, ind);
      return;
    }
    if (val === null || typeof val !== 'object') { out.push(`${ind}<${tag}>${escXml(val == null ? '' : String(val))}</${tag}>`); return; }
    const attrs = Object.entries(val).filter(([k]) => k.startsWith('@')).map(([k, x]) => ` ${xmlName(k.slice(1))}="${escXml(String(x))}"`).join('');
    const kids = Object.entries(val).filter(([k]) => !k.startsWith('@') && k !== '#text');
    const text = typeof val['#text'] === 'string' ? escXml(val['#text'] as string) : '';
    if (!kids.length) { out.push(`${ind}<${tag}${attrs}>${text}</${tag}>`); return; }
    out.push(`${ind}<${tag}${attrs}>${text}`);
    for (const [k, x] of kids) emit(k, x, ind + '  ');
    out.push(`${ind}</${tag}>`);
  };
  // A single-key object is already rooted (e.g. what xmlToValue returns).
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1) {
    const [k, x] = Object.entries(v)[0];
    emit(k, x, '');
  } else emit(rootName, v, '');
  return out.join('\n') + '\n';
}

export async function valueToYaml(v: Json): Promise<string> {
  const yaml = await import('js-yaml');
  return yaml.dump(v, { lineWidth: 120, noRefs: true });
}

/** Best table view of any value: an array of objects (possibly nested one level down), else one flattened row. */
export function valueToRows(v: Json): Record<string, string | number | boolean | null>[] {
  const flat = (o: Json, pre = '', acc: Record<string, string | number | boolean | null> = {}) => {
    if (o === null || typeof o !== 'object') { acc[pre || 'value'] = o as string | number | boolean | null; return acc; }
    if (Array.isArray(o)) { acc[pre || 'value'] = JSON.stringify(o); return acc; }
    for (const [k, x] of Object.entries(o)) {
      const key = pre ? `${pre}.${k}` : k;
      if (x && typeof x === 'object' && !Array.isArray(x)) flat(x, key, acc);
      else acc[key] = Array.isArray(x) ? JSON.stringify(x) : (x as string | number | boolean | null);
    }
    return acc;
  };
  const findArray = (o: Json, depth: number): Json[] | null => {
    if (Array.isArray(o)) return o;
    if (o && typeof o === 'object' && depth < 3) {
      for (const x of Object.values(o)) { const a = findArray(x, depth + 1); if (a && a.length) return a; }
    }
    return null;
  };
  const arr = findArray(v, 0);
  if (arr) return arr.map((x) => flat(x));
  return [flat(v)];
}

export function rowsToMd(rows: Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (!cols.length) return '';
  const cell = (x: unknown) => (x == null ? '' : String(x)).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${cols.map(cell).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`)].join('\n') + '\n';
}
