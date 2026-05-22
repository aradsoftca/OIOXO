import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-gradient',
  name: 'CSS Gradient',
  blurb: 'Visual gradient builder — copy the CSS, PNG, or SVG.',
  category: 'generator', tile: 'M', icon: 'rainbow', compute: 'instant',
  keywords: ['gradient', 'css gradient', 'linear', 'radial'], offline: true,
};
export default manifest;
