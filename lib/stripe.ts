import Stripe from 'stripe';
import { IS_OIOXO } from '@/lib/brand';

// Lazy init so production builds (which run Next "collect page data") don't
// crash when STRIPE_SECRET_KEY is not yet set in the build environment.
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  _stripe = new Stripe(key);
  return _stripe;
}

export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? '';
export const PRO_YEARLY_PRICE_ID = process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? '';

export function priceIdForBilling(billing: 'monthly' | 'yearly'): string {
  return billing === 'yearly' && PRO_YEARLY_PRICE_ID ? PRO_YEARLY_PRICE_ID : PRO_PRICE_ID;
}

/** Display prices (USD) PER BRAND — must match the brand's Stripe products
 *  (the actual charge uses STRIPE_PRO_PRICE_ID / STRIPE_PRO_YEARLY_PRICE_ID, set
 *  per deployment). Xonvert = the file-tools product; oioxo = the AI/coding
 *  platform (priced higher, still well under inference-paying incumbents because
 *  models run on the user's device → near-zero COGS). */
export const PRO_PRICING = { monthly: 4.99, yearly: 49.99 } as const;
export const OIOXO_PRO_PRICING = { monthly: 9.99, yearly: 99.99 } as const;

/** The prices to display for the current brand. */
export const DISPLAY_PRICING = IS_OIOXO ? OIOXO_PRO_PRICING : PRO_PRICING;

/** Stamped on every checkout. xonvert + oioxo share one Stripe account, so each
 *  webhook ignores sessions from the other product (else the email fallback
 *  could grant Pro here for a purchase made there). */
export const STRIPE_PRODUCT = (process.env.NEXT_PUBLIC_BRAND || 'Xonvert').toLowerCase() === 'oioxo' ? 'oioxo' : 'xonvert';
