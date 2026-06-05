import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'DMCA & Copyright Notice',
  description: `How to submit and respond to copyright notices for ${BRAND}.`,
};

export default function DmcaPage() {
  return (
    <LegalShell title="DMCA & Copyright Notice" updated="May 28, 2026">
      <p>
        {BRAND} respects intellectual property rights and expects its users to do the same. Almost all
        processing on {BRAND_DOMAIN} happens in your browser — we don&apos;t host the files you process.
        Nonetheless, if you believe material accessible through the Service infringes your copyright, or that
        the Service itself is being mirrored or copied without authorisation, follow the procedure below.
      </p>

      <H2>1. Submitting a takedown notice (DMCA §512)</H2>
      <p>
        Send a written notice to{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link> that includes
        all of the following — incomplete notices cannot be acted upon:
      </p>
      <UL>
        <li>
          Your physical signature, or an electronic equivalent, as the owner or an authorised agent of the
          owner of the exclusive right allegedly infringed.
        </li>
        <li>Identification of the copyrighted work claimed to have been infringed.</li>
        <li>
          Identification of the material that is claimed to be infringing — for content accessed via the
          Service, a precise URL or other locator that lets us find it; for the Service itself, the
          mirroring/copied site URL and a description of what is copied.
        </li>
        <li>Your contact information (address, phone, email).</li>
        <li>
          A statement that you have a good-faith belief that use of the material is not authorised by the
          copyright owner, its agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the information in the notice is accurate, and that you
          are authorised to act on behalf of the owner of the exclusive right involved.
        </li>
      </UL>

      <H2>2. What we will do</H2>
      <p>
        For valid notices targeting our own materials or accounts under our control, we will act expeditiously
        to remove or disable access, notify the relevant user, and keep a record of the action. For notices
        targeting third-party mirrors or clones (a recurring concern for browser-based products), we
        coordinate with the relevant hosting provider, registrar, CDN, and platform to take the copy down.
      </p>

      <H2>3. Counter-notice</H2>
      <p>
        If you receive a takedown affecting content you posted or an account you operate and you believe it
        was a mistake or misidentification, you can submit a counter-notice. Include:
      </p>
      <UL>
        <li>Your signature, contact details, and identification of the material that was removed.</li>
        <li>A statement under penalty of perjury that you have a good-faith belief the material was removed by mistake or misidentification.</li>
        <li>Your consent to the jurisdiction of the federal district court for your address (or, if outside the US, for any judicial district in which {BRAND} may be found), and to accept service of process from the complainant.</li>
      </UL>

      <H2>4. Repeat infringers</H2>
      <p>
        We will, in appropriate circumstances, terminate accounts of users who are determined to be repeat
        infringers.
      </p>

      <H2>5. False claims</H2>
      <p>
        Knowingly materially misrepresenting that activity is infringing — or that it was removed or disabled
        by mistake — can expose you to liability for damages, including costs and attorneys&apos; fees. Do
        not file a notice unless you genuinely believe the use is unauthorised by law.
      </p>

      <H2>6. Service IP &mdash; unauthorised mirroring</H2>
      <p>
        The {BRAND} Service itself — its design, source code, assets, model weights, brand marks,
        and the tool implementations — is proprietary and protected. Copying, mirroring, repackaging, or
        rebranding it without written permission infringes our rights. If you discover such a copy, please
        report it through support. We pursue every available legal remedy, including DMCA takedown notices to
        the hosting provider, registrar, and CDN.
      </p>

      <H2>7. Designated agent</H2>
      <p>
        For copyright matters, contact our designated agent through the{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support form</Link>. Notices
        sent through other channels may not be received in time.
      </p>
    </LegalShell>
  );
}
