'use client';

import { useSession } from 'next-auth/react';

interface PlanUser {
  plan?: string | null;
}

/**
 * Single source of truth for "is this user Pro right now" — used by every
 * policy-aware widget so we don't re-derive the rule in 20 places.
 */
export function useIsPro(): boolean {
  const { data } = useSession();
  const plan = (data?.user as PlanUser | undefined)?.plan;
  return plan === 'PRO' || plan === 'BUSINESS';
}
