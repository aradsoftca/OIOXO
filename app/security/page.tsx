import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Security',
  description: `How ${BRAND} protects your data, your files, and your account.`,
};

export default function SecurityPage() {
  return (
    <LegalShell title="Security" updated="May 28, 2026">
      <p>
        Security is built into {BRAND} from the architecture up. The short version:{' '}
        <strong>your files never leave your device</strong>, your account is protected by modern primitives,
        and we collect the minimum we can.
      </p>

      <H2>1. Your files stay on your device</H2>
      <p>
        Every tool runs entirely inside your browser. Conversion, compression, editing, viewing, recording,
        transcription, translation, OCR, AI cutouts, peer-to-peer file send — all of it. Your file bytes are
        never transmitted to or stored by {BRAND}, and never used to train any model.
      </p>
      <p>
        Live features (calls, watch parties, send) connect directly device-to-device. Only minimal signalling
        metadata briefly passes through {BRAND} so the peers can find each other.
      </p>

      <H2>2. Connections are encrypted</H2>
      <p>
        Connections to {BRAND} are encrypted in transit using current industry-standard transport security.
        Browsers that have visited {BRAND} once will refuse to use the unencrypted version afterwards.
      </p>

      <H2>3. Account protection</H2>
      <UL>
        <li>Passwords are stored hashed, never in plaintext.</li>
        <li>Repeated failed sign-in attempts are throttled.</li>
        <li>Reset and verification links are single-use and short-lived.</li>
        <li>Sensitive state-changing requests are protected against cross-site forgery.</li>
      </UL>

      <H2>4. Payments</H2>
      <p>
        Card payments are processed by Stripe; cryptocurrency payments by NOWPayments. Full card numbers
        never reach {BRAND} — they go straight to the payment processor. We store only the tokens and
        metadata needed to issue invoices and renewals.
      </p>

      <H2>5. Anti-abuse</H2>
      <p>
        {BRAND} protects itself against automated abuse, credential stuffing, scraping, and unauthorised
        copying with a layered set of controls. The free-tier usage meter resists common bypass attempts
        (cookie clearing, IP rotation) so the fair-use limits apply equally to everyone. Premium tools are
        gated end-to-end so they only run for legitimate sessions.
      </p>

      <H2>6. Data minimisation &amp; retention</H2>
      <p>
        We collect the least we can to operate the Service. Usage counts roll off, logs are deleted or
        anonymised on a short schedule, support correspondence is kept only as long as needed. See the{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/privacy">Privacy Policy</Link> for the
        complete schedule.
      </p>

      <H2>7. Vendor diligence</H2>
      <p>
        We use a small, deliberately-chosen set of subprocessors. Each receives only the minimum data
        needed for its function and is bound by data-processing terms. The full list, including processing
        region, is published at{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/subprocessors">subprocessors</Link>.
      </p>

      <H2>8. Incident response</H2>
      <p>
        We monitor for unusual access and unusual error rates. If a personal-data breach occurs and is likely
        to result in a risk to your rights, we will notify the relevant supervisory authority within 72 hours
        of becoming aware, and notify affected users directly without undue delay — with what we know about
        scope, impact, and the steps we&apos;re taking.
      </p>

      <H2>9. Responsible disclosure</H2>
      <p>
        If you have found a security issue, please tell us before disclosing publicly. Reach out through{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link> with{' '}
        <em>&ldquo;security&rdquo;</em> in the subject; we acknowledge within 72 hours and work with you on a
        fix.
      </p>
      <UL>
        <li>Please don&apos;t access more data than necessary to demonstrate the issue.</li>
        <li>Please don&apos;t run automated scanners against the production site.</li>
        <li>Please don&apos;t use social engineering against staff or other users.</li>
      </UL>
      <p>
        We don&apos;t currently operate a paid bug bounty, but we credit researchers in release notes (with
        your permission) and we make targeted rewards for high-impact reports.
      </p>

      <H2>10. Changes</H2>
      <p>
        As the Service evolves, this page evolves with it. The &ldquo;Last updated&rdquo; date reflects the
        most recent change.
      </p>
    </LegalShell>
  );
}
