import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DISPLAY_PRICING } from '@/lib/stripe';
import { BRAND, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { PricingClient } from '@/components/pricing/PricingClient';
import { buildMeta } from '@/lib/seo/meta';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';

export const metadata: Metadata = buildMeta({
  path: '/pricing',
  title: IS_OIOXO ? `${BRAND} Pro — one price for the whole AI` : `${BRAND} Pro — unlimited tools, one price`,
  description: IS_OIOXO
    ? `${BRAND} Pro: one subscription unlocks the AI coding agent, bigger on-device models, web search and sync. Files and prompts stay on your device.`
    : `${BRAND} Pro: one subscription unlocks every tool with no daily caps, no waits, and no watermark. Files never leave your device.`,
  keywords: IS_OIOXO
    ? ['oioxo pricing', 'on-device ai pricing', 'private ai subscription', 'ai coding agent pricing', 'chatgpt alternative price', 'webgpu ai pro']
    : ['xonvert pricing', 'pro online tools', 'free vs pro tools', 'unlimited file converter', 'pdf editor pro', 'browser tools subscription'],
});

const PRICING_FAQS = [
  { q: 'Is there a free tier?', a: `Yes — every core tool is free to use. Pro removes the small export watermark, lifts daily quotas on heavier operations, and unlocks higher-quality specialist features.` },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancellation takes effect at the end of your current billing period; you keep Pro until then with no further charges.' },
  { q: 'Do you offer refunds?', a: 'Yes — see the refund page for the policy. In short: contact support and we will make it right.' },
  { q: 'Do you accept crypto?', a: 'Yes. Both credit card (via Stripe) and crypto payment options are available at checkout.' },
  { q: 'Is the price the same in every country?', a: 'The displayed prices are in USD. Stripe converts at checkout to your local currency.' },
];

function buildProductJsonLd() {
  const price = DISPLAY_PRICING.monthly;
  const yearly = DISPLAY_PRICING.yearly;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${BRAND} Pro`,
    description: IS_OIOXO
      ? `Unlimited access to the on-device AI: bigger models, coding agent, web search, sync.`
      : `Unlimited access to ${BRAND}'s 400+ browser tools with no daily caps, no watermark.`,
    brand: { '@type': 'Brand', name: BRAND },
    offers: [
      {
        '@type': 'Offer',
        url: `https://${BRAND_DOMAIN}/pricing`,
        priceCurrency: 'USD',
        price: price.toString(),
        priceValidUntil: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        availability: 'https://schema.org/InStock',
        name: 'Monthly subscription',
        category: 'Subscription',
      },
      {
        '@type': 'Offer',
        url: `https://${BRAND_DOMAIN}/pricing`,
        priceCurrency: 'USD',
        price: yearly.toString(),
        availability: 'https://schema.org/InStock',
        name: 'Yearly subscription',
        category: 'Subscription',
      },
    ],
  };
}

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const user = uid
    ? await prisma.user.findUnique({ where: { id: uid }, select: { plan: true, subscriptionEndsAt: true } })
    : null;
  // Apply the same fail-safe as the API gates (Pass 73) so a past-period
  // user sees "Upgrade" instead of "Manage" if Stripe's webhook missed.
  const expiredPlan = user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() + 24 * 60 * 60 * 1000 < Date.now();
  const effectivePlan = expiredPlan ? 'FREE' : user?.plan;

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <div className="mb-10 text-center">
        <h1 className="text-[34px] font-extrabold tracking-tight">
          {IS_OIOXO ? 'One price. The whole AI.' : 'Simple pricing'}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[15px] text-[var(--color-fg-muted)]">
          {IS_OIOXO
            ? 'Everything runs on your device — free to start. Go Pro to unlock the coding agent, bigger models, web search and sync, with no caps.'
            : 'Every tool is free to try. Go Pro to drop the limits — one account unlocks the whole platform, unlimited, with no waits.'}
        </p>
      </div>
      <PricingClient
        authed={!!session?.user}
        currentPlan={effectivePlan ?? null}
        prices={{ monthly: DISPLAY_PRICING.monthly, yearly: DISPLAY_PRICING.yearly }}
      />

      <section className="mt-12 space-y-3">
        <h2 className="text-[20px] font-bold tracking-tight">Pricing FAQ</h2>
        <div className="space-y-2">
          {PRICING_FAQS.map((f, i) => (
            <details key={i} className="group border border-black/[0.06] bg-[var(--color-surface-1)] p-4">
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-[14px] font-semibold">
                <span>{f.q}</span>
                <span className="shrink-0 text-[var(--color-fg-muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataToScript(buildProductJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(PRICING_FAQS)) }}
      />
    </div>
  );
}
