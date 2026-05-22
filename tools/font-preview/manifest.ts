import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'font-preview',
  name: 'Font Preview',
  blurb: 'See your font in any size, weight, and sample text — instantly.',
  category: 'font', tile: 'L', icon: 'type', compute: 'local',
  accepts: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2'],
  keywords: ['font', 'preview', 'sample text', 'ttf', 'otf', 'woff'], offline: true,
};
export default manifest;
