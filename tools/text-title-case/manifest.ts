import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'text-title-case',
  name: 'Title Case',
  blurb: 'Capitalize the first letter of every word in a smart, modern way.',
  category: 'text',
  tile: 'S',
  icon: 'case-sensitive',
  compute: 'instant',
  keywords: ['title case', 'capitalize', 'case'],
  offline: true,
};

export default manifest;
