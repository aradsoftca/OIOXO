import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2 } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Subprocessors',
  description: `The third-party services ${BRAND} uses to operate, with the data they receive.`,
};

interface Row {
  name: string;
  purpose: string;
  data: string;
  region: string;
}

const ROWS: Row[] = [
  { name: 'Stripe, Inc.',         purpose: 'Card payments + invoicing',                                  data: 'Email, name, billing address, last-four of card, IP, payment amount', region: 'US (with EU SCCs)' },
  { name: 'NOWPayments',          purpose: 'Cryptocurrency payments',                                    data: 'Email, payment amount, crypto receipt id, IP',                          region: 'EU' },
  { name: 'Resend',               purpose: 'Transactional email (sign-up, verification, billing)',      data: 'Email address, message contents',                                       region: 'EU + US (with EU SCCs)' },
  { name: 'Brevo (Sendinblue)',   purpose: 'Backup transactional email and notifications',              data: 'Email address, message contents',                                       region: 'EU' },
  { name: 'Cloudflare, Inc.',     purpose: 'DNS, DDoS protection, CDN',                                  data: 'IP, request metadata, brief security cookie',                           region: 'Global edge (with EU SCCs)' },
  { name: 'Hugging Face',         purpose: 'CDN for on-device AI model weights',                        data: 'IP of the downloading browser, requested model id',                     region: 'EU + US' },
  { name: 'jsDelivr',             purpose: 'CDN for static library assets',                             data: 'IP of the downloading browser, requested asset path',                   region: 'Global edge' },
];

export default function SubprocessorsPage() {
  return (
    <LegalShell title="Subprocessors" updated="May 28, 2026">
      <p>
        {BRAND} uses a deliberately small set of third-party providers to operate. Each receives only the
        minimum data needed for its function and is bound by data-processing terms (DPA + Standard
        Contractual Clauses where applicable). Your file contents are never shared with any of these
        providers — files are processed in your browser.
      </p>

      <H2>Current list</H2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black/[0.08] text-left text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <th className="py-2 pr-3">Provider</th>
              <th className="py-2 pr-3">Purpose</th>
              <th className="py-2 pr-3">Data received</th>
              <th className="py-2 pr-3">Region</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} className="border-b border-black/[0.04] align-top">
                <td className="py-3 pr-3 font-semibold text-[var(--color-fg)]">{r.name}</td>
                <td className="py-3 pr-3">{r.purpose}</td>
                <td className="py-3 pr-3">{r.data}</td>
                <td className="py-3 pr-3 text-[var(--color-fg-subtle)]">{r.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>What is NOT on this list</H2>
      <p>
        We do not use Google Analytics, Facebook Pixel, advertising networks, retargeting platforms, session
        replay vendors, or any data broker. We do not pipe your data to anyone for marketing.
      </p>

      <H2>Changes to this list</H2>
      <p>
        Before we add a new subprocessor with access to personal data, we update this page. If you have an
        active Pro subscription and want to be notified by email when this list changes, write to{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link> to opt in.
      </p>

      <H2>Questions</H2>
      <p>
        For questions about a specific provider or to request the relevant DPA documentation, contact{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link>.
      </p>
    </LegalShell>
  );
}
