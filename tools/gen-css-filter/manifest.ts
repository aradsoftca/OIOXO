import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-css-filter',
  name: 'CSS Filter',
  blurb: 'Dial in blur, brightness, contrast, hue and more — copy the CSS filter live.',
  category: 'generator', tile: 'M', icon: 'sliders-horizontal', compute: 'instant',
  keywords: ['css', 'filter', 'blur', 'brightness', 'contrast', 'grayscale', 'sepia', 'hue'],
  offline: true,
};
export default manifest;
