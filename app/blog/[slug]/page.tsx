import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { POSTS, getPost } from '@/lib/blog/posts';
import { BRAND } from '@/lib/brand';

interface Props { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { title: `${post.title} · ${BRAND}`, description: post.excerpt, type: 'article' },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <div className="mx-auto w-[min(720px,94vw)] py-6">
      <Link href="/blog" className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
        <ArrowLeft className="h-3.5 w-3.5" /> All posts
      </Link>
      <div className="text-[11px] text-[var(--color-fg-subtle)]">
        {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
      <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-tight text-[var(--color-fg)]">{post.title}</h1>
      <article className="mt-6 space-y-4">
        {post.body.map((b, i) =>
          b.type === 'h2'
            ? <h2 key={i} className="pt-3 text-[18px] font-bold tracking-tight text-[var(--color-fg)]">{b.text}</h2>
            : <p key={i} className="text-[15px] leading-relaxed text-[var(--color-fg-muted)]">{b.text}</p>,
        )}
      </article>
      <div className="mt-10 border-t border-black/[0.06] pt-5 text-[13px] text-[var(--color-fg-muted)]">
        Try it now — <Link href="/convert" className="font-semibold text-[var(--brand-1)] hover:underline">open the converter</Link>.
      </div>
    </div>
  );
}
