import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'office-slides',
  name: 'Slides Studio',
  blurb: 'Pro presentation editor in your browser — slide layouts, text, shapes, images, themes, speaker notes, export PDF/PNG. Nothing leaves your device.',
  category: 'generator', tile: 'L', icon: 'presentation', compute: 'local',
  produces: ['application/pdf', 'image/png'],
  keywords: ['slides', 'presentation', 'pitch deck', 'keynote alternative', 'powerpoint web', 'office slides', 'slideshow editor'],
  offline: true,
  pinDefault: true,
};
export default manifest;
