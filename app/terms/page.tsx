import type { Metadata } from 'next';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The terms governing your use of ${BRAND}.`,
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="May 20, 2026">
      <p>
        These terms govern your use of {BRAND_DOMAIN} (the &ldquo;Service&rdquo;). By using the Service you
        agree to them. If you don&apos;t agree, please don&apos;t use the Service.
      </p>

      <H2>The service</H2>
      <p>
        {BRAND} provides browser-based tools to convert, compress, edit, view, and analyze files, plus
        related utilities. Most tools run entirely in your browser. We provide the Service on an
        &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis.
      </p>

      <H2>Acceptable use</H2>
      <UL>
        <li>Don&apos;t use the Service for unlawful content or to infringe others&apos; rights.</li>
        <li>Don&apos;t attempt to break, overload, scrape, or abuse the Service or its infrastructure, or circumvent usage limits.</li>
        <li>Don&apos;t use the network/diagnostic tools to attack, scan, or disrupt systems you don&apos;t own or have permission to test.</li>
        <li>You are responsible for the files you process and for having the rights to do so.</li>
      </UL>

      <H2>Accounts</H2>
      <p>
        You&apos;re responsible for keeping your account credentials secure and for activity under your
        account. Provide accurate information and keep it current.
      </p>

      <H2>Subscriptions &amp; billing</H2>
      <UL>
        <li>Pro is offered as a monthly ($4.99) or yearly ($49.99) subscription, billed via Stripe (cards) or NOWPayments (crypto). Prices may change with notice.</li>
        <li>Subscriptions renew automatically until cancelled. You can cancel anytime from your account; access continues until the end of the paid period.</li>
        <li>Refunds are handled under our <a className="text-[var(--brand-1)] hover:underline" href="/refund">Refund Policy</a>.</li>
      </UL>

      <H2>Intellectual property</H2>
      <p>
        The Service, its design, source code, compiled assets, and underlying tools are owned by {BRAND}
        and protected by copyright and other laws. Your files and their contents remain entirely yours —
        we claim no rights over them.
      </p>
      <p>
        We grant you a personal, limited, non-exclusive, non-transferable, revocable right to use the
        Service in your browser for its intended purpose. Code delivered to your browser is provided
        only so the Service can run; this is <strong>not</strong> a grant of any other right. You may not
        copy, reproduce, mirror, redistribute, modify, create derivative works from, reverse engineer,
        deobfuscate, or repackage the Service or any part of it, nor remove or alter any copyright,
        watermark, or proprietary notice. Unauthorized copying may be pursued, including via DMCA
        takedown and other legal remedies.
      </p>

      <H2>Disclaimer &amp; liability</H2>
      <p>
        The Service is provided without warranties of any kind. To the maximum extent permitted by law,
        {BRAND} is not liable for indirect or consequential damages, or for any data loss — always keep
        your own backups of important files. Our total liability is limited to the amount you paid us in
        the prior 12 months.
      </p>

      <H2>Termination</H2>
      <p>We may suspend or terminate access for violations of these terms. You may stop using the Service at any time.</p>

      <H2>Changes</H2>
      <p>We may update these terms; continued use after changes means you accept them.</p>
    </LegalShell>
  );
}
