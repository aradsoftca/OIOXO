import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'social-og',
  name: 'OG Image Creator',
  blurb: 'Build a 1200×630 share image — title, subtitle, gradient, logo.',
  category: 'social', tile: 'L', icon: 'image', compute: 'instant',
  produces: ['image/png', 'image/jpeg'],
  keywords: ['og image', 'social card', 'twitter card', 'meta image'], offline: true,
};
export default manifest;
