import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-poster',
  name: 'Poster & Flyer Studio',
  blurb: 'Canva-lite design studio to create greeting cards, posters, event flyers, and overlays with layers, fonts, and custom shapes.',
  category: 'social',
  tile: 'L',
  icon: 'layers',
  compute: 'instant',
  keywords: ['poster maker', 'flyer maker', 'card designer', 'canva-lite', 'social graphics'],
  offline: true,
};

export default manifest;
