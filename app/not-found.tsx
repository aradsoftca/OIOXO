import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <div className="font-mono text-[64px] font-semibold tracking-tight text-[var(--color-fg)]">404</div>
        <p className="mt-2 text-[15px] text-[var(--color-fg-muted)]">This tile doesn&apos;t exist yet.</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 bg-[var(--color-fg)] px-4 py-2 text-[13px] font-medium text-[var(--color-canvas)] transition hover:opacity-90"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
