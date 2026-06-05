import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-monitor', name: 'Monitor / Dead Pixel Test',
  blurb: 'Full-screen solid colors and gradients to find dead or stuck pixels, backlight bleed, and color banding.',
  category: 'test', tile: 'M', icon: 'monitor', compute: 'instant',
  keywords: ['dead pixel test', 'monitor test', 'stuck pixel', 'screen test', 'backlight bleed', 'color banding', 'display test'], offline: true, pinDefault: true,
};
export default manifest;
