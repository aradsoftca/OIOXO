import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${BRAND} handles your data. Your files are processed in your browser and never uploaded.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="May 28, 2026">
      <p>
        {BRAND} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates {BRAND_DOMAIN}. This Privacy Policy explains what
        we collect, why, how we use and protect it, and the rights you have. The short version:{' '}
        <strong>your files are processed in your own browser and never uploaded to us.</strong>
      </p>

      <H2>1. Who we are</H2>
      <p>
        {BRAND} is the data controller for personal data described here. For questions about your data or to
        exercise your rights, see <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link>.
      </p>

      <H2>2. Your files stay on your device</H2>
      <p>
        Every tool — converting, compressing, editing, viewing, recording, transcribing, translating — runs
        locally inside your browser using on-device processing. The contents of your files are never
        transmitted to or stored by {BRAND}, never logged, and never used to train any model.
      </p>
      <p>
        Some tools download model weights (for OCR, transcription, image enhancement, etc.) the first time
        you use them — these are static downloads from a content-delivery network. Your input does not travel
        with that download.
      </p>

      <H2>3. What we collect</H2>
      <UL>
        <li>
          <strong>Account data</strong> (only if you sign up): your email address, a securely hashed password
          (we never see your plaintext password), display name if you provide one, and account preferences.
        </li>
        <li>
          <strong>Usage metering</strong>: per-category daily counts keyed to a privacy-preserving fingerprint
          derived from a cookie identifier and your IP address. Lets us enforce free-tier limits without an
          account, and survive cookie clearing or IP changes. <em>No file contents are involved.</em>
        </li>
        <li>
          <strong>Session telemetry</strong>: for live tools (group calls, watch parties, file transfers) we
          briefly store the room identifier and minimal signalling metadata while the session is active. Media
          is peer-to-peer — it does not pass through {BRAND}.
        </li>
        <li>
          <strong>Payment records</strong> (if you subscribe): your subscription tier, billing cycle, last
          four digits of the card or crypto receipt id, invoices, and renewal status. Full card numbers are
          never stored by us — they live with the payment processor.
        </li>
        <li>
          <strong>Support correspondence</strong>: messages you send through the support form and our replies.
        </li>
        <li>
          <strong>Basic technical data</strong>: standard request logs (IP, browser type, timestamp, requested
          path) retained briefly for security and abuse prevention.
        </li>
      </UL>

      <H2>4. How we use your data</H2>
      <UL>
        <li>To provide and operate the Service and enforce fair-use limits.</li>
        <li>To create, manage, and protect your account.</li>
        <li>To process subscription payments and refunds.</li>
        <li>To send transactional emails: email verification, password reset, payment receipts, security alerts, replies to your support questions.</li>
        <li>To detect and prevent fraud, abuse, brute-force attempts, and other security threats.</li>
        <li>To comply with legal obligations.</li>
      </UL>
      <p>
        <strong>We do not sell or rent your personal data.</strong> We do not use it to build advertising
        profiles. We do not share it with data brokers.
      </p>

      <H2>5. Legal bases (GDPR, where applicable)</H2>
      <UL>
        <li><strong>Contract</strong> — to deliver the Service you signed up for.</li>
        <li><strong>Legitimate interest</strong> — to keep the Service secure, prevent abuse, and improve reliability.</li>
        <li><strong>Consent</strong> — for any optional feature that explicitly asks (always revocable).</li>
        <li><strong>Legal obligation</strong> — for invoicing/tax records.</li>
      </UL>

      <H2>6. Who we share data with</H2>
      <p>
        We rely on a small set of trusted providers strictly to operate the Service. Each receives only the
        minimum data needed for its function and is bound by data-processing terms. The full list — including
        which country processes the data — is published at{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/subprocessors">subprocessors</Link>.
        Examples: payment processing (Stripe, NOWPayments), transactional email delivery, and DNS/CDN.
      </p>

      <H2>7. International transfers</H2>
      <p>
        Where personal data is transferred outside of your region (for example, when a credit card is
        processed by a US-based payment processor), we rely on the legal mechanisms our processors offer —
        typically the Standard Contractual Clauses — and pass on only what the processor needs.
      </p>

      <H2>8. How long we keep data</H2>
      <UL>
        <li><strong>Account data</strong>: while the account is active, plus a short period to handle disputes.</li>
        <li><strong>Usage counts</strong>: daily counts roll off after we no longer need them for fair-use enforcement (typically within 90 days).</li>
        <li><strong>Billing records</strong>: as required by accounting law (commonly 7–10 years).</li>
        <li><strong>Request logs</strong>: 30 days, then deleted or anonymised.</li>
        <li><strong>Support messages</strong>: as long as needed to resolve your request, plus a short audit window.</li>
      </UL>
      <p>
        Deleting your account removes the personal data we no longer have a legal obligation to keep.
      </p>

      <H2>9. Your rights</H2>
      <p>You can, at any time:</p>
      <UL>
        <li><strong>Access</strong> the personal data we hold about you.</li>
        <li><strong>Correct</strong> data that&apos;s inaccurate or incomplete.</li>
        <li><strong>Delete</strong> your account and the personal data we don&apos;t need to keep for legal reasons.</li>
        <li><strong>Export</strong> your data in a portable format.</li>
        <li><strong>Object</strong> to processing based on legitimate interest, and <strong>restrict</strong> processing where applicable.</li>
        <li><strong>Withdraw consent</strong> for anything we&apos;re processing on that basis.</li>
        <li><strong>Lodge a complaint</strong> with your local data-protection authority.</li>
      </UL>
      <p>
        California residents (CCPA/CPRA) have the same rights under that framework, plus the right to opt out
        of any &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal information — neither of which we do.
      </p>
      <p>
        Make a request through{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link>. We respond
        within 30 days.
      </p>

      <H2>10. How we protect your data</H2>
      <p>
        We use industry-standard technical and organisational measures to protect personal data against
        unauthorised access, alteration, disclosure, or destruction. Passwords are stored hashed (never in
        plaintext), connections to the Service are encrypted in transit, and access to systems holding
        personal data is restricted on a need-to-know basis.
      </p>
      <p>
        For an overview written for non-specialists, see the{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/security">Security</Link> page.
      </p>

      <H2>11. Data breach</H2>
      <p>
        If a breach of personal data ever occurs and it&apos;s likely to result in a risk to your rights, we
        will notify the relevant supervisory authority within 72 hours of becoming aware, and notify affected
        users directly without undue delay.
      </p>

      <H2>12. Children</H2>
      <p>
        The Service is not directed to children under 13 (or under 16 where required), and we do not
        knowingly collect their data. If you believe a child has provided us personal data, contact us and
        we&apos;ll delete it.
      </p>

      <H2>13. Cookies</H2>
      <p>
        See our <Link className="text-[var(--brand-1)] hover:underline" href="/cookies">Cookie Policy</Link>{' '}
        for the small functional set we use. No advertising or cross-site tracking cookies.
      </p>

      <H2>14. Changes to this policy</H2>
      <p>
        We may update this Policy as the Service evolves. Material changes will be highlighted, and the
        &ldquo;Last updated&rdquo; date above will change. Continued use after a change means you accept the
        new version.
      </p>
    </LegalShell>
  );
}
