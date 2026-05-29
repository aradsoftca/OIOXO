import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The terms governing your use of ${BRAND}.`,
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="May 28, 2026">
      <p>
        These Terms govern your use of {BRAND_DOMAIN} (the &ldquo;Service&rdquo;). By accessing the Service you
        agree to be bound by these Terms. If you don&apos;t agree, please don&apos;t use the Service.
      </p>

      <H2>1. The service</H2>
      <p>
        {BRAND} provides browser-based tools to convert, compress, edit, view, transcribe, translate, record,
        and analyse files, plus related utilities including live peer-to-peer features (calls, watch parties,
        file transfers) and on-device AI assistance.
      </p>
      <p>
        Most processing happens entirely in your browser; your files are not uploaded to us. The Service is
        provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We may add, change, or
        retire features over time.
      </p>

      <H2>2. Who can use it</H2>
      <p>
        You must be at least 13 years old (or the minimum age required in your country) to use the Service.
        If you create an account on behalf of an organisation, you confirm you have authority to bind that
        organisation.
      </p>

      <H2>3. Acceptable use</H2>
      <p>
        You agree not to use the Service for, or to support, any of the following — see the full list at{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/acceptable-use">Acceptable Use Policy</Link>:
      </p>
      <UL>
        <li>Anything unlawful in your jurisdiction or designed to facilitate it.</li>
        <li>Processing content you don&apos;t have the right to process — including copyrighted material without permission.</li>
        <li>Creating sexual or violent material involving minors, generating non-consensual sexual content, or producing material that incites violence or hatred.</li>
        <li>Defeating, bypassing, or circumventing usage limits, watermarks, license checks, or any other security or access-control feature.</li>
        <li>Scraping, mirroring, redistributing, modifying, reverse engineering, deobfuscating, or repackaging the Service or any part of it.</li>
        <li>Probing, scanning, or attacking systems you don&apos;t own or have written permission to test — including via our network/diagnostic tools.</li>
        <li>Disrupting the Service for other users (denial of service, brute force, automated abuse).</li>
        <li>Reselling Pro access without written permission.</li>
      </UL>
      <p>
        You are solely responsible for the files you process and for having all rights necessary to do so.
        Some tools download large model weights from third-party CDNs the first time you use them — your
        bandwidth provider may bill you accordingly.
      </p>

      <H2>4. Accounts</H2>
      <p>
        You&apos;re responsible for keeping your credentials secure and for any activity under your account.
        Provide accurate information, keep it current, and notify us promptly of any unauthorised access. We
        may suspend accounts that show signs of compromise.
      </p>

      <H2>5. Free and Pro tiers</H2>
      <UL>
        <li><strong>Free</strong> lets you use every tool with daily fair-use limits and a small brand watermark on outputs that have a visible surface.</li>
        <li><strong>Pro</strong> removes the daily limits and the watermark, raises caps on file size / duration / participant counts, and unlocks premium formats and presets.</li>
        <li>
          Pro is offered as a monthly ($4.99) or yearly ($49.99) subscription, billed via Stripe (cards) or
          NOWPayments (crypto). Prices and limits are documented on the pricing page and may change with
          notice for future renewals.
        </li>
      </UL>

      <H2>6. Billing &amp; cancellation</H2>
      <UL>
        <li>Subscriptions renew automatically until you cancel. Renewal charges occur at the start of each new period.</li>
        <li>You can cancel anytime from your account. Pro access continues until the end of the period already paid for; you will not be charged again.</li>
        <li>Refunds are handled under our <Link className="text-[var(--brand-1)] hover:underline" href="/refund">Refund Policy</Link>.</li>
        <li>If a payment fails, we may downgrade you to free after a short retry window.</li>
        <li>You authorise the relevant payment processor to charge the payment method on file for renewals.</li>
        <li>Sales tax, VAT, or other taxes may be added depending on your location.</li>
      </UL>

      <H2>7. Live and peer-to-peer features</H2>
      <p>
        Calls, watch parties, and direct file transfers connect your device directly to your peers&apos;
        devices. We never see the media; the room identifier and minimal signalling metadata pass through us
        only to set up the connection. You are responsible for what you share and with whom.
      </p>

      <H2>8. AI and machine-learning features</H2>
      <p>
        On-device AI tools (transcription, translation, image enhancement, etc.) run entirely in your browser
        and use only your input. They are auto-generated estimates and may produce mistakes; verify anything
        important. We do not warrant that AI outputs are accurate, complete, fit for any particular use, or
        free of bias. You are responsible for how you use AI outputs and for complying with the law where you
        publish them.
      </p>

      <H2>9. Intellectual property</H2>
      <p>
        The Service, including its design, source code, compiled bundles, assets, model weights, brand
        marks, and underlying tooling, is owned by {BRAND} and protected by copyright, trade secret,
        trademark, and other laws.
      </p>
      <p>
        <strong>Your files and their contents remain entirely yours.</strong> We claim no rights over them
        and we do not use them to train models.
      </p>
      <p>
        We grant you a personal, limited, non-exclusive, non-transferable, non-sublicensable, revocable right
        to use the Service in a browser for its intended purpose. Code and assets delivered to your browser
        are provided only so the Service can run; this is <strong>not</strong> a grant of any other right.
      </p>
      <p>
        You may not, and may not permit anyone else to: (a) copy, mirror, redistribute, modify, create
        derivative works of, lease, sell, or reverse engineer the Service or any part of it; (b)
        deobfuscate, disassemble, or attempt to extract source code, model weights, keys, or other access controls; (c)
        remove or alter any copyright, watermark, license, or proprietary notice; (d) host the Service or any
        derivative on another domain; or (e) use the Service to build a competing product. Unauthorised
        copying may be pursued by every legal means including DMCA takedown, civil litigation, and injunctive
        relief.
      </p>

      <H2>10. Feedback</H2>
      <p>
        If you send us suggestions, feedback, bug reports, or other input, we may use them without obligation
        to you. You retain ownership of anything you tell us; you grant us a worldwide, royalty-free right to
        act on it.
      </p>

      <H2>11. Copyright complaints</H2>
      <p>
        If you believe content processed via the Service infringes your copyright, please follow the procedure
        in our <Link className="text-[var(--brand-1)] hover:underline" href="/dmca">DMCA / Copyright Notice</Link>.
      </p>

      <H2>12. Third-party content and links</H2>
      <p>
        The Service may link to or embed content from third parties (model CDNs, payment processors,
        documentation, examples). Their terms and privacy practices govern that content; we are not responsible
        for it.
      </p>

      <H2>13. Disclaimers</H2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
        AVAILABLE&rdquo; WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS
        FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTY ARISING FROM COURSE OF DEALING OR USAGE
        OF TRADE. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE AGAINST EVERY
        ATTACK, OR THAT ANY DATA, RESULT, OR AI OUTPUT WILL BE ACCURATE OR RELIABLE. ALWAYS KEEP YOUR OWN
        BACKUPS OF IMPORTANT FILES.
      </p>

      <H2>14. Limitation of liability</H2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {BRAND.toUpperCase()} WILL NOT BE LIABLE FOR INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUES,
        DATA, GOODWILL, OR BUSINESS, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL CUMULATIVE LIABILITY
        ARISING FROM OR RELATED TO THE SERVICE WILL NOT EXCEED THE GREATER OF (a) THE AMOUNT YOU PAID US IN
        THE TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (b) US$50.
      </p>
      <p>
        Some jurisdictions don&apos;t allow these exclusions; in that case the exclusions apply only to the
        extent permitted by law and you may have other rights.
      </p>

      <H2>15. Indemnity</H2>
      <p>
        To the extent permitted by law, you will defend and indemnify {BRAND} against claims, damages, and
        costs arising from your misuse of the Service, your violation of these Terms, or your infringement of
        any third-party right.
      </p>

      <H2>16. Suspension and termination</H2>
      <p>
        We may suspend or terminate access at any time for material breach of these Terms, for security
        reasons, or to comply with law. You may stop using the Service at any time. Sections that by their
        nature should survive termination — IP, disclaimers, liability, indemnity, governing law — will.
      </p>

      <H2>17. Disputes &amp; informal resolution</H2>
      <p>
        Before filing any formal dispute, you agree to contact us first through the{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support form</Link> and give
        us 30 days to resolve it in good faith — that&apos;s usually faster than any other route.
      </p>
      <p>
        Where local consumer law of your country of residence gives you mandatory rights we cannot exclude,
        those rights continue to apply. Nothing in these Terms is intended to override them.
      </p>

      <H2>18. Changes</H2>
      <p>
        We may update these Terms; material changes will be highlighted and the &ldquo;Last updated&rdquo;
        date refreshed. Continued use after a change means you accept the new version.
      </p>

      <H2>19. Contact</H2>
      <p>
        Questions about these Terms: <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link>.
      </p>
    </LegalShell>
  );
}
