import Stripe from 'stripe';

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

/** Display prices (USD). Keep in sync with the Stripe products. */
export const PRO_PRICING = { monthly: 4.99, yearly: 49.99 } as const;
