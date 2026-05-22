import type { Metadata } from 'next';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'How refunds and cancellations work for Xonvert Pro.',
};

export default function RefundPage() {
  return (
    <LegalShell title="Refund Policy" updated="May 20, 2026">
      <p>
        We want you to be happy with Xonvert Pro. Because the free tier lets you try the tools before
        paying, please make sure they fit your needs before subscribing.
      </p>

      <H2>14-day money-back guarantee</H2>
      <p>
        If you&apos;re not satisfied, request a refund within <strong>14 days</strong> of your initial
        purchase and we&apos;ll refund it, no hard questions asked. This applies to your first payment on
        a new subscription.
      </p>

      <H2>Renewals &amp; cancellations</H2>
      <UL>
        <li>You can cancel anytime from your account — your Pro access continues until the end of the current billing period, and you won&apos;t be charged again.</li>
        <li>Renewal charges (the automatic monthly/yearly payments after the first) are generally non-refundable, but reach out if something went wrong and we&apos;ll make it right.</li>
      </UL>

      <H2>Crypto payments</H2>
      <p>
        Payments made in cryptocurrency are, by their nature, difficult to reverse and are handled
        case-by-case. Contact us and we&apos;ll do our best to help.
      </p>

      <H2>How to request</H2>
      <p>
        Email us through <a className="text-[var(--brand-1)] hover:underline" href="/support">support</a>{' '}
        with the email used for the purchase. Approved refunds are returned to your original payment
        method, usually within 5–10 business days.
      </p>
    </LegalShell>
  );
}
