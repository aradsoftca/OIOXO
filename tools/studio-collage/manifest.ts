import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-collage',
  name: 'Collage Studio',
  blurb: 'Design custom photo grids, Instagram collages, and masonry layouts with gaps, border controls, and scale/offsets.',
  category: 'image',
  tile: 'L',
  icon: 'layout-grid',
  compute: 'instant',
  keywords: ['photo collage', 'collage maker', 'grid maker', 'instagram grid', 'photo grid', 'masonry'],
  offline: true,
};

export default manifest;
