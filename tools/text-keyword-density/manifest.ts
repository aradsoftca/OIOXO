import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-keyword-density',
  name: 'Keyword Density',
  blurb: 'Count every word and rank by frequency — stopwords filtered.',
  category: 'text',
  accepts: ['text/*'], tile: 'M', icon: 'bar-chart-3', compute: 'instant',
  keywords: ['keyword density', 'word frequency', 'SEO analysis'], offline: true,
};
export default manifest;
