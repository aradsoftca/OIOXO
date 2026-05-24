import { BRAND, BRAND_DOMAIN } from '@/lib/brand';
/**
 * Transactional email senders — fetch-based, no SDK dependency.
 *
 * Resend is primary, Brevo is the fallback (both verified for noreply@xonvert.com
 * via DKIM). We keep the payload MINIMAL (no reply-to, no custom headers, no
 * tags) — that combination tested cleanly into the inbox on the old stack;
 * extra headers tripped spam filters.
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export const EMAIL_FROM = process.env.EMAIL_FROM || `${BRAND} <noreply@${BRAND_DOMAIN}>`;

async function sendViaResend(o: EmailOptions): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { success: false, provider: 'resend', error: 'RESEND_API_KEY not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: o.to, subject: o.subject, html: o.html, text: o.text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, provider: 'resend', error: data?.message || `HTTP ${res.status}` };
    return { success: true, provider: 'resend', messageId: data?.id };
  } catch (e) {
    return { success: false, provider: 'resend', error: (e as Error).message };
  }
}

async function sendViaBrevo(o: EmailOptions): Promise<EmailResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { success: false, provider: 'brevo', error: 'BREVO_API_KEY not set' };
  // Parse "Name <email>" → Brevo's structured sender.
  const m = EMAIL_FROM.match(/^\s*(.*?)\s*<(.+)>\s*$/);
  const sender = m ? { name: m[1] || `${BRAND}`, email: m[2] } : { name: `${BRAND}`, email: EMAIL_FROM };
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: o.to }],
        subject: o.subject,
        htmlContent: o.html,
        textContent: o.text || o.subject,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, provider: 'brevo', error: data?.message || `HTTP ${res.status}` };
    return { success: true, provider: 'brevo', messageId: data?.messageId };
  } catch (e) {
    return { success: false, provider: 'brevo', error: (e as Error).message };
  }
}

/** Try Resend, then Brevo. Returns the first success or the last error. */
export async function sendEmailWithFallback(o: EmailOptions): Promise<EmailResult> {
  const order = [sendViaResend, sendViaBrevo];
  let last: EmailResult = { success: false, provider: 'none', error: 'no provider configured' };
  for (const send of order) {
    last = await send(o);
    if (last.success) return last;
  }
  return last;
}
