import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'image-studio',
  name: 'Image Studio',
  blurb: 'A mini photo editor in your browser — layers, text, brush & eraser, shapes, crop, and adjustments with full undo/redo. Export to PNG, JPG, or WebP.',
  category: 'image', tile: 'L', icon: 'brush', compute: 'local',
  accepts: ['image/*'],
  produces: ['image/png', 'image/jpeg', 'image/webp'],
  keywords: ['photo editor', 'image editor', 'layers', 'draw', 'paint', 'text on image', 'crop', 'mini photoshop', 'adjustments', 'studio'],
  offline: true,
  pinDefault: true,
};
export default manifest;
