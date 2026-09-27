import type { ToolManifest } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';
import type { RichFaq, RichPage } from './content';

const SITE = `https://${BRAND_DOMAIN}`;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function abs(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE}${BASE}${path.startsWith('/') ? path : '/' + path}`;
}

export function softwareAppJsonLd(tool: ToolManifest) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    description: tool.blurb,
    applicationCategory: CATEGORIES[tool.category].name + ' Tool',
    applicationSubCategory: tool.category,
    browserRequirements: 'Requires a modern browser with JavaScript enabled',
    operatingSystem: 'Any (Windows / macOS / Linux / iOS / Android / ChromeOS)',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: abs(`/tools/${tool.id}`),
    isAccessibleForFree: true,
    publisher: {
      '@type': 'Organization',
      name: BRAND,
      url: SITE,
    },
    inLanguage: 'en',
    permissions: 'No permissions required',
  };
}

export function breadcrumbJsonLd(tool: ToolManifest) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: abs('/tools') },
      {
        '@type': 'ListItem',
        position: 3,
        name: CATEGORIES[tool.category].name,
        item: abs(`/tools/c/${tool.category}`),
      },
      { '@type': 'ListItem', position: 4, name: tool.name, item: abs(`/tools/${tool.id}`) },
    ],
  };
}

export function howToJsonLd(tool: ToolManifest, steps: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to use ${tool.name}`,
    description: tool.blurb,
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
    tool: [{ '@type': 'HowToTool', name: 'Modern web browser' }],
    step: steps.map((text, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: `Step ${i + 1}`,
      text,
      url: `${abs(`/tools/${tool.id}`)}#step-${i + 1}`,
    })),
  };
}

export function faqPageJsonLd(faqs: RichFaq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    url: SITE,
    logo: abs('/logo.png'),
    sameAs: [],
  };
}

export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: SITE,
    name: BRAND,
    // No SearchAction: /search?q= 404s (and /*? is robots-disallowed).
  };
}

export function articleJsonLd(opts: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    url: abs(opts.url),
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: { '@type': 'Person', name: opts.author ?? BRAND },
    publisher: {
      '@type': 'Organization',
      name: BRAND,
      logo: { '@type': 'ImageObject', url: abs('/logo.png') },
    },
    mainEntityOfPage: abs(opts.url),
  };
}

export function buildToolPageStructuredData(tool: ToolManifest, page: RichPage) {
  const items = [
    softwareAppJsonLd(tool),
    breadcrumbJsonLd(tool),
    howToJsonLd(tool, page.steps),
    faqPageJsonLd(page.faqs),
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': items,
  };
}

export function structuredDataToScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
