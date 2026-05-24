import type { Metadata } from 'next';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `The small set of cookies ${BRAND} uses — strictly functional, no ad tracking.`,
};

export default function CookiesPage() {
  return (
    <LegalShell title="Cookie Policy" updated="May 20, 2026">
      <p>
        We keep cookies to a minimum. We use only what&apos;s needed to run the Service — there are no
        advertising or cross-site tracking cookies.
      </p>

      <H2>What we use</H2>
      <UL>
        <li><strong>Authentication</strong> — when you sign in, a secure session cookie keeps you logged in.</li>
        <li><strong>Usage limits</strong> — a long-lived identifier cookie lets us count free-tier usage fairly without requiring an account. It holds no personal data and no file contents.</li>
        <li><strong>Preferences</strong> — occasional local storage to remember UI choices (these stay in your browser).</li>
      </UL>

      <H2>Third-party cookies</H2>
      <p>
        Our payment processor (Stripe) may set cookies during checkout for fraud prevention, and our CDN
        may set a security cookie. We don&apos;t use analytics or ad networks that profile you.
      </p>

      <H2>Managing cookies</H2>
      <p>
        You can clear or block cookies in your browser settings. Blocking the functional cookies above
        may log you out or reset your free-tier counter, but the tools themselves will still work.
      </p>
    </LegalShell>
  );
}
