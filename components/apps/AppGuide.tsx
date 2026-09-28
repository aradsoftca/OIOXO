import * as React from 'react';
import Link from 'next/link';
import { APP_GUIDES, type AppGuide } from '@/lib/apps/app-guides';
import { getPolicy, type Lever } from '@/lib/limits/policy';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';
import type { RichFaq } from '@/lib/seo/content';

const BYTES: Record<string, number> = { MB: 1024 ** 2, GB: 1024 ** 3 };

function leverText(l: Lever): string {
  const n = l.unit && BYTES[l.unit] ? l.free / BYTES[l.unit] : l.free;
  return `${l.label}: ${n}${l.unit ? ' ' + l.unit : ''}`;
}

/** "Is it free?" answer derived from lib/limits/policy.ts, so the copy cannot drift from the meter. */
function freeFaq(g: AppGuide): RichFaq {
  const p = g.policyKey ? getPolicy(g.policyKey) : undefined;
  if (!p) return { q: `Is ${g.name} free?`, a: 'Yes, free to use. No account needed.' };
  const free = p.levers.filter((l) => Number.isFinite(l.free)).map(leverText).join(' · ');
  const pro = p.proValueProp.length ? ` Pro adds: ${p.proValueProp.join(', ')}.` : '';
  return { q: `Is ${g.name} free?`, a: `Yes, no account needed. Free plan — ${free}.${pro}` };
}

/** Three steps shown above the app, so a first-time visitor knows what to do before touching it. */
export function AppSteps({ app }: { app: string }) {
  const g = APP_GUIDES[app];
  if (!g) return null;
  return (
    <section aria-label={`How ${g.name} works`} className="mb-4 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3">
      <p className="text-[14px] text-[var(--color-fg)]">{g.what}</p>
      <ol className="mt-2 grid gap-2 text-[13px] text-[var(--color-fg-muted)] sm:grid-cols-3">
        {g.steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-fg)] text-[11px] font-bold text-[var(--color-bg)]">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <a href="#about-app" className="mt-2 inline-block text-[12px] text-[var(--color-fg-subtle)] underline underline-offset-2">More about {g.name} ↓</a>
    </section>
  );
}

/** The explanation below the app: what it is, what it is good for, how it works, FAQ. */
export function AppAbout({ app }: { app: string }) {
  const g = APP_GUIDES[app];
  if (!g) return null;
  const faqs = [...g.faq, freeFaq(g)];
  const others = Object.entries(APP_GUIDES).filter(([k]) => k !== app);
  return (
    <article id="about-app" className="mx-auto mt-10 max-w-3xl space-y-7 border-t border-black/[0.06] px-1 pt-8">
      <section>
        <h2 className="text-[18px] font-bold tracking-tight text-[var(--color-fg)]">What is {g.name}?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-fg)]">{g.what}</p>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-fg-muted)]">{g.how}</p>
      </section>
      <section>
        <h2 className="text-[18px] font-bold tracking-tight text-[var(--color-fg)]">Good for</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[var(--color-fg-muted)]">
          {g.goodFor.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </section>
      <section>
        <h2 className="text-[18px] font-bold tracking-tight text-[var(--color-fg)]">Frequently asked questions</h2>
        <div className="mt-3 divide-y divide-black/[0.06] border border-black/[0.08]">
          {faqs.map((f, i) => (
            <details key={i} className="group px-4">
              <summary className="flex cursor-pointer items-center justify-between gap-3 py-3 text-[14px] font-semibold text-[var(--color-fg)] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="shrink-0 text-[var(--color-fg-muted)] transition group-open:rotate-45">＋</span>
              </summary>
              <p className="pb-3 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <nav aria-label="Other apps" className="text-[13px] text-[var(--color-fg-muted)]">
        Other apps:{' '}
        {others.map(([k, o], i) => (
          <React.Fragment key={k}>
            {i > 0 && ' · '}
            <Link href={`/${k}`} prefetch={false} className="underline underline-offset-2 hover:text-[var(--color-fg)]">{o.name}</Link>
          </React.Fragment>
        ))}
        {' · '}<Link href="/apps" prefetch={false} className="underline underline-offset-2 hover:text-[var(--color-fg)]">All apps</Link>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(faqs)) }} />
    </article>
  );
}
