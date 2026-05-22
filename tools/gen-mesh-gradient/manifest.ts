import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'gen-mesh-gradient',
  name: 'Mesh Gradient',
  blurb: 'Generate soft multi-color mesh gradients — shuffle, tweak, export PNG or CSS.',
  category: 'generator',
  tile: 'L',
  icon: 'blend',
  compute: 'instant',
  produces: ['image/png', 'text/css'],
  keywords: ['mesh gradient', 'gradient generator', 'background gradient', 'blob gradient', 'aurora background'],
  pinDefault: false,
  offline: true,
};

export default manifest;
