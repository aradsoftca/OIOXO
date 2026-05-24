import type { ToolManifest } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { BRAND_DOMAIN } from '@/lib/brand';

const SITE = `https://${BRAND_DOMAIN}`;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function abs(path: string): string {
  return `${SITE}${BASE}${path}`;
}

export function softwareAppJsonLd(tool: ToolManifest) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.blurb,
    applicationCategory: CATEGORIES[tool.category].name + ' Tool',
    browserRequirements: 'Requires a modern browser',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: abs(`/tools/${tool.id}`),
    isAccessibleForFree: true,
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
        item: abs(`/tools?cat=${tool.category}`),
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
    step: steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
  };
}
