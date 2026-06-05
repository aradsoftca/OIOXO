/**
 * Outlook .msg (compound binary) → eml / txt / html, in the browser.
 *
 * @kenjiuno/msgreader parses the OLE/CFB container that .msg uses and exposes
 * the subject, sender, recipients, body (plain + HTML) and attachments. We
 * reassemble that into a standard RFC-822 .eml (so it opens anywhere), or emit
 * just the readable text / HTML.
 */

interface MsgField {
  subject?: string;
  senderName?: string;
  senderEmail?: string;
  body?: string;
  bodyHtml?: string;
  headers?: string;
  recipients?: { name?: string; email?: string; smtpAddress?: string }[];
  attachments?: { fileName?: string; fileNameShort?: string }[];
}

async function parse(file: File): Promise<MsgField> {
  const { default: MsgReader } = await import('@kenjiuno/msgreader');
  const reader = new MsgReader(await file.arrayBuffer());
  return reader.getFileData() as MsgField;
}

function recipLine(d: MsgField): string {
  return (d.recipients || [])
    .map((r) => (r.name ? `${r.name} <${r.smtpAddress || r.email || ''}>` : (r.smtpAddress || r.email || '')))
    .filter(Boolean)
    .join(', ');
}

export async function msgToText(file: File): Promise<string> {
  const d = await parse(file);
  const head = [
    `From: ${d.senderName || ''} <${d.senderEmail || ''}>`,
    `To: ${recipLine(d)}`,
    `Subject: ${d.subject || ''}`,
  ];
  if (d.attachments?.length) head.push(`Attachments: ${d.attachments.map((a) => a.fileName || a.fileNameShort).filter(Boolean).join(', ')}`);
  return `${head.join('\n')}\n\n${d.body || ''}`.trim();
}

export async function msgToHtml(file: File): Promise<string> {
  const d = await parse(file);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Sanitize the .msg's HTML body — without this, opening the converted .html
  // executes any <script>/<img onerror> the sender embedded. Same XSS class
  // fixed in engines/email.ts (Pass 68). DOMParser-based sanitizer is safe
  // by construction (Pass 58 fix).
  let bodyHtml: string;
  if (d.bodyHtml) {
    try {
      const { sanitizeHtml } = await import('@/lib/safe-html');
      bodyHtml = sanitizeHtml(d.bodyHtml);
    } catch {
      bodyHtml = `<pre>${esc(d.bodyHtml)}</pre>`; // fail closed
    }
  } else {
    bodyHtml = `<pre>${esc(d.body || '')}</pre>`;
  }
  return `<!doctype html><meta charset="utf-8"><title>${esc(d.subject || 'Message')}</title>
<div style="font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px">
<table style="border-collapse:collapse;margin-bottom:16px;font-size:13px">
<tr><td style="color:#888;padding:2px 12px 2px 0">From</td><td>${esc(d.senderName || '')} &lt;${esc(d.senderEmail || '')}&gt;</td></tr>
<tr><td style="color:#888;padding:2px 12px 2px 0">To</td><td>${esc(recipLine(d))}</td></tr>
<tr><td style="color:#888;padding:2px 12px 2px 0">Subject</td><td><strong>${esc(d.subject || '')}</strong></td></tr>
</table><hr style="border:none;border-top:1px solid #eee">${bodyHtml}</div>`;
}

/** Reassemble the .msg into a standard RFC-822 .eml file. */
export async function msgToEml(file: File): Promise<string> {
  const d = await parse(file);
  // If the original transport headers survived, prefer them verbatim.
  const baseHeaders = d.headers?.trim();
  const date = new Date().toUTCString();
  const headers = baseHeaders || [
    `From: ${d.senderName ? `"${d.senderName}" ` : ''}<${d.senderEmail || 'unknown@localhost'}>`,
    `To: ${recipLine(d) || 'undisclosed-recipients:;'}`,
    `Subject: ${d.subject || ''}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
  ].join('\r\n');

  if (d.bodyHtml && d.body) {
    const b = `xon_${Math.random().toString(36).slice(2)}`;
    return [
      headers,
      `Content-Type: multipart/alternative; boundary="${b}"`, '',
      `--${b}`, 'Content-Type: text/plain; charset=utf-8', '', d.body, '',
      `--${b}`, 'Content-Type: text/html; charset=utf-8', '', d.bodyHtml, '',
      `--${b}--`, '',
    ].join('\r\n');
  }
  if (d.bodyHtml) return `${headers}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${d.bodyHtml}`;
  return `${headers}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${d.body || ''}`;
}
