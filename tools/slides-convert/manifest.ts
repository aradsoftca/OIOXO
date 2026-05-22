import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'slides-convert',
  name: 'Slides Converter',
  blurb: 'Pull the text out of PowerPoint (.pptx/.ppt) and OpenDocument (.odp) decks → PDF, HTML or text.',
  category: 'convert',
  tile: 'L',
  icon: 'presentation',
  compute: 'local',
  accepts: ['.pptx', '.ppt', '.odp'],
  produces: ['application/pdf', 'text/html', 'text/plain'],
  keywords: ['pptx to pdf', 'ppt to pdf', 'odp to pdf', 'powerpoint to text', 'slides to pdf', 'presentation converter'],
  pinDefault: false,
  offline: true,
};

export default manifest;
