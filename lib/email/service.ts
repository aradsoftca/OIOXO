/**
 * Email service — sends via the provider chain and records every attempt in the
 * Email table (migrated from France) for an audit trail. Send failures are
 * logged but never throw past the helpers, so an email outage can't break
 * registration / password reset.
 */

import { prisma } from '@/lib/db';
import { emailTemplates } from './templates';
import { sendEmailWithFallback, EMAIL_FROM, type EmailOptions } from './providers';

type EmailType =
  | 'VERIFICATION' | 'WELCOME' | 'SUBSCRIPTION' | 'TRANSACTIONAL'
  | 'PASSWORD_RESET' | 'SECURITY_ALERT' | 'MARKETING';

interface SendArgs extends EmailOptions {
  userId?: string;
  type?: EmailType;
}

export async function sendEmail(args: SendArgs): Promise<{ success: boolean; messageId?: string; provider?: string }> {
  // Honour marketing opt-out (essential/transactional mail always sends).
  if (args.type === 'MARKETING') {
    const u = await prisma.user.findUnique({ where: { email: args.to }, select: { marketingOptOut: true } });
    if (u?.marketingOptOut) return { success: false, provider: 'skipped-optout' };
  }

  const result = await sendEmailWithFallback({
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });

  // Best-effort audit log; never let logging failures bubble up.
  try {
    await prisma.email.create({
      data: {
        from: EMAIL_FROM,
        to: args.to,
        subject: args.subject,
        body: args.text || '',
        html: args.html,
        type: args.type || 'TRANSACTIONAL',
        status: result.success ? 'SENT' : 'FAILED',
        messageId: result.messageId,
        error: result.success ? null : result.error,
        sentAt: result.success ? new Date() : null,
        userId: args.userId,
      },
    });
  } catch (e) {
    console.error('[email] failed to log email row:', (e as Error).message);
  }

  if (!result.success) console.error(`[email] send failed (${result.provider}): ${result.error}`);
  return { success: result.success, messageId: result.messageId, provider: result.provider };
}

export async function sendVerificationEmail(email: string, token: string, name?: string) {
  // Link straight to the API route — it verifies then redirects to sign-in.
  const url = `${process.env.NEXTAUTH_URL}/api/auth/verify?token=${token}`;
  const t = emailTemplates.verification(url, name);
  return sendEmail({ to: email, subject: t.subject, html: t.html, text: t.text, type: 'VERIFICATION' });
}

export async function sendPasswordResetEmail(email: string, token: string, name?: string) {
  const url = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;
  const t = emailTemplates.passwordReset(url, name);
  return sendEmail({ to: email, subject: t.subject, html: t.html, text: t.text, type: 'PASSWORD_RESET' });
}

export async function sendWelcomeEmail(email: string, name?: string, userId?: string) {
  const t = emailTemplates.welcome(name);
  return sendEmail({ to: email, subject: t.subject, html: t.html, text: t.text, type: 'WELCOME', userId });
}

export async function sendTicketReplyEmail(
  email: string, name: string, ticketNumber: string | number, message: string, url: string, userId?: string,
) {
  const t = emailTemplates.ticketReply(ticketNumber, name, message, url);
  return sendEmail({ to: email, subject: t.subject, html: t.html, text: t.text, type: 'TRANSACTIONAL', userId });
}
