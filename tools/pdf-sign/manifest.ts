import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'pdf-sign',
  name: 'Sign PDF',
  blurb: 'Draw or type your signature and place it on any page — then download the signed PDF.',
  category: 'pdf',
  tile: 'L',
  icon: 'pen-tool',
  compute: 'instant',
  accepts: ['application/pdf'],
  produces: ['application/pdf'],
  keywords: ['sign pdf', 'esign', 'electronic signature', 'add signature to pdf', 'pdf signature', 'fill and sign'],
  pinDefault: true,
  offline: true,
};

export default manifest;
