import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'text-lowercase',
  name: 'lowercase',
  blurb: 'Convert text to lowercase — fast and private.',
  category: 'text',
  tile: 'S',
  icon: 'arrow-down-to-line',
  compute: 'instant',
  keywords: ['lowercase', 'case', 'text'],
  offline: true,
};

export default manifest;
