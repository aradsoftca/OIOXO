import { prisma } from '@/lib/db';
import type { FunnelEvent } from '@/lib/funnel-events';

/** Increment today's anonymous counter for an event. Never throws. */
export async function countFunnel(event: FunnelEvent): Promise<void> {
  try {
    const date = new Date().toISOString().slice(0, 10);
    await prisma.funnelDay.upsert({
      where: { date_event: { date, event } },
      create: { date, event, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch { /* counters must never break a request */ }
}
