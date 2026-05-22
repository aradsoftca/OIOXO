'use client';
import * as React from 'react';
import { extractTitle, extractMeta } from '@/engines/html';
import { FetchUrlBar } from '@/components/tool/FetchUrlBar';

interface Tw {
  card: string;
  title: string;
  description: string;
  image: string;
  site: string;
  url: string;
}

function parse(html: string): Tw {
  const metas = extractMeta(html);
  const tw = (k: string) => metas.find((m) => m.name?.toLowerCase() === `twitter:${k}`)?.content ?? '';
  const og = (k: string) => metas.find((m) => m.property?.toLowerCase() === `og:${k}`)?.content ?? '';
  return {
    card:        tw('card') || 'summary_large_image',
    title:       tw('title')       || og('title')       || extractTitle(html),
    description: tw('description') || og('description') || metas.find((m) => m.name?.toLowerCase() === 'description')?.content || '',
    image:       tw('image')       || og('image'),
    site:        tw('site'),
    url:         og('url'),
  };
}

export default function Tool() {
  const [html, setHtml] = React.useState('');
  const tw = React.useMemo(() => html.trim() ? parse(html) : { card: '', title: '', description: '', image: '', site: '', url: '' }, [html]);
  const host = tw.url ? (() => { try { return new URL(tw.url).hostname; } catch { return ''; } })() : '';
  const large = tw.card === 'summary_large_image';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <FetchUrlBar endpoint="/api/seo/fetch" onText={setHtml} colorVar="--color-cat-seo" placeholder="https://example.com — fetch live tags" />
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">…or paste HTML / twitter:* meta tags</div>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
          placeholder={`<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="…">\n<meta name="twitter:description" content="…">\n<meta name="twitter:image" content="…">`}
          className="h-96 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none"
        />
      </div>

      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Card type: {tw.card || 'summary_large_image'}
          </div>
          <div className="overflow-hidden rounded-2xl border border-black/[0.1] bg-[oklch(98%_0.003_250)]">
            {large ? (
              <>
                {tw.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tw.image} alt="" className="aspect-[1.91/1] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[1.91/1] place-items-center bg-[oklch(90%_0.012_80)] text-[11px] text-[var(--color-fg-subtle)]">No image</div>
                )}
                <div className="px-4 py-3">
                  <div className="text-[10px] text-[var(--color-fg-subtle)]">{host || ''}</div>
                  <div className="mt-1 line-clamp-2 text-[14px] font-semibold">{tw.title || '— title missing —'}</div>
                </div>
              </>
            ) : (
              <div className="flex gap-3 p-3">
                {tw.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tw.image} alt="" className="aspect-square h-24 w-24 shrink-0 object-cover" />
                ) : (
                  <div className="grid h-24 w-24 shrink-0 place-items-center bg-[oklch(90%_0.012_80)] text-[10px] text-[var(--color-fg-subtle)]">No img</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-[var(--color-fg-subtle)]">{host}</div>
                  <div className="mt-1 line-clamp-2 text-[13px] font-semibold">{tw.title || '— title missing —'}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] text-[var(--color-fg-muted)]">{tw.description || '— description missing —'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
