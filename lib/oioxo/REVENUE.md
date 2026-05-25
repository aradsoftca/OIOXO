# oioxo revenue — status & the one config step

The whole subscription chain is **wired and verified in code**:

```
PricingClient "Upgrade" → POST /api/stripe/checkout (subscription session)
  → Stripe hosted checkout → webhook (checkout.session.completed)
  → prisma.user.plan = 'PRO'  (and 'FREE' on subscription.deleted)
  → POST /api/entitlement reads plan → signs a device-bound entitlement
  → useEntitlement() → the IDE unlocks Pro features
```

## The free → Pro boundary (in the IDE)
- **Free:** the full IDE on-device — all 5 runtimes (web/React/Node/Python/SQL),
  live preview, the agent loop (single-draft), GitHub, share + live co-edit,
  sessions. Genuinely useful, nothing crippled.
- **Pro:** **Thorough** builds (best-of-N per step, oracle-ranked → higher success),
  the strongest on-device models, and the **specialized conductor** (gated via
  `configureConductor({ entitled })`, see CONDUCTOR_SERVING.md).

Implemented in `app/oioxo/NewProject.tsx` (AgentRun): tier chip, Pro-only
"Thorough" toggle (`candidates: 3`), and an "→ Pro" nudge for free users.

## The ONE remaining step (ops, not code) — set the oioxo price IDs
`/api/stripe/checkout` charges `STRIPE_PRO_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID`
(env). The display price for oioxo is $9.99 / $99.99 (`OIOXO_PRO_PRICING` in
lib/stripe.ts), but the **actual charge uses whatever price IDs are in the oioxo
deployment's env**. So in Stripe:

1. Create an **oioxo Pro** product with a $9.99/mo and $99.99/yr price.
2. Put those price IDs in the oioxo deployment's `.env.deploy.local`:
   - `STRIPE_PRO_PRICE_ID=price_…monthly`
   - `STRIPE_PRO_YEARLY_PRICE_ID=price_…yearly`
3. Ensure `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are the oioxo account's,
   and the Stripe webhook points at `https://oioxo.com/api/stripe/webhook`.

Until those price IDs are oioxo's, checkout returns "price not configured" (or
charges the wrong amount if a stale xonvert price is set). Everything else is done.

## Crypto / NOWPayments
The `/api/crypto/*` path is also wired (PricingClient offers it) for a non-card
option; same plan-setting webhook semantics.
