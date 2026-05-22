import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'calc-age',
  name: 'Age Calculator',
  blurb: 'Calculate exact age — years, months, days, hours, and minutes.',
  category: 'calc',
  tile: 'M',
  icon: 'cake',
  compute: 'instant',
  keywords: ['age', 'birthday', 'years old', 'date difference'],
  offline: true,
};

export default manifest;
