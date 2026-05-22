import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-html-encode',
  name: 'HTML Entities',
  blurb: 'Encode or decode HTML entities — toggle direction.',
  category: 'text', tile: 'S', icon: 'code-2', compute: 'instant',
  keywords: ['html encode', 'html decode', 'entities', 'escape html'], offline: true,
};
export default manifest;
