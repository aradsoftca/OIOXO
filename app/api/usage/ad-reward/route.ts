import { NextResponse } from 'next/server';
import { AD_REWARD_USES, verifyAdMobCallback, verifyTicket } from '@/lib/usage/ad-reward';
import { grantUses } from '@/lib/usage/service';

export const runtime = 'nodejs';

/**
 * AdMob server-side verification callback. Google calls this after a user
 * finishes a rewarded ad; custom_data carries the ticket from /api/usage/ad-ticket.
 * AdMob only needs a 200 — anything else makes it retry, so a bad request is 400.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).search;
  let params: URLSearchParams | null;
  try { params = await verifyAdMobCallback(raw); } catch { return new NextResponse('keys unavailable', { status: 503 }); }
  // AdMob's "verify URL" button sends an unsigned probe; answer 200 so setup succeeds.
  if (!raw.includes('signature=')) return new NextResponse('ok');
  if (!params) return new NextResponse('bad signature', { status: 400 });
  const ticket = verifyTicket(params.get('custom_data') || '');
  if (!ticket) return new NextResponse('bad ticket', { status: 400 });
  await grantUses(ticket.fps, ticket.category, AD_REWARD_USES);
  return new NextResponse('ok');
}
