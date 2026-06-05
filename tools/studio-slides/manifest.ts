import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-slides',
  name: 'Slides Studio',
  blurb: 'Build a presentation in your browser — themed slides with titles and content, then export the whole deck to PDF or each slide to PNG. On-device.',
  category: 'convert',
  tile: 'L',
  icon: 'presentation',
  compute: 'local',
  produces: ['application/pdf', 'image/png'],
  keywords: ['powerpoint online', 'slides maker', 'presentation maker', 'slide deck', 'pptx alternative', 'slides to pdf'],
  offline: true,
};

export default manifest;
