import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-remove-letters',
  name: 'Remove Letters',
  blurb: 'Keep numbers and punctuation, strip every letter.',
  category: 'text',
  accepts: ['text/*'], tile: 'S', icon: 'minus', compute: 'instant',
  keywords: ['remove letters', 'strip alpha'], offline: true,
};
export default manifest;
