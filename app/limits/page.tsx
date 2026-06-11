import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown, Check } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { CATEGORIES, type Category } from '@/lib/registry/types';
import { GATED_LIMITS, freeLimitFor, freeMaxBytesFor, formatBytes } from '@/lib/usage/config';
import { DISPLAY_PRICING } from '@/lib/stripe';

export const metadata: Metadata = {
  title: 'Free vs Pro limits',
  description: `Exactly what the free tier allows on ${BRAND} — daily uses and file-size caps per category — and what Pro unlocks.`,
};

// Categories that are metered (everything else is unlimited & free).
const GATED = Object.keys(GATED_LIMITS) as Category[];

export default function LimitsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-[30px] font-extrabold tracking-tight text-[var(--color-fg)]">Free vs Pro limits</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
        {BRAND} runs in your browser, so your files never leave your device. The free tier is generous —
        it's metered on just two simple gates so heavy, everyday work can support the service:
      </p>
      <ul className="mt-4 space-y-2 text-[14px] text-[var(--color-fg)]">
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-fg-muted)]" />
          <span><strong>Daily uses</strong> — a number of free exports per day in each category. Hit it and a short
            wait unlocks one more; after that, Pro removes the cap.</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-fg-muted)]" />
          <span><strong>File size</strong> — free handles files up to a per-category limit. Larger files are a Pro
            feature (Pro has no size cap — only your device's memory).</span>
        </li>
      </ul>

      {/* The table */}
      <div className="mt-8 overflow-hidden border border-black/[0.08]">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-[var(--color-surface-1)] text-left">
              <th className="px-4 py-3 font-bold uppercase tracking-wider text-[var(--color-fg-muted)] text-[11px]">Category</th>
              <th className="px-4 py-3 font-bold uppercase tracking-wider text-[var(--color-fg-muted)] text-[11px]">Free / day</th>
              <th className="px-4 py-3 font-bold uppercase tracking-wider text-[var(--color-fg-muted)] text-[11px]">Free file size</th>
              <th className="px-4 py-3 font-bold uppercase tracking-wider text-[var(--color-fg-muted)] text-[11px]">Pro</th>
            </tr>
          </thead>
          <tbody>
            {GATED.map((cat) => {
              const meta = CATEGORIES[cat];
              const color = `var(${meta.colorVar})`;
              const perDay = freeLimitFor(cat);
              const cap = freeMaxBytesFor(cat);
              return (
                <tr key={cat} className="border-t border-black/[0.06]">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-fg)]">
                      <span className="h-2.5 w-2.5" style={{ background: color }} /> {meta.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{perDay >= 9999 ? 'Unlimited — no daily cap' : `${perDay} free, then +1 after a short wait`}</td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">up to {formatBytes(cap)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-fg)]">
                      <Check className="h-3.5 w-3.5 text-green-600" /> Unlimited, any size
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
        Everything else — calculators, generators, text &amp; developer utilities, time, color and more — is
        <strong className="text-[var(--color-fg)]"> always free and unlimited</strong>, with no size cap. Free
        exports carry a small {BRAND} mark; Pro removes it.
      </p>

      <div className="mt-8 flex flex-col items-start gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[15px] font-bold text-[var(--color-fg)]">Go Pro — unlimited everything</div>
          <div className="text-[12px] text-[var(--color-fg-muted)]">No daily caps, no size limits, no waits, no watermark.</div>
        </div>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:brightness-110"
        >
          <Crown className="h-3.5 w-3.5" /> ${DISPLAY_PRICING.monthly}/mo · cancel anytime
        </Link>
      </div>
    </div>
  );
}
