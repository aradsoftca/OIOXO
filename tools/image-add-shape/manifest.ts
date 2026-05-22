import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'image-add-shape',
  name: 'Annotate Image',
  blurb: 'Mark up any screenshot — rectangles, circles, arrows, lines.',
  category: 'image',
  tile: 'M',
  icon: 'square-dashed',
  compute: 'instant',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/jpeg'],
  keywords: ['annotate', 'markup', 'screenshot', 'arrow', 'rectangle', 'circle', 'highlight'],
  pinDefault: false,
  offline: true,
};

export default manifest;
