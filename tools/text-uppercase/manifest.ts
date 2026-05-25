import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'text-uppercase',
  name: 'UPPERCASE',
  blurb: 'Convert any text to UPPERCASE — instant.',
  category: 'text',
  accepts: ['text/*'],
  tile: 'S',
  icon: 'arrow-up-from-line',
  compute: 'instant',
  keywords: ['uppercase', 'case', 'capitalize', 'all caps', 'text'],
  offline: true,
};

export default manifest;
