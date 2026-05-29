import type { ConversionContentData } from '@/lib/convert/content';
import { structuredDataToScript } from '@/lib/seo/jsonld';

function paras(text: string): string[] {
  return text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
}

function Section({ heading, text }: { heading: string; text: string }) {
  const ps = paras(text);
  if (!ps.length) return null;
  return (
    <section>
      <h2 className="text-[18px] font-bold tracking-tight text-[var(--color-fg)]">{heading}</h2>
      <div className="mt-2 space-y-3">
        {ps.map((p, i) => <p key={i} className="text-[14px] leading-relaxed text-[var(--color-fg-muted)]">{p}</p>)}
      </div>
    </section>
  );
}

/** SEO content block rendered below the converter on /convert/[pair]. */
export function ConversionSEO({ content, from, to }: { content: ConversionContentData; from: string; to: string }) {
  const F = from.toUpperCase(), T = to.toUpperCase();
  const faqLd = content.faq.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: content.faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      }
    : null;

  return (
    <article className="mt-10 space-y-7 border-t border-black/[0.06] pt-8">
      {paras(content.intro).length > 0 && (
        <div className="space-y-3">
          {paras(content.intro).map((p, i) => <p key={i} className="text-[15px] leading-relaxed text-[var(--color-fg)]">{p}</p>)}
        </div>
      )}

      <Section heading={`Why convert ${F} to ${T}?`} text={content.whyConvert} />
      <Section heading="How it works" text={content.howItWorks} />
      <Section heading={`${F} vs ${T}`} text={content.formatComparison} />
      <Section heading="Quality notes" text={content.qualityNotes} />
      <Section heading="Common use cases" text={content.useCases} />

      {content.faq.length > 0 && (
        <section>
          <h2 className="text-[18px] font-bold tracking-tight text-[var(--color-fg)]">Frequently asked questions</h2>
          <div className="mt-3 divide-y divide-black/[0.06] border border-black/[0.08]">
            {content.faq.map((f, i) => (
              <details key={i} className="group px-4">
                <summary className="flex cursor-pointer items-center justify-between gap-3 py-3 text-[14px] font-semibold text-[var(--color-fg)] [&::-webkit-details-marker]:hidden">
                  {f.question}
                  <span className="shrink-0 text-[var(--color-fg-muted)] transition group-open:rotate-45">＋</span>
                </summary>
                <p className="pb-3 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {faqLd && (
        // eslint-disable-next-line react/no-danger
        // structuredDataToScript escapes `<` to `<` so a `</script>` in
        // the migrated FAQ content can't break out of the JSON-LD tag — the
        // raw `JSON.stringify` here was vulnerable.
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqLd) }} />
      )}
    </article>
  );
}
