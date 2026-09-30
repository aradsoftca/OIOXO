'use client';
import * as React from 'react';
import { isIOSWebKit } from '@/lib/compute/device-profile';

/**
 * iPhone/iPad: the image AI model behind Enhance/Upscale runs at the edge of what
 * WebKit allows and the page was terminated on some runs (measured 09-29 on an
 * iPhone 16 Pro Max). Rather than a tool that sometimes crashes, say so up front.
 * Renders children everywhere else. Decided after mount (UA is client-only).
 */
export function IPhoneUnavailable({ children }: { children: React.ReactNode }) {
  const [ios, setIos] = React.useState(false);
  React.useEffect(() => setIos(isIOSWebKit()), []);
  if (!ios) return <>{children}</>;
  return (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6 text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
      <div className="mb-1 text-[15px] font-semibold text-[var(--color-fg)]">Not available on iPhone and iPad</div>
      This tool needs more memory than iPhone and iPad allow for a web page. Open
      <strong className="text-[var(--color-fg)]"> xonvert.com</strong> on a computer or an Android phone to use it.
    </div>
  );
}
