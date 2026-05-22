import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/lib/blog/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Guides and notes from Xonvert — file formats, privacy-first tools, and how to get more done in your browser.',
};

export default function BlogPage() {
  const posts = [...POSTS].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <div className="mx-auto w-[min(760px,94vw)] py-6">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Blog</div>
      <h1 className="text-[28px] font-bold tracking-tight">Notes &amp; guides</h1>
      <div className="mt-6 divide-y divide-black/[0.06] border border-black/[0.08] bg-[var(--color-surface-1)]">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="block px-5 py-4 transition hover:bg-white">
            <div className="text-[11px] text-[var(--color-fg-subtle)]">{new Date(p.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className="mt-0.5 text-[16px] font-bold tracking-tight text-[var(--color-fg)]">{p.title}</div>
            <div className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{p.excerpt}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
