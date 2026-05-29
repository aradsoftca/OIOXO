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
import { buildMeta } from '@/lib/seo/meta';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';
import { PolicyHint } from '@/components/limits/PolicyHint';

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
  const hasRichContent = !!content || !!pair.popular;
  return buildMeta({
    path: `/convert/${slug}`,
    title: content?.title
      ? content.title
      : `Convert ${pair.from.toUpperCase()} to ${pair.to.toUpperCase()} — free, no upload`,
    description: content?.metaDescription || blurb,
    keywords: [
      `${pair.from} to ${pair.to}`,
      `convert ${pair.from} to ${pair.to}`,
      `${pair.from.toUpperCase()} to ${pair.to.toUpperCase()}`,
      `${pair.from} to ${pair.to} converter`,
      `free ${pair.from} to ${pair.to}`,
      `${pair.from} to ${pair.to} no upload`,
    ],
    noindex: !hasRichContent,
  });
}

function buildConvertFaqs(pair: { from: string; to: string }) {
  const from = pair.from.toUpperCase();
  const to = pair.to.toUpperCase();
  return [
    {
      q: `Is the ${from} to ${to} converter free?`,
      a: `Yes. Converting ${from} to ${to} on ${BRAND} is free, with no signup, no credit card, no limits, and no watermark on standard files.`,
    },
    {
      q: `Do my files get uploaded?`,
      a: `No. The conversion runs entirely in your browser — your file never leaves your device. We can't see it, store it, or use it for training.`,
    },
    {
      q: `Is the converted ${to} file high quality?`,
      a: `Yes. The conversion uses standards-compliant encoders that produce bit-accurate output, the same quality you'd get from a native desktop application.`,
    },
    {
      q: `Can I convert ${from} to ${to} on mobile?`,
      a: `Yes. The converter works in any modern mobile browser — Safari on iPhone/iPad, Chrome on Android — with no app to install.`,
    },
    {
      q: `Do I need to be online?`,
      a: `Only to load the page the first time. After that the converter works fully offline because all the conversion code lives in your browser cache.`,
    },
  ];
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
        {pair.toolId && <PolicyHint toolKey={pair.toolId} fallbackKey="convert" />}
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

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(buildConvertFaqs(pair))) }}
        />
      </div>
    </ConvertFrame>
  );
}
