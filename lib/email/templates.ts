import { BRAND, BRAND_DOMAIN } from '@/lib/brand';
/**
 * Minimal, inbox-friendly HTML email templates. Plain, single-column, inline
 * styles only — no external images or web fonts (those hurt deliverability).
 */

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#0f1115;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e7e9ee">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:18px;font-weight:700;letter-spacing:-.01em;color:#fff;margin-bottom:24px">${BRAND}</div>
    <div style="background:#171a21;border:1px solid #232733;border-radius:10px;padding:28px 24px">
      <h1 style="margin:0 0 14px;font-size:19px;font-weight:700;color:#fff">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="margin-top:20px;font-size:11px;color:#6b7280;line-height:1.6">
      You received this email from ${BRAND}. If you didn't request it, you can safely ignore it.
    </div>
  </div>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">${label}</a>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#c4c9d4">${text}</p>`;
}

function fallbackLink(url: string): string {
  return `<p style="margin:18px 0 0;font-size:12px;color:#6b7280;word-break:break-all">Or paste this link into your browser:<br>${url}</p>`;
}

export const emailTemplates = {
  verification(url: string, name?: string) {
    return {
      subject: `Verify your email — ${BRAND}`,
      html: shell('Verify your email', [
        p(`Hi${name ? ' ' + name : ''}, welcome to ${BRAND}. Confirm your email to activate your account.`),
        button(url, 'Verify email'),
        p('<br>This link expires in 24 hours.'),
        fallbackLink(url),
      ].join('')),
      text: `Verify your email for ${BRAND}: ${url} (expires in 24 hours)`,
    };
  },

  passwordReset(url: string, name?: string) {
    return {
      subject: `Reset your password — ${BRAND}`,
      html: shell('Reset your password', [
        p(`Hi${name ? ' ' + name : ''}, we received a request to reset your ${BRAND} password.`),
        button(url, 'Reset password'),
        p('<br>This link expires in 1 hour. If you didn\'t request this, ignore this email — your password stays the same.'),
        fallbackLink(url),
      ].join('')),
      text: `Reset your ${BRAND} password: ${url} (expires in 1 hour)`,
    };
  },

  welcome(name?: string) {
    return {
      subject: `Welcome to ${BRAND}`,
      html: shell('Welcome aboard', [
        p(`Hi${name ? ' ' + name : ''}, your ${BRAND} account is ready. Convert files, edit images, and more — right in your browser.`),
        button(`https://${BRAND_DOMAIN}/tools`, 'Explore tools'),
      ].join('')),
      text: `Welcome to ${BRAND}! Explore tools: https://${BRAND_DOMAIN}/tools`,
    };
  },

  ticketReply(ticketNumber: string | number, name: string, message: string, url: string) {
    return {
      subject: `Re: your support request #${ticketNumber} — ${BRAND}`,
      html: shell(`Reply to ticket #${ticketNumber}`, [
        p(`Hi${name ? ' ' + name : ''}, our team replied to your support request:`),
        `<div style="background:#0f1115;border:1px solid #232733;border-radius:8px;padding:14px 16px;margin:0 0 16px;font-size:14px;line-height:1.6;color:#e7e9ee;white-space:pre-wrap">${message}</div>`,
        button(url, 'View conversation'),
      ].join('')),
      text: `Reply to your ${BRAND} ticket #${ticketNumber}:\n\n${message}\n\nView: ${url}`,
    };
  },
};
