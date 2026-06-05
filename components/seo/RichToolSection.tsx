import Link from 'next/link';
import type { RichPage } from '@/lib/seo/content';
import type { ToolManifest } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';

interface Props {
  tool: ToolManifest;
  page: RichPage;
  related?: ToolManifest[];
}

export function RichToolSection({ tool, page, related = [] }: Props) {
  const cat = CATEGORIES[tool.category];

  return (
    <section
      aria-label={`About ${tool.name}`}
      className="mt-10 space-y-10 border-t border-black/[0.08] pt-10 text-[14px] leading-relaxed text-[var(--color-fg)]"
    >
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          About {tool.name}
        </p>
        <h2 className="text-[28px] font-bold leading-tight tracking-tight">
          {tool.name} — free, private, browser-based {cat.name.toLowerCase()} tool
        </h2>
        <p className="max-w-3xl text-[15px] text-[var(--color-fg-muted)]">{page.intro}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 border border-black/[0.06] bg-[var(--color-surface-1)] p-5">
          <h3 className="text-[15px] font-bold">Why use {tool.name}</h3>
          <ul className="space-y-1.5 text-[13px] text-[var(--color-fg-muted)]">
            {page.benefits.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--color-fg)]">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 border border-black/[0.06] bg-[var(--color-surface-1)] p-5">
          <h3 className="text-[15px] font-bold">How to use it</h3>
          <ol className="space-y-2 text-[13px] text-[var(--color-fg-muted)]">
            {page.steps.map((s, i) => (
              <li key={i} id={`step-${i + 1}`} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-fg)] text-[11px] font-bold text-[var(--color-bg)]">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="space-y-8">
        {page.sections.map((s, i) => (
          <section key={i} className="space-y-2">
            <h3 className="text-[18px] font-bold tracking-tight">{s.heading}</h3>
            <p className="max-w-3xl text-[var(--color-fg-muted)]">{s.body}</p>
            {s.bullets && (
              <ul className="mt-2 max-w-3xl space-y-1 text-[13px] text-[var(--color-fg-muted)]">
                {s.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-[var(--color-fg)]">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-[18px] font-bold tracking-tight">Frequently asked questions</h3>
        <div className="space-y-2">
          {page.faqs.map((f, i) => (
            <details
              key={i}
              className="group border border-black/[0.06] bg-[var(--color-surface-1)] p-4 open:bg-[var(--color-surface-1)]"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-[14px] font-semibold">
                <span>{f.q}</span>
                <span className="shrink-0 text-[var(--color-fg-muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[18px] font-bold tracking-tight">Related {cat.name.toLowerCase()} tools</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => (
              <Link
                key={t.id}
                href={`/tools/${t.id}`}
                className="group block border border-black/[0.06] bg-[var(--color-surface-1)] p-3 transition-colors hover:border-black/[0.16]"
              >
                <div className="text-[13px] font-semibold">{t.name}</div>
                <div className="mt-1 line-clamp-2 text-[12px] text-[var(--color-fg-muted)]">{t.blurb}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <nav aria-label="Breadcrumb" className="border-t border-black/[0.06] pt-4 text-[12px] text-[var(--color-fg-muted)]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:underline">Home</Link></li>
          <li>›</li>
          <li><Link href="/tools" className="hover:underline">Tools</Link></li>
          <li>›</li>
          <li><Link href={`/tools/c/${cat.id}`} className="hover:underline">{cat.name}</Link></li>
          <li>›</li>
          <li className="text-[var(--color-fg)]">{tool.name}</li>
        </ol>
      </nav>
    </section>
  );
}
