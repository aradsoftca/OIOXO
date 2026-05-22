import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'calc-basic',
  name: 'Basic Calculator',
  blurb: 'A fast everyday calculator — click or type, full keyboard support.',
  category: 'calc',
  tile: 'M',
  icon: 'calculator',
  compute: 'instant',
  keywords: ['calculator', 'basic calculator', 'arithmetic', 'add subtract multiply divide'],
  pinDefault: false,
  offline: true,
};

export default manifest;
