import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-redact',
  name: 'Redact & Annotate',
  blurb: 'Hide sensitive info and mark up images — black-out or blur regions, add arrows and text, then export. Photos never leave your device.',
  category: 'image',
  tile: 'L',
  icon: 'square-dashed',
  compute: 'instant',
  accepts: ['image/*'],
  produces: ['image/png'],
  keywords: ['redact image', 'blur sensitive info', 'hide text in photo', 'annotate image', 'markup screenshot', 'censor image'],
  offline: true,
};

export default manifest;
