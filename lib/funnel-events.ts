/** The only events /api/funnel accepts. Keep it short — each is a daily counter. */
export const FUNNEL_EVENTS = [
  'limit_hit',       // daily free limit reached (gate modal)
  'size_hit',        // file over the free size cap
  'nudge_shown',     // "remove the mark with Pro" toast shown
  'nudge_click',     // …and "Go Pro" clicked
  'pricing_view',    // /pricing opened
  'checkout_start',  // Stripe or crypto checkout started
  'paid',            // payment confirmed (server-side, from the webhooks)
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
