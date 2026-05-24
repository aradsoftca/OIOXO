import type { Metadata } from 'next';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${BRAND} handles your data. Your files are processed in your browser and never uploaded.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="May 20, 2026">
      <p>
        {BRAND} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates {BRAND_DOMAIN}. This policy explains what we
        collect and how we use it. The short version: <strong>your files are processed entirely in your
        own browser and are never uploaded to us.</strong>
      </p>

      <H2>Your files stay on your device</H2>
      <p>
        Our tools — converting, compressing, editing, viewing — run locally in your browser using
        on-device processing. The contents of your files are never transmitted to or stored on our
        servers, and are never used to train models. The only exception is the optional
        &ldquo;Pro Quality&rdquo; feature: if you explicitly choose it for a heavy job, that single file
        is sent over an encrypted connection to a processing server, used only to produce your result,
        and discarded immediately afterwards — never stored or logged.
      </p>

      <H2>What we collect</H2>
      <UL>
        <li><strong>Account information</strong> (if you sign up): your email address, a securely hashed password (we never see your plaintext password), and your name if you provide one.</li>
        <li><strong>Usage metering</strong>: to enforce free-tier limits, we store per-category daily counts keyed to a privacy-preserving identifier derived from your IP and a browser cookie. This contains no file contents.</li>
        <li><strong>Payment records</strong> (if you subscribe): handled by our payment processors (Stripe and NOWPayments). We store your subscription status and invoices, but <strong>never your full card number</strong>.</li>
        <li><strong>Support messages</strong>: anything you send us through the support form.</li>
        <li><strong>Basic technical data</strong>: standard server logs (IP, browser type) for security and abuse prevention.</li>
      </UL>

      <H2>How we use it</H2>
      <UL>
        <li>To provide the service and enforce fair-use limits.</li>
        <li>To manage your account and subscription.</li>
        <li>To send service emails you&apos;d expect — verification, password reset, support replies, billing notices.</li>
        <li>To keep the service secure and prevent abuse.</li>
      </UL>
      <p>We do not sell your data, and we do not use it for advertising profiles.</p>

      <H2>Third parties</H2>
      <p>
        We rely on a small set of providers strictly to operate the service: payment processing
        (Stripe, NOWPayments), email delivery (Resend, Brevo), and infrastructure/CDN. They process only
        the minimum data needed for their function. Some viewer/lookup tools may call a third-party API
        directly from your browser; those requests don&apos;t pass through us.
      </p>

      <H2>Data retention &amp; your rights</H2>
      <p>
        We keep account, usage, and billing records for as long as your account is active or as required
        for legal and accounting purposes. You can request access to, correction of, or deletion of your
        personal data at any time via <a className="text-[var(--brand-1)] hover:underline" href="/support">support</a>.
        Deleting your account removes your personal information from our systems.
      </p>

      <H2>Children</H2>
      <p>The service is not directed to children under 13, and we do not knowingly collect their data.</p>

      <H2>Changes</H2>
      <p>We may update this policy; material changes will be reflected by the &ldquo;last updated&rdquo; date above.</p>
    </LegalShell>
  );
}
