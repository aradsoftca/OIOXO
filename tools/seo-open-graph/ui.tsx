'use client';
import * as React from 'react';
import { extractTitle, extractMeta } from '@/engines/html';
import { FetchUrlBar } from '@/components/tool/FetchUrlBar';

interface OG {
  title: string;
  description: string;
  image: string;
  url: string;
  siteName: string;
}

function parseOg(html: string): OG {
  const metas = extractMeta(html);
  const find = (prop: string) => metas.find((m) => m.property?.toLowerCase() === prop)?.content ?? '';
  return {
    title:       find('og:title')       || extractTitle(html),
    description: find('og:description') || metas.find((m) => m.name?.toLowerCase() === 'description')?.content || '',
    image:       find('og:image'),
    url:         find('og:url'),
    siteName:    find('og:site_name'),
  };
}

export default function Tool() {
  const [html, setHtml] = React.useState('');
  const og = React.useMemo(() => html.trim() ? parseOg(html) : { title: '', description: '', image: '', url: '', siteName: '' }, [html]);
  const host = og.url ? (() => { try { return new URL(og.url).hostname; } catch { return og.siteName; } })() : og.siteName;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <FetchUrlBar endpoint="/api/seo/fetch" onText={setHtml} colorVar="--color-cat-seo" placeholder="https://example.com — fetch live tags" />
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">…or paste HTML / OG meta tags</div>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
          placeholder={`<meta property="og:title" content="…">\n<meta property="og:description" content="…">\n<meta property="og:image" content="…">\n<meta property="og:url" content="…">`}
          className="h-96 w-full border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[12px] outline-none"
        />
      </div>

      <div className="space-y-5">
        {/* Facebook / LinkedIn */}
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Facebook · LinkedIn</div>
          <div className="overflow-hidden border border-black/[0.1] bg-[oklch(98%_0.003_250)]">
            {og.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={og.image} alt="" className="aspect-[1.91/1] w-full object-cover" />
            ) : (
              <div className="grid aspect-[1.91/1] place-items-center bg-[oklch(90%_0.012_80)] text-[11px] text-[var(--color-fg-subtle)]">No image — og:image</div>
            )}
            <div className="border-t border-black/[0.06] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">{host || 'example.com'}</div>
              <div className="mt-1 line-clamp-2 text-[14px] font-semibold text-[var(--color-fg)]">{og.title || '— title missing —'}</div>
              <div className="mt-1 line-clamp-2 text-[12px] text-[var(--color-fg-muted)]">{og.description || '— description missing —'}</div>
            </div>
          </div>
        </div>

        {/* Slack / Discord style */}
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Slack · Discord</div>
          <div className="flex gap-3 border-l-4 border-[var(--color-cat-seo)] bg-[oklch(98%_0.003_250)] p-3">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-[var(--color-fg)] hover:underline truncate">{og.title || '— title missing —'}</div>
              <div className="mt-1 text-[12px] text-[var(--color-fg-muted)] line-clamp-3">{og.description || '— description missing —'}</div>
              <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">{host || 'example.com'}</div>
            </div>
            {og.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={og.image} alt="" className="h-20 w-20 shrink-0 border border-black/[0.06] object-cover" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
