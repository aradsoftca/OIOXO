import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DISPLAY_PRICING } from '@/lib/stripe';
import { IS_OIOXO } from '@/lib/brand';
import { PricingClient } from '@/components/pricing/PricingClient';

export const metadata: Metadata = {
  title: 'Pricing',
  description: IS_OIOXO
    ? 'One account unlocks the whole AI — the coding agent, bigger on-device models, web search and sync. Models run on your device; your code never leaves.'
    : 'One Pro account unlocks every tool, unlimited — no waits, no caps. Files never leave your device.',
};

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const user = uid
    ? await prisma.user.findUnique({ where: { id: uid }, select: { plan: true } })
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <div className="mb-10 text-center">
        <h1 className="text-[34px] font-extrabold tracking-tight">
          {IS_OIOXO ? 'One price. The whole AI.' : 'Simple pricing'}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[15px] text-[var(--color-fg-muted)]">
          {IS_OIOXO
            ? 'Everything runs on your device — free to start. Go Pro to unlock the coding agent, bigger models, web search and sync, with no caps.'
            : 'Every tool is free to try. Go Pro to drop the limits — one account unlocks the whole platform, unlimited, with no waits.'}
        </p>
      </div>
      <PricingClient
        authed={!!session?.user}
        currentPlan={user?.plan ?? null}
        prices={{ monthly: DISPLAY_PRICING.monthly, yearly: DISPLAY_PRICING.yearly }}
      />
    </div>
  );
}
