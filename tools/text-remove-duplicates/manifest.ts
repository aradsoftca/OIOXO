import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-remove-duplicates',
  name: 'Remove Duplicates',
  blurb: 'Dedupe lines — case-sensitive or insensitive, preserving order.',
  category: 'text', tile: 'S', icon: 'copy-minus', compute: 'instant',
  keywords: ['deduplicate', 'unique lines', 'remove duplicates'], offline: true,
};
export default manifest;
