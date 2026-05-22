import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-remove-numbers',
  name: 'Remove Numbers',
  blurb: 'Strip every digit (or every numeric token) from any text.',
  category: 'text', tile: 'S', icon: 'minus', compute: 'instant',
  keywords: ['remove digits', 'strip numbers'], offline: true,
};
export default manifest;
