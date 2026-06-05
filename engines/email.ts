/**
 * Email → html / txt / eml, in the browser.
 *
 *  • .eml  — a single RFC-822 message (postal-mime parses it).
 *  • .mbox — a concatenation of messages separated by "From " lines; we split
 *    it and parse each, emitting one combined HTML/text document (or for → eml,
 *    the first message, since .eml is single-message).
 *
 * postal-mime handles MIME multipart, transfer-encodings, charset decoding and
 * header word-decoding for us — no server, no third-party API.
 */

interface ParsedAddr { name?: string; address?: string }
interface Parsed {
  subject?: string;
  from?: ParsedAddr;
  to?: ParsedAddr[];
  date?: string;
  html?: string;
  text?: string;
  attachments?: { filename: string | null }[];
}

async function parseOne(raw: string | ArrayBuffer): Promise<Parsed> {
  const { default: PostalMime } = await import('postal-mime');
  return (await PostalMime.parse(raw)) as unknown as Parsed;
}

/** Split an mbox blob into individual raw messages. */
function splitMbox(text: string): string[] {
  // Messages begin at a line starting with "From " (the mbox envelope line).
  const parts = text.split(/\r?\n(?=From )/);
  // The first chunk also starts with "From " — strip that envelope line per msg.
  return parts.map((p) => p.replace(/^From .*\r?\n/, '')).filter((p) => p.trim());
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const addr = (a?: ParsedAddr) => a ? `${a.name ? a.name + ' ' : ''}<${a.address || ''}>` : '';
const addrs = (a?: ParsedAddr[]) => (a || []).map(addr).filter(Boolean).join(', ');

async function oneHtml(m: Parsed): Promise<string> {
  // Sanitize the email's HTML body — postal-mime preserves whatever the
  // sender shipped, so <script>, <img onerror>, etc. would execute when
  // the user later opens the downloaded .html file in a browser. Same
  // XSS-via-converter class as doc-convert / ebook-convert.
  let body: string;
  if (m.html) {
    let safe = m.html;
    try {
      const { sanitizeHtml } = await import('@/lib/safe-html');
      safe = sanitizeHtml(m.html);
    } catch { /* fall back to raw on import failure */ }
    body = safe;
  } else {
    body = `<pre style="white-space:pre-wrap">${esc(m.text || '')}</pre>`;
  }
  return `<table style="border-collapse:collapse;margin-bottom:12px;font-size:13px">
<tr><td style="color:#888;padding:2px 12px 2px 0">From</td><td>${esc(addr(m.from))}</td></tr>
<tr><td style="color:#888;padding:2px 12px 2px 0">To</td><td>${esc(addrs(m.to))}</td></tr>
<tr><td style="color:#888;padding:2px 12px 2px 0">Date</td><td>${esc(m.date || '')}</td></tr>
<tr><td style="color:#888;padding:2px 12px 2px 0">Subject</td><td><strong>${esc(m.subject || '')}</strong></td></tr>
</table>${body}`;
}

function oneText(m: Parsed): string {
  return [
    `From: ${addr(m.from)}`, `To: ${addrs(m.to)}`, `Date: ${m.date || ''}`,
    `Subject: ${m.subject || ''}`, '', m.text || stripHtml(m.html || ''),
  ].join('\n');
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export async function emailToHtml(file: File, ext: string): Promise<string> {
  const wrap = (inner: string) =>
    `<!doctype html><meta charset="utf-8"><title>Email</title><div style="font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px">${inner}</div>`;
  if (ext === 'mbox') {
    const msgs = splitMbox(await file.text());
    const parsed = await Promise.all(msgs.map((m) => parseOne(m)));
    const htmls = await Promise.all(parsed.map(oneHtml));
    return wrap(htmls.join('<hr style="border:none;border-top:2px solid #ddd;margin:28px 0">'));
  }
  return wrap(await oneHtml(await parseOne(await file.arrayBuffer())));
}

export async function emailToText(file: File, ext: string): Promise<string> {
  if (ext === 'mbox') {
    const msgs = splitMbox(await file.text());
    const parsed = await Promise.all(msgs.map((m) => parseOne(m)));
    return parsed.map(oneText).join('\n\n———\n\n');
  }
  return oneText(await parseOne(await file.arrayBuffer()));
}

/** mbox → eml: emit the first message as a standalone .eml (eml is single-message). */
export async function mboxToEml(file: File): Promise<string> {
  const msgs = splitMbox(await file.text());
  return msgs[0] ?? '';
}
