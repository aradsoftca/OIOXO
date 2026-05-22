// Alias of /api/stripe/webhook. The old France app exposed the Stripe webhook
// at BOTH /api/stripe/webhook and /api/webhooks/stripe; we don't know which URL
// the live Stripe dashboard endpoint targets, so we serve both with the same
// handler + signing secret. Safe to keep — Stripe only calls the configured one.
export { POST } from '@/app/api/stripe/webhook/route';
export const runtime = 'nodejs';
