'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * gen-resume was a print-only toy duplicate of studio-resume (which gates,
 * watermarks, and has real templated PDF export). Retired in favor of the
 * studio: redirect there. (Audit Top-10: closes a watermark leak + a
 * gate-undercut + a parity gap at once.)
 */
export default function Tool() {
  const router = useRouter();
  React.useEffect(() => { router.replace('/tools/studio-resume'); }, [router]);
  return (
    <div className="p-8 text-center text-[var(--color-fg-muted)]">
      Opening the Resume Studio…{' '}
      <a href="/tools/studio-resume" className="underline">click here</a> if it doesn’t redirect.
    </div>
  );
}
