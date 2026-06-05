'use client';

import * as React from 'react';
import { StudiosTour, SUITE_TOUR_STEPS } from '@/lib/studios/tour';
import { BRAND } from '@/lib/brand';

export function StudiosTourMount() {
  return <StudiosTour steps={SUITE_TOUR_STEPS} storageKey="studios-tour-seen" brand={`${BRAND} Studios`} />;
}
