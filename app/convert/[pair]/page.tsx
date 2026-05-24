import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CONVERT_PAIRS, getPair, pairTitle, pairBlurb } from '@/lib/convert/pairs';
import { getTool } from '@/lib/registry';
import { ConvertFrame } from '@/components/tool/ConvertFrame';
import { getConversionContent } from '@/lib/convert/content';
import { ConversionSEO } from '@/components/convert/ConversionSEO';
import { BRAND } from '@/lib/brand';

interface Props { params: Promise<{ pair: string }>; }

export function generateStaticParams() {
  return CONVERT_PAIRS.map((p) => ({ pair: `${p.from}-to-${p.to}` }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair: slug } = await params;
  const pair = getPair(slug);
  if (!pair) return {};
  const title = pairTitle(pair);
  const blurb = pairBlurb(pair);
  const content = await getConversionContent(slug);
  return {
    title: content?.title ? `${content.title}` : `${title} — Convert online`,
    description: content?.metaDescription || blurb,
    keywords: [
      `${pair.from} to ${pair.to}`,
      `convert ${pair.from} to ${pair.to}`,
      `${pair.from.toUpperCase()} to ${pair.to.toUpperCase()}`,
      'convert online',
      'file converter',
    ],
    openGraph: { title: `${title} · ${BRAND}`, description: blurb },
    alternates: { canonical: `/convert/${slug}` },
  };
}

const loading = () => <div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />;

const ToolModules: Record<string, ReturnType<typeof dynamic>> = {
  'image-convert-format': dynamic(() => import('@/tools/image-convert-format/ui'), { loading }),
  'audio-convert-format': dynamic(() => import('@/tools/audio-convert-format/ui'), { loading }),
  'video-to-gif':         dynamic(() => import('@/tools/video-to-gif/ui'),         { loading }),
  'video-extract-audio':  dynamic(() => import('@/tools/video-extract-audio/ui'),  { loading }),
  'video-convert-format': dynamic(() => import('@/tools/video-convert-format/ui'), { loading }),
  'images-to-video':      dynamic(() => import('@/tools/images-to-video/ui'),      { loading }),
  'pdf-to-images':        dynamic(() => import('@/tools/pdf-to-images/ui'),        { loading }),
  'images-to-pdf':        dynamic(() => import('@/tools/images-to-pdf/ui'),        { loading }),
  'pdf-to-text':          dynamic(() => import('@/tools/pdf-to-text/ui'),          { loading }),
  'image-ocr':            dynamic(() => import('@/tools/image-ocr/ui'),            { loading }),
  'audio-to-text':        dynamic(() => import('@/tools/audio-to-text/ui'),        { loading }),
};

export default async function ConvertPairPage({ params }: Props) {
  const { pair: slug } = await params;
  const pair = getPair(slug);
  if (!pair) notFound();

  const tool = getTool(pair.toolId);
  const ToolUI = ToolModules[pair.toolId];
  const content = await getConversionContent(slug);

  return (
    <ConvertFrame pair={pair}>
      <div className="space-y-6">
        {ToolUI ? <ToolUI /> : (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[var(--color-fg-muted)]">
            This conversion is registered but the underlying tool isn&apos;t wired yet.
          </div>
        )}

        {tool && (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] text-[var(--color-fg-muted)]">
            Powered by{' '}
            <Link href={`/tools/${tool.id}`} className="font-semibold text-[var(--color-fg)] underline-offset-2 hover:underline">
              {tool.name}
            </Link>
            . Need more control? Open the full tool.
          </div>
        )}

        {content && <ConversionSEO content={content} from={pair.from} to={pair.to} />}
      </div>
    </ConvertFrame>
  );
}
