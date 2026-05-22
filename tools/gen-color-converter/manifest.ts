import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-color-converter',
  name: 'Color Converter',
  blurb: 'HEX, RGB, HSL, HSV — convert any color to every format.',
  category: 'generator', tile: 'M', icon: 'pipette', compute: 'instant',
  keywords: ['color converter', 'hex to rgb', 'hsl', 'hsv'], offline: true,
};
export default manifest;
