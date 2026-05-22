import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-css-text-shadow',
  name: 'CSS Text Shadow',
  blurb: 'Layer text shadows on a live preview and copy the CSS instantly.',
  category: 'generator', tile: 'M', icon: 'type', compute: 'instant',
  keywords: ['css', 'text shadow', 'shadow', 'text', 'glow', 'neon'],
  offline: true,
};
export default manifest;
