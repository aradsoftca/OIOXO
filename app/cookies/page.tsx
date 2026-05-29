import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `The small set of cookies ${BRAND} uses — strictly functional, no ad tracking.`,
};

export default function CookiesPage() {
  return (
    <LegalShell title="Cookie Policy" updated="May 28, 2026">
      <p>
        We keep cookies to a minimum. We use only what&apos;s needed to operate the Service. There are no
        advertising cookies, no cross-site tracking, and no third-party data brokers. This policy applies in
        addition to our{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/privacy">Privacy Policy</Link>.
      </p>

      <H2>1. What is a cookie?</H2>
      <p>
        A cookie is a small piece of data a website stores in your browser. Some last for a single session,
        some persist for longer. We also use related browser storage (localStorage, IndexedDB) — they behave
        similarly and the same rules below apply.
      </p>

      <H2>2. The cookies we set</H2>
      <UL>
        <li>
          <strong>Authentication session</strong> &mdash; created when you sign in, so you stay signed in
          between pages. Expires when your session ends or after a long inactivity window. Strictly necessary.
        </li>
        <li>
          <strong>Usage-meter identifier</strong> &mdash; a random anonymous id we set when you first hit a
          metered tool. Lets us count free-tier usage fairly without an account. Long-lived (~1 year).
          Contains no personal data and no file contents.
        </li>
        <li>
          <strong>CSRF protection</strong> &mdash; a short-lived token cookie that protects sign-in and
          billing actions against cross-site request forgery. Strictly necessary.
        </li>
        <li>
          <strong>Theme &amp; UI preferences</strong> &mdash; remembers your dark/light choice and other
          inline preferences. Stored locally in your browser.
        </li>
      </UL>

      <H2>3. Third-party cookies</H2>
      <UL>
        <li>
          <strong>Stripe</strong> may set cookies during checkout for fraud prevention and 3-D Secure flows.
          They live on Stripe&apos;s domain; we don&apos;t read them.
        </li>
        <li>
          <strong>NOWPayments</strong> (crypto checkout) sets a session cookie during the payment flow.
        </li>
        <li>
          <strong>CDN security</strong> &mdash; the network protecting the site may set a brief security
          cookie used to detect automated abuse.
        </li>
      </UL>
      <p>
        We do not embed analytics or advertising networks that profile you across sites. We do not load
        Google Analytics, Facebook Pixel, or comparable trackers.
      </p>

      <H2>4. How long they last</H2>
      <p>
        Strictly necessary cookies (session, CSRF) last for the duration of your visit or session. The usage
        meter id and preference cookies persist for up to one year unless you clear them.
      </p>

      <H2>5. Managing cookies</H2>
      <p>
        Every modern browser lets you view, allow, or block cookies in its settings. Blocking the strictly
        necessary cookies above may log you out or reset your free-tier counter, but the tools themselves
        will still work. You can also clear local storage from the browser&apos;s &ldquo;clear site data&rdquo;
        controls.
      </p>

      <H2>6. Do Not Track</H2>
      <p>
        Because we don&apos;t track you across sites, we don&apos;t change behaviour in response to DNT
        signals. We&apos;d behave the same way anyway.
      </p>

      <H2>7. Changes</H2>
      <p>
        If the set of cookies we use changes, we&apos;ll update this page and refresh the &ldquo;Last
        updated&rdquo; date.
      </p>
    </LegalShell>
  );
}
