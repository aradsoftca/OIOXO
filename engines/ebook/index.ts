/**
 * Ebook engine — an EPUB is a ZIP of XHTML, so we read it with JSZip: follow
 * container.xml → the OPF spine → concatenate the chapters into one HTML
 * document. From there it's html/txt, or PDF via the document engine. No GPU,
 * no server, no extra dep beyond JSZip (already bundled).
 */

export interface EbookContent {
  title: string;
  html: string;
}

export async function epubToContent(file: File): Promise<EbookContent> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('This doesn’t look like a valid EPUB (no container.xml).');
  const container = await containerFile.async('string');
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) throw new Error('Could not find the EPUB content file.');

  const opf = await zip.file(opfPath)!.async('string');
  const baseDir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';

  const parser = new DOMParser();
  const opfDoc = parser.parseFromString(opf, 'application/xml');
  const title = opfDoc.querySelector('title')?.textContent?.trim() || file.name.replace(/\.[^.]+$/, '');

  // manifest id → href
  const manifest: Record<string, string> = {};
  opfDoc.querySelectorAll('manifest > item').forEach((it) => {
    const id = it.getAttribute('id'); const href = it.getAttribute('href');
    if (id && href) manifest[id] = href;
  });
  // spine order
  const spine: string[] = [];
  opfDoc.querySelectorAll('spine > itemref').forEach((r) => {
    const href = manifest[r.getAttribute('idref') || ''];
    if (href) spine.push(href);
  });

  let html = '';
  for (const href of spine) {
    const path = decodeURIComponent(baseDir + href);
    const f = zip.file(path);
    if (!f) continue;
    const raw = await f.async('string');
    const doc = parser.parseFromString(raw, 'text/html');
    const body = doc.querySelector('body');
    if (body) {
      // Drop images/links to assets we can't resolve from the zip cleanly.
      body.querySelectorAll('img, image, svg, script, style, link').forEach((el) => el.remove());
      html += `<section>${body.innerHTML}</section>\n`;
    }
  }
  if (!html.trim()) throw new Error('No readable text found in this EPUB.');
  return { title, html };
}

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Insert line breaks for block elements before reading textContent.
  doc.querySelectorAll('p, div, br, h1, h2, h3, h4, h5, h6, li, section').forEach((el) => {
    el.appendChild(doc.createTextNode('\n'));
  });
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
