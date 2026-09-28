import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Delete your account',
  description: `How to delete your ${BRAND} account and the data linked to it, on the website or in the ${BRAND} app.`,
};

// Linked from the Google Play and App Store data-safety forms: a public page that says how to
// ask for an account to be deleted, what is deleted, and what is kept (and for how long).
export default function DeleteAccountPage() {
  return (
    <LegalShell title="Delete your account" updated="September 28, 2026">
      <p>
        You can ask us to delete your {BRAND} account at any time — whether you created it on the website or in
        the {BRAND} app for Android or iPhone. You do not need an account to use {BRAND}; files are always
        processed on your own device and are never stored by us, so there are no files to delete.
      </p>

      <H2>How to request deletion</H2>
      <UL>
        <li>
          Open <Link className="text-[var(--brand-1)] hover:underline" href="/support">Support</Link> and write
          &ldquo;Delete my account&rdquo;, including the email address of the account.
        </li>
        <li>
          Or email <a className="text-[var(--brand-1)] hover:underline" href="mailto:info@aradsoft.ca?subject=Delete%20my%20Xonvert%20account">info@aradsoft.ca</a>{' '}
          from the address you signed up with, with the subject &ldquo;Delete my Xonvert account&rdquo;.
        </li>
      </UL>
      <p>We confirm by email and complete the deletion within 30 days.</p>

      <H2>What is deleted</H2>
      <UL>
        <li>Your account: email address, name, password hash and sign-in connections (such as Google).</li>
        <li>Your preferences and support messages linked to the account.</li>
        <li>Usage counts linked to your account.</li>
      </UL>

      <H2>What is kept</H2>
      <UL>
        <li>
          If you paid for Pro: invoice and payment records, kept for as long as tax law requires (usually up to
          7 years). Card details are never stored by us — they stay with the payment processor.
        </li>
      </UL>
      <p>
        If you have an active Pro subscription, cancel it first on your account page so you are not charged
        again. See also our <Link className="text-[var(--brand-1)] hover:underline" href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalShell>
  );
}
