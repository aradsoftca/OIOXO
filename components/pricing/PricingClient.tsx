'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Crown, Loader2, Bitcoin, CreditCard } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IS_OIOXO } from '@/lib/brand';

type Billing = 'monthly' | 'yearly';

const FREE_FEATURES = IS_OIOXO
  ? [
      'The full workspace + on-device AI — chat, convert, edit, and code',
      'Models run on your device — your code and files never leave',
      'A daily allowance on heavy features (search, big models)',
      'No account required to start',
    ]
  : [
      // Must match lib/usage/config.ts GATED_LIMITS — the old list ("one free
      // action per category") undersold the free tier by 10x.
      'Every tool — no account needed',
      'Files are processed on your device, never uploaded',
      'Unlimited format conversion',
      '10 image, PDF and audio jobs a day, 3 videos',
      'A small brand mark on some exports',
    ];

const PRO_FEATURES = IS_OIOXO
  ? [
      'The on-device coding agent — build & fix, verified on your machine',
      'Bigger on-device models + bring your own frontier key',
      'Web search & grounded answers — no caps',
      'Cloud sync of projects, history & presets',
      'Priority model updates & support',
      'One account unlocks coding, AI, and every tool',
    ]
  : [
      // Only what ships (checked 2026-09-27): no "cloud presets" — that lived in the hidden studios.
      'No daily limits on any tool',
      'No watermark or brand mark on any export',
      'Bigger batches — merge up to 100 PDFs',
      'Higher quality — 320 kbps audio, no video length limit',
      'Priority support',
    ];

export function PricingClient({
  authed,
  currentPlan,
  prices,
}: {
  authed: boolean;
  currentPlan: string | null;
  prices: { monthly: number; yearly: number };
}) {
  const router = useRouter();
  const [billing, setBilling] = React.useState<Billing>('monthly');
  const [loading, setLoading] = React.useState<'' | 'stripe' | 'crypto'>('');
  const [error, setError] = React.useState('');
  const isPro = currentPlan === 'PRO' || currentPlan === 'BUSINESS';

  const price = billing === 'yearly' ? prices.yearly : prices.monthly;
  const perMonth = billing === 'yearly' ? prices.yearly / 12 : prices.monthly;

  const checkout = async (method: 'stripe' | 'crypto') => {
    setError('');
    if (!authed) {
      router.push('/auth/sign-in?callbackUrl=/pricing');
      return;
    }
    setLoading(method);
    try {
      const url = method === 'stripe' ? '/api/stripe/checkout' : '/api/crypto/create-payment';
      const body = method === 'stripe' ? { billing } : { plan: billing };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Could not start checkout.');
    } catch {
      setError('Could not start checkout.');
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="space-y-8">
      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex border border-black/[0.1] bg-[var(--color-surface-1)] p-1">
          {(['monthly', 'yearly'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBilling(b)}
              className={cn(
                'px-5 py-2 text-[12px] font-bold uppercase tracking-wider transition',
                billing === b
                  ? 'bg-[var(--color-fg)] text-[var(--color-canvas)]'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
            >
              {b === 'monthly' ? 'Monthly' : 'Yearly'}
              {b === 'yearly' && (
                <span className="ml-1.5 text-[10px] text-[var(--color-cat-finance)]">save 17%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">
        {/* Free */}
        <div className="border border-black/[0.1] bg-[var(--color-surface-1)] p-7">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Free
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-[40px] font-bold tracking-tight">$0</span>
            <span className="text-[13px] text-[var(--color-fg-muted)]">forever</span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
            {IS_OIOXO ? 'Try the whole platform on your device.' : 'Everything you need for the occasional file.'}
          </p>
          <ul className="mt-6 space-y-2.5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7 w-full border border-black/[0.1] py-3 text-center text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            {isPro ? 'Included' : 'Your current plan'}
          </div>
        </div>

        {/* Pro */}
        <div className="relative border-2 border-[var(--color-cat-finance)] bg-[var(--color-surface-1)] p-7">
          <div className="absolute -top-3 left-7 bg-[var(--color-cat-finance)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Most popular
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-cat-finance)]">
            <Crown className="h-3.5 w-3.5" /> Pro
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-[40px] font-bold tracking-tight">${perMonth.toFixed(2)}</span>
            <span className="text-[13px] text-[var(--color-fg-muted)]">/ month</span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
            {billing === 'yearly'
              ? `Billed $${price.toFixed(2)} once a year`
              : `Billed $${price.toFixed(2)} monthly`}
          </div>
          <ul className="mt-6 space-y-2.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-cat-finance)]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {isPro ? (
            <div className="mt-7 w-full bg-[var(--color-cat-finance)]/15 py-3 text-center text-[12px] font-bold uppercase tracking-wider text-[var(--color-cat-finance)]">
              Your current plan
            </div>
          ) : (
            <div className="mt-7 space-y-2">
              <button
                type="button"
                onClick={() => checkout('stripe')}
                disabled={loading !== ''}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-finance)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
              >
                {loading === 'stripe' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CreditCard className="h-3.5 w-3.5" />
                )}
                {authed ? 'Upgrade with card' : 'Sign in to upgrade'}
              </button>
              <button
                type="button"
                onClick={() => checkout('crypto')}
                disabled={loading !== ''}
                className="flex w-full items-center justify-center gap-2 border border-black/[0.12] py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60"
              >
                {loading === 'crypto' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bitcoin className="h-3.5 w-3.5" />
                )}
                Pay with crypto
              </button>
            </div>
          )}
          {error && <div className="mt-2 text-[12px] text-[var(--color-cat-pdf)]">{error}</div>}
        </div>
      </div>

      <p className="text-center text-[12px] text-[var(--color-fg-muted)]">
        {IS_OIOXO
          ? 'Cancel anytime. Crypto payments via NOWPayments. Models run on your device — your code and files never leave.'
          : 'Cancel anytime. Crypto payments via NOWPayments. No files are ever uploaded — every tool runs on your device.'}
      </p>
    </div>
  );
}
