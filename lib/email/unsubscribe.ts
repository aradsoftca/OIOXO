import crypto from 'crypto';

/**
 * Stateless unsubscribe token: HMAC(email) with NEXTAUTH_SECRET. Lets an email
 * footer carry a tamper-proof one-click unsubscribe link without storing tokens.
 */
function secret(): string {
  return process.env.NEXTAUTH_SECRET || 'xonvert-unsub-fallback';
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
  const base = process.env.NEXTAUTH_URL || 'https://xonvert.com';
  return `${base}/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken(email)}`;
}
