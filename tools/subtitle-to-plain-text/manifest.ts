import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-to-plain-text',
  name: 'Subtitle → Text',
  blurb: 'Pull the dialogue out of a subtitle file — pure text, no timestamps.',
  category: 'subtitle', tile: 'S', icon: 'align-left', compute: 'instant',
  keywords: ['subtitle to text', 'transcript', 'extract dialogue'], offline: true,
};
export default manifest;
