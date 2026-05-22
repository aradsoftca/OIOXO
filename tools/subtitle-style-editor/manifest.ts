import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-style-editor',
  name: 'Style Editor',
  blurb: 'Add bold, italic, or color tags to every cue at once.',
  category: 'subtitle', tile: 'M', icon: 'palette', compute: 'instant',
  keywords: ['subtitle style', 'italic', 'bold', 'color tag'], offline: true,
};
export default manifest;
