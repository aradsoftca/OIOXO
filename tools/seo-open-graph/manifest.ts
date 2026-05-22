import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-open-graph',
  name: 'Open Graph Preview',
  blurb: 'See how your link will look when shared — Facebook, LinkedIn, Slack, Discord.',
  category: 'seo', tile: 'L', icon: 'image', compute: 'instant',
  keywords: ['open graph', 'og preview', 'social share', 'facebook', 'linkedin'], offline: true,
};
export default manifest;
