import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PRO_PRICING } from '@/lib/stripe';
import { PricingClient } from '@/components/pricing/PricingClient';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'One Pro account unlocks every tool, unlimited — no waits, no caps. Files never leave your device.',
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
        <h1 className="text-[34px] font-extrabold tracking-tight">Simple pricing</h1>
        <p className="mx-auto mt-2 max-w-xl text-[15px] text-[var(--color-fg-muted)]">
          Every tool is free to try. Go Pro to drop the limits — one account unlocks the whole
          platform, unlimited, with no waits.
        </p>
      </div>
      <PricingClient
        authed={!!session?.user}
        currentPlan={user?.plan ?? null}
        prices={{ monthly: PRO_PRICING.monthly, yearly: PRO_PRICING.yearly }}
      />
    </div>
  );
}
