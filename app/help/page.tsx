import type { Metadata } from 'next';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description: 'Answers to common questions about Xonvert — pricing, privacy, file formats, Pro, and more.',
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Is Xonvert free?',
    a: <>Yes. Most tools are free to use. Some heavier categories (image, audio, video, PDF, convert) give you a free action per day, then a short wait for one more — or upgrade to <Link href="/pricing" className="text-[var(--brand-1)] hover:underline">Pro</Link> for unlimited use across everything.</>,
  },
  {
    q: 'Are my files uploaded to your servers?',
    a: <>No. Xonvert processes your files <strong>entirely in your browser</strong> — they never leave your device. The only exception is the optional &ldquo;Pro Quality&rdquo; feature for heavy jobs, which you turn on explicitly; that file is sent over an encrypted connection, used once, and discarded.</>,
  },
  {
    q: 'Do I need an account?',
    a: <>No account is needed for the everyday tools. You only need to sign up to subscribe to Pro or manage billing.</>,
  },
  {
    q: 'How do the free limits work?',
    a: <>For metered categories you get one free action per day. After that, you can wait ~30 seconds for another, or go Pro for unlimited use. Limits reset daily.</>,
  },
  {
    q: 'What does Pro include?',
    a: <>Unlimited use of every tool with no waits, across the whole platform. It&apos;s $4.99/month or $49.99/year. See <Link href="/pricing" className="text-[var(--brand-1)] hover:underline">pricing</Link>.</>,
  },
  {
    q: 'How do I cancel my subscription?',
    a: <>Open your <Link href="/account" className="text-[var(--brand-1)] hover:underline">account</Link> and use &ldquo;Manage billing&rdquo;. You keep Pro until the end of the period you&apos;ve paid for. Refunds follow our <Link href="/refund" className="text-[var(--brand-1)] hover:underline">refund policy</Link>.</>,
  },
  {
    q: 'Which file formats are supported?',
    a: <>Hundreds — across images, audio, video, PDF, documents, and more. Browse <Link href="/tools" className="text-[var(--brand-1)] hover:underline">all tools</Link> or the <Link href="/convert" className="text-[var(--brand-1)] hover:underline">converter</Link> to see what a given file can become.</>,
  },
  {
    q: 'Can I view a file without converting it?',
    a: <>Yes — use the <Link href="/viewer" className="text-[var(--brand-1)] hover:underline">Universal Viewer</Link> to open images, PDFs, video, audio, text, code, JSON, and CSV right in your browser.</>,
  },
  {
    q: 'Does it work offline?',
    a: <>Many tools keep working offline once the page has loaded, since processing happens on your device. Tools that fetch live data (network lookups) need a connection.</>,
  },
  {
    q: 'Is my payment secure?',
    a: <>Yes. Card payments are handled by Stripe and crypto by NOWPayments — we never see or store your card number.</>,
  },
  {
    q: 'I found a bug or need help.',
    a: <>We&apos;d love to hear from you — open a ticket on the <Link href="/support" className="text-[var(--brand-1)] hover:underline">support page</Link> and we&apos;ll reply by email.</>,
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-[min(760px,94vw)] py-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center text-white" style={{ background: 'var(--brand-gradient)' }}>
          <TileIcon name="life-buoy" size={20} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Help center</div>
          <h1 className="text-[26px] font-bold tracking-tight">Frequently asked questions</h1>
        </div>
      </div>

      <div className="divide-y divide-black/[0.06] border border-black/[0.08] bg-[var(--color-surface-1)]">
        {FAQ.map((f, i) => (
          <details key={i} className="group px-5">
            <summary className="flex cursor-pointer items-center justify-between gap-3 py-4 text-[15px] font-semibold text-[var(--color-fg)] [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="shrink-0 text-[var(--color-fg-muted)] transition group-open:rotate-45">＋</span>
            </summary>
            <div className="pb-4 text-[14px] leading-relaxed text-[var(--color-fg-muted)]">{f.a}</div>
          </details>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] px-5 py-4">
        <div>
          <div className="text-[14px] font-semibold text-[var(--color-fg)]">Still stuck?</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">Our team is happy to help.</div>
        </div>
        <Link href="/support" className="rounded-lg px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110" style={{ background: 'var(--brand-gradient)' }}>
          Contact support
        </Link>
      </div>
    </div>
  );
}
