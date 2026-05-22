/**
 * Tiny regex-based HTML inspection helpers. Not a full parser — enough to pull
 * meta/headings/links out of pasted HTML for SEO tools.
 */

export interface MetaTag {
  name?: string;
  property?: string;
  content?: string;
  charset?: string;
  httpEquiv?: string;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

export function extractTitle(html: string): string {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : '';
}

export function extractMeta(html: string): MetaTag[] {
  const out: MetaTag[] = [];
  const re = /<meta\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1]);
    out.push({
      name:      attrs['name'],
      property:  attrs['property'],
      content:   attrs['content'],
      charset:   attrs['charset'],
      httpEquiv: attrs['http-equiv'],
    });
  }
  return out;
}

export interface Heading { level: number; text: string }

export function extractHeadings(html: string): Heading[] {
  const out: Heading[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({
      level: Number(m[1]),
      text:  m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

export function extractLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  }
  return out;
}
