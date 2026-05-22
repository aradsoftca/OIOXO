import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'gen-lorem-image',
  name: 'Placeholder Image',
  blurb: 'Generate a placeholder image at any size — solid, gradient, or noise, with a size label.',
  category: 'generator',
  tile: 'M',
  icon: 'image-plus',
  compute: 'instant',
  produces: ['image/png', 'image/jpeg'],
  keywords: ['placeholder', 'dummy image', 'lorem picsum', 'mock image', 'placeholder generator'],
  pinDefault: false,
  offline: true,
};

export default manifest;
