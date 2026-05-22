import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-character-counter',
  name: 'Character Counter',
  blurb: 'Count characters per line and per second — flag cues that read too fast.',
  category: 'subtitle', tile: 'M', icon: 'gauge', compute: 'instant',
  keywords: ['subtitle character count', 'cps', 'reading speed'], offline: true,
};
export default manifest;
