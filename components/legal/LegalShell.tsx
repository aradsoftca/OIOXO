import Link from 'next/link';

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[min(760px,94vw)] py-6">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Legal</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[var(--color-fg)]">{title}</h1>
        <div className="mt-1 text-[12px] text-[var(--color-fg-subtle)]">Last updated: {updated}</div>
      </div>
      <article className="space-y-4 text-[14px] leading-relaxed text-[var(--color-fg-muted)]">{children}</article>
      <div className="mt-10 border-t border-black/[0.06] pt-5 text-[12px] text-[var(--color-fg-subtle)]">
        Questions about this policy? <Link href="/support" className="font-semibold text-[var(--brand-1)] hover:underline">Contact support</Link>.
      </div>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-3 text-[16px] font-bold tracking-tight text-[var(--color-fg)]">{children}</h2>;
}
export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}
