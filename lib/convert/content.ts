/**
 * Fetches the rich per-pair SEO content migrated from the old site
 * (ConversionContent, ~61k rows). Resilient: returns null if the DB is
 * unavailable (e.g. local build with a dummy DATABASE_URL) so pages still build.
 */

import { prisma } from '@/lib/db';
import { cad3dContent } from '@/lib/convert/cad3d';

export interface FaqItem { question: string; answer: string }
export interface ConversionContentData {
  title: string;
  metaDescription: string;
  intro: string;
  whyConvert: string;
  howItWorks: string;
  qualityNotes: string;
  useCases: string;
  formatComparison: string;
  faq: FaqItem[];
}

function asFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const o = x as Record<string, unknown>;
      const question = String(o.question ?? o.q ?? '').trim();
      const answer = String(o.answer ?? o.a ?? '').trim();
      return { question, answer };
    })
    .filter((f) => f.question && f.answer)
    .slice(0, 12);
}

export async function getConversionContent(slug: string): Promise<ConversionContentData | null> {
  // Hand-written CAD & 3D copy wins over the migrated old-site rows.
  const cad = cad3dContent(slug);
  if (cad) return cad;
  try {
    const row = await prisma.conversionContent.findUnique({
      where: { slug },
      select: {
        title: true, metaDescription: true, intro: true, whyConvert: true,
        howItWorks: true, qualityNotes: true, useCases: true, formatComparison: true, faq: true,
      },
    });
    if (!row) return null;
    return {
      title: row.title || '',
      metaDescription: row.metaDescription || '',
      intro: row.intro || '',
      whyConvert: row.whyConvert || '',
      howItWorks: row.howItWorks || '',
      qualityNotes: row.qualityNotes || '',
      useCases: row.useCases || '',
      formatComparison: row.formatComparison || '',
      faq: asFaq(row.faq),
    };
  } catch {
    return null;
  }
}
