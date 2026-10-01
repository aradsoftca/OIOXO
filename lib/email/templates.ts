import { BRAND, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
/**
 * Minimal, inbox-friendly HTML email templates. Plain, single-column, inline
 * styles only — no external images or web fonts (those hurt deliverability).
 */

/** HTML-escape user-controlled strings before they hit any innerHTML interpolation
 *  inside an email body. Without this, an admin-typed ticket reply could ship
 *  arbitrary HTML (incl. tracking-pixel `<img>`) to the requester's inbox, and a
 *  display name from OAuth metadata could carry markup. Email clients are
 *  inconsistent about what they execute; better to be uniformly strict. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Brand accent (the purple of the site's Convert tiles) and neutral inbox-safe greys.
const ACCENT = '#7c3aed';
const INK = '#16131f';
const MUTED = '#5f5a6b';
const SUBTLE = '#8d889a';
// The site's real logo, served from the site (public/email-logo.png: logo.png at 300px, 2x for sharp screens; oioxo-logo.png on oioxo).
// The alt text shows the brand name if the mail client blocks images.
const LOGO_URL = `https://${BRAND_DOMAIN}/${IS_OIOXO ? 'oioxo-logo.png' : 'email-logo.png'}`;
const LOGO_W = 150;
const LOGO_H = 42;

/**
 * Light, table-based layout: renders the same in Gmail, Apple Mail and Outlook (which ignores
 * most div/flex CSS). `preheader` is the grey preview line the inbox shows after the subject.
 */
function shell(title: string, bodyHtml: string, preheader = ''): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2f8">
    <tr><td align="center" style="padding:36px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
        <tr><td style="padding:0 4px 18px">
          <a href="https://${BRAND_DOMAIN}" style="text-decoration:none">
            <img src="${LOGO_URL}" width="${LOGO_W}" height="${LOGO_H}" alt="${BRAND}" style="display:block;border:0;outline:none;height:${LOGO_H}px;width:${LOGO_W}px;font-size:20px;font-weight:800;color:${INK}">
          </a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:14px;border-top:4px solid ${ACCENT};padding:34px 30px 30px;box-shadow:0 1px 3px rgba(22,19,31,.06)">
          <h1 style="margin:0 0 16px;font-size:23px;line-height:1.3;font-weight:800;letter-spacing:-.01em;color:${INK}">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:22px 6px 0;font-size:12px;line-height:1.6;color:${SUBTLE};text-align:center">
          ${BRAND} &middot; files are processed on your device and never uploaded.<br>
          You received this email because of an action on <a href="https://${BRAND_DOMAIN}" style="color:${SUBTLE}">${BRAND_DOMAIN}</a>.
          If it wasn't you, you can safely ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr>
    <td style="border-radius:10px;background:${ACCENT}">
      <a href="${url}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a>
    </td></tr></table>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${MUTED}">${text}</p>`;
}

function note(text: string): string {
  return `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${SUBTLE}">${text}</p>`;
}

function fallbackLink(url: string): string {
  return `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #ece9f2;font-size:12px;line-height:1.6;color:${SUBTLE}">
    Button not working? Paste this link into your browser:<br>
    <a href="${url}" style="color:${ACCENT};word-break:break-all">${url}</a></div>`;
}

export const emailTemplates = {
  verification(url: string, name?: string) {
    const safeName = name ? ' ' + escHtml(name) : '';
    return {
      subject: `Confirm your email for ${BRAND}`,
      html: shell('Confirm your email', [
        p(`Hi${safeName}, welcome to ${BRAND}! Tap the button below to confirm your email address and activate your account.`),
        button(url, 'Confirm my email'),
        note('This link works once and expires in 24 hours.'),
        note(`Didn't create a ${BRAND} account? Ignore this email and no account will be activated.`),
        fallbackLink(url),
      ].join(''), `One tap to activate your ${BRAND} account.`),
      text: `Welcome to ${BRAND}! Confirm your email to activate your account: ${url}\n\nThis link works once and expires in 24 hours. Didn't create an account? Ignore this email.`,
    };
  },

  passwordReset(url: string, name?: string) {
    const safeName = name ? ' ' + escHtml(name) : '';
    return {
      subject: `Reset your password — ${BRAND}`,
      html: shell('Reset your password', [
        p(`Hi${safeName}, we received a request to reset your ${BRAND} password.`),
        button(url, 'Reset password'),
        note('This link expires in 1 hour. If you didn\'t request this, ignore this email — your password stays the same.'),
        fallbackLink(url),
      ].join(''), `Reset your ${BRAND} password.`),
      text: `Reset your ${BRAND} password: ${url} (expires in 1 hour)`,
    };
  },

  welcome(name?: string) {
    const safeName = name ? ' ' + escHtml(name) : '';
    return {
      subject: `Welcome to ${BRAND}`,
      html: shell('Welcome aboard', [
        p(`Hi${safeName}, your ${BRAND} account is ready. Convert files, edit images, and more — right in your browser.`),
        button(`https://${BRAND_DOMAIN}/tools`, 'Explore tools'),
      ].join('')),
      text: `Welcome to ${BRAND}! Explore tools: https://${BRAND_DOMAIN}/tools`,
    };
  },

  ticketReply(ticketNumber: string | number, name: string, message: string, url: string) {
    const safeName = name ? ' ' + escHtml(name) : '';
    const safeMsg = escHtml(message);
    return {
      subject: `Re: your support request #${ticketNumber} — ${BRAND}`,
      html: shell(`Reply to ticket #${ticketNumber}`, [
        p(`Hi${safeName}, our team replied to your support request:`),
        `<div style="background:#0f1115;border:1px solid #232733;border-radius:8px;padding:14px 16px;margin:0 0 16px;font-size:14px;line-height:1.6;color:#e7e9ee;white-space:pre-wrap">${safeMsg}</div>`,
        button(url, 'View conversation'),
      ].join('')),
      text: `Reply to your ${BRAND} ticket #${ticketNumber}:\n\n${message}\n\nView: ${url}`,
    };
  },
};
