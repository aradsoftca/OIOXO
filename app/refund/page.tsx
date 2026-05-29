import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Cancellation Policy',
  description: `How cancellation works for ${BRAND} Pro. Free tier lets you try every tool first; subscriptions are non-refundable.`,
};

export default function RefundPage() {
  return (
    <LegalShell title="Cancellation Policy" updated="May 28, 2026">
      <p>
        The free tier of {BRAND} lets you use every tool with daily limits — so you can try the product
        thoroughly before paying. Pro subscriptions are <strong>non-refundable</strong>, but you can cancel
        at any time and continue using Pro until the end of the period you&apos;ve already paid for.
      </p>

      <H2>1. Cancel anytime, keep access until the end of the period</H2>
      <p>
        You can cancel your Pro subscription whenever you want, directly from your account page. Cancelling
        stops the next automatic charge. <strong>Your Pro access continues for the full remainder of the
        period you&apos;ve already paid for</strong> — every Pro feature, no daily caps, no watermark, full
        file-size limits. No phone calls, no &ldquo;retention&rdquo; conversations.
      </p>

      <H2>2. No refunds</H2>
      <p>
        Because the free tier already lets you confirm the tools work for you before you pay, Pro charges
        (both first purchases and renewals) are non-refundable. The same applies to lifetime / one-time
        offers. Please make sure {BRAND} fits your needs while you&apos;re on free; once you upgrade, the
        charge is final.
      </p>

      <H2>3. Renewals</H2>
      <UL>
        <li>Subscriptions renew automatically at the start of each new period, on the same payment method.</li>
        <li>You can cancel any time before the renewal date to stop the next charge.</li>
        <li>Once a renewal has been billed, the charge is final and grants Pro access for the full new period.</li>
      </UL>

      <H2>4. Billing errors</H2>
      <p>
        If a charge was clearly an error on our side — for example, a duplicate charge, or a renewal after a
        successful cancellation that we didn&apos;t register — contact us through{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link> with the
        email used for the purchase, and we&apos;ll correct it.
      </p>

      <H2>5. Chargebacks &amp; payment disputes</H2>
      <p>
        If you have any concern about a charge, please contact us first — we can almost always resolve it
        directly, and faster than your bank can. Filing a chargeback without contacting us may result in the
        account being suspended until the dispute is resolved.
      </p>

      <H2>6. Crypto payments</H2>
      <p>
        Cryptocurrency transactions are by their nature difficult to reverse on the blockchain. The
        non-refund policy above applies to crypto purchases the same as to card purchases. In a clear billing
        error we will work with you in good faith to make it right, within the limits of the relevant crypto
        rail.
      </p>

      <H2>7. Statutory rights</H2>
      <p>
        Where local consumer law gives you mandatory refund or withdrawal rights that we cannot exclude,
        those rights continue to apply. To request, contact{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link>.
      </p>

      <H2>8. How to cancel</H2>
      <p>
        Sign in, open your account page, and choose &ldquo;Cancel subscription&rdquo;. You&apos;ll see the
        exact date your Pro access ends. Until that date you can resume the subscription anytime; after that
        date you can re-subscribe at the then-current price.
      </p>
    </LegalShell>
  );
}
