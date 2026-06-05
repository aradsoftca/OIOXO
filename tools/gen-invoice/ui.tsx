'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * gen-invoice was a print-only toy duplicate of studio-invoice (which gates,
 * watermarks, and has logo/templates/real PDF export). Retired in favor of the
 * studio: redirect there so existing links land on the better tool. (Audit
 * Top-10: closes a watermark leak + a gate-undercut + a parity gap at once.)
 */
export default function Tool() {
  const router = useRouter();
  React.useEffect(() => { router.replace('/tools/studio-invoice'); }, [router]);
  return (
    <div className="p-8 text-center text-[var(--color-fg-muted)]">
      Opening the Invoice Studio…{' '}
      <a href="/tools/studio-invoice" className="underline">click here</a> if it doesn’t redirect.
    </div>
  );
}
