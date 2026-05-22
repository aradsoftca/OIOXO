import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-fill-form',
  name: 'Fill PDF Form',
  blurb: 'Open a fillable PDF, fill in the fields, save it back — all on your device.',
  category: 'pdf',
  tile: 'L',
  icon: 'pen-square',
  compute: 'local',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['fill pdf', 'pdf form', 'acroform', 'fillable pdf', 'edit pdf form'],
  pinDefault: false,
  offline: true,
};

export default manifest;
