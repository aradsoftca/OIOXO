import { notFound } from 'next/navigation';
import { ToolUIHost, StudioLoading } from './tool-modules';
import type { Metadata } from 'next';
import { getTool, TOOLS } from '@/lib/registry';
import { ToolFrame } from '@/components/tool/ToolFrame';
import { StudioFrame } from '@/components/tool/StudioFrame';
import { buildToolPageStructuredData, structuredDataToScript } from '@/lib/seo/jsonld';
import { buildMeta } from '@/lib/seo/meta';
import { buildRichPage } from '@/lib/seo/content';
import { RichToolSection } from '@/components/seo/RichToolSection';
import { PolicyHint } from '@/components/limits/PolicyHint';
import { UsageMeter } from '@/components/usage/UsageMeter';
import { ClientOnly } from '@/components/tool/ClientOnly';
import { ChunkErrorBoundary } from '@/components/tool/ChunkErrorBoundary';
import { FULLSCREEN_STUDIO_IDS } from '@/lib/studios/fullscreen';
import { FOCUS_TOOL_IDS } from '@/lib/seo/focus-tools';
import { IS_OIOXO } from '@/lib/brand';

function findRelated(toolId: string, category: string, limit = 6) {
  return TOOLS.filter((t) => t.category === category && t.id !== toolId).slice(0, limit);
}

interface Props {
  params: Promise<{ slug: string }>;
}

// Studios are 100% client-side (canvas/WebGL/WebCodecs/WASM) and some touch
// `document` at module-import time, which throws during static export. Exclude
// them from build-time prerender — `dynamicParams` (default true) renders them
// on first request instead, still client-gated by <ClientOnly>. Content tools
// keep their static SEO pages.
const NO_PRERENDER = new Set(
  TOOLS.filter((t) => /(^|-)studio(s|-|$)/.test(t.id)).map((t) => t.id),
);

// The heavy, full-screen editors (timeline / canvas / multi-panel) that should
// OWN the viewport like a real desktop app (CapCut, Photopea) instead of being
// pushed below a marketing banner. These render in <StudioFrame> (slim bar +
// 100dvh editor + SEO moved below the fold). Lighter "studio-*" generators
// (meme, qr, collage…) stay in the normal <ToolFrame> form layout. The list is
// the shared SSOT in lib/studios/fullscreen so the route and AppShell (which
// hides the global chrome for these paths) can never drift apart.
const FULLSCREEN_STUDIOS = FULLSCREEN_STUDIO_IDS;

export function generateStaticParams() {
  return TOOLS.filter((t) => !NO_PRERENDER.has(t.id)).map((t) => ({ slug: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  const page = buildRichPage(tool);
  return buildMeta({
    path: `/tools/${tool.id}`,
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    // Only the focus tools are offered to Google for now (see lib/seo/focus-tools.ts).
    noindex: !IS_OIOXO && !FOCUS_TOOL_IDS.has(tool.id) && !FULLSCREEN_STUDIOS.has(tool.id),
  });
}


export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();


  const related = findRelated(tool.id, tool.category);
  const page = buildRichPage(tool, related.map((r) => r.id));
  const structuredData = buildToolPageStructuredData(tool, page);
  const jsonLd = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: structuredDataToScript(structuredData) }}
    />
  );

  // Full-screen studios own the viewport like a desktop editor; the marketing
  // banner and SEO copy move below the fold (still crawlable) instead of
  // burying the editor.
  if (FULLSCREEN_STUDIOS.has(tool.id)) {
    return (
      <>
        <StudioFrame
          tool={tool}
          about={
            <>
              <PolicyHint toolKey={tool.id} fallbackKey={tool.category} />
              <RichToolSection tool={tool} page={page} related={related} />
            </>
          }
        >
          <ClientOnly fallback={<StudioLoading />}>
            <ChunkErrorBoundary fallback={<StudioLoading />}>
              <ToolUIHost id={tool.id} />
            </ChunkErrorBoundary>
          </ClientOnly>
        </StudioFrame>
        {jsonLd}
      </>
    );
  }

  return (
    <ToolFrame tool={tool}>
      <ClientOnly>
        <ChunkErrorBoundary>
          <ToolUIHost id={tool.id} />
        </ChunkErrorBoundary>
      </ClientOnly>
      {/* Limits + upsell after the tool, not before it: the drop zone comes first. */}
      <PolicyHint toolKey={tool.id} fallbackKey={tool.category} />
      <UsageMeter category={tool.category} toolId={tool.id} />
      <RichToolSection tool={tool} page={page} related={related} />
      {jsonLd}
    </ToolFrame>
  );
}
