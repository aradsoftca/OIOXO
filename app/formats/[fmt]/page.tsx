import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMeta } from '@/lib/seo/meta';
import { CAD3D_FORMATS } from '@/lib/convert/cad3d';
import { FORMAT_PROFILES } from '@/lib/convert/format-profiles';
import { CONVERT_PAIRS } from '@/lib/convert/pairs';
import { getConversionContent } from '@/lib/convert/content';
import { TOOLS } from '@/lib/registry';

const PROFILES: Record<string, { name: string; what: string; usedBy: string; tools?: string[] }> = { ...FORMAT_PROFILES, ...CAD3D_FORMATS };

/**
 * Format encyclopedia entry. Only formats with a hand-written, checked profile
 * get a page, and only conversions that really work (and are tested) are
 * listed — never generate these in bulk. Starts with CAD & 3D (lib/convert/cad3d.ts).
 */
type Props = { params: Promise<{ fmt: string }> };

export function generateStaticParams() {
  return Object.keys(PROFILES).map((fmt) => ({ fmt }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fmt } = await params;
  const f = PROFILES[fmt];
  if (!f) return {};
  return buildMeta({
    path: `/formats/${fmt}`,
    title: `${fmt.toUpperCase()} file format — what it is and how to convert it`,
    description: `${f.what.split('. ')[0]}. See which programs use ${fmt.toUpperCase()} and convert it privately in your browser.`,
  });
}

export default async function FormatPage({ params }: Props) {
  const { fmt } = await params;
  const f = PROFILES[fmt];
  if (!f) notFound();
  // Only conversion pages with real (hand-written) content — the indexed ones.
  const real = async (list: typeof CONVERT_PAIRS) => {
    const out: typeof CONVERT_PAIRS = [];
    for (const p of list) if (await getConversionContent(`${p.from}-to-${p.to}`)) out.push(p);
    return out;
  };
  const from = await real(CONVERT_PAIRS.filter((p) => p.from === fmt));
  const to = await real(CONVERT_PAIRS.filter((p) => p.to === fmt));
  const tools = (f.tools ?? []).map((id) => TOOLS.find((t) => t.id === id)).filter((t): t is (typeof TOOLS)[number] => !!t);
  const pairLink = (p: { from: string; to: string }) => (
    <Link
      prefetch={false}
      key={`${p.from}-${p.to}`}
      href={`/convert/${p.from}-to-${p.to}`}
      className="inline-flex min-h-[44px] items-center border border-black/[0.08] bg-[var(--color-surface-1)] px-4 font-mono text-[14px] font-semibold hover:bg-[var(--color-surface-2)]"
    >
      {p.from.toUpperCase()} → {p.to.toUpperCase()}
    </Link>
  );
  return (
    <div className="mx-auto w-[min(860px,96vw)] space-y-8 py-6">
      <nav className="text-[12px] text-[var(--color-fg-muted)]">
        <Link href="/formats" className="inline-flex min-h-[44px] items-center hover:underline">Formats</Link> ·{' '}
        {CAD3D_FORMATS[fmt] && <Link href="/cad-3d" className="inline-flex min-h-[44px] items-center hover:underline">CAD &amp; 3D</Link>}
      </nav>
      <header className="space-y-3">
        <h1 className="break-words text-[28px] font-bold tracking-tight text-[var(--color-fg)] sm:text-[32px]">{f.name}</h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-fg)]">{f.what}</p>
        <p className="text-[14px] leading-relaxed text-[var(--color-fg-muted)]"><strong>Used by:</strong> {f.usedBy}</p>
      </header>
      {from.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-bold tracking-tight">Convert {fmt.toUpperCase()} to…</h2>
          <div className="flex flex-wrap gap-2">{from.map(pairLink)}</div>
        </section>
      )}
      {to.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-bold tracking-tight">Convert to {fmt.toUpperCase()} from…</h2>
          <div className="flex flex-wrap gap-2">{to.map(pairLink)}</div>
        </section>
      )}
      {tools.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-bold tracking-tight">Tools for {fmt.toUpperCase()} files</h2>
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => (
              <Link prefetch={false} key={t.id} href={`/tools/${t.id}`} className="inline-flex min-h-[44px] items-center border border-black/[0.08] bg-[var(--color-surface-1)] px-4 text-[14px] font-medium hover:bg-[var(--color-surface-2)]">
                {t.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className="text-[13px] text-[var(--color-fg-muted)]">
        Every conversion runs in your browser with open-source engines — your file is never uploaded.
      </p>
    </div>
  );
}
