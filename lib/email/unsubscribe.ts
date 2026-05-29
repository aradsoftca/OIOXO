import crypto from 'crypto';
import { BRAND_DOMAIN } from '@/lib/brand';

/**
 * Stateless unsubscribe token: HMAC(email) with NEXTAUTH_SECRET. Lets an email
 * footer carry a tamper-proof one-click unsubscribe link without storing tokens.
 */
function secret(): string {
  const v = process.env.NEXTAUTH_SECRET;
  // Hardcoded fallback in production would let anyone forge a valid token
  // (the fallback is in the source) and opt arbitrary users out of marketing
  // mail. Hard-fail at first use in prod; dev still gets the placeholder.
  if (!v && process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET must be set in production — see lib/email/unsubscribe.ts');
  }
  return v || 'xonvert-unsub-fallback';
}

export function unsubscribeToken(email: string): string {
  return crypto.createHmac('sha256', secret()).update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  // constant-time compare
  try {
    return token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Build the full unsubscribe URL to drop into marketing email footers. */
export function unsubscribeUrl(email: string): string {
  const base = process.env.NEXTAUTH_URL || `https://${BRAND_DOMAIN}`;
  return `${base}/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken(email)}`;
}
