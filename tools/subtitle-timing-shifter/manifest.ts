import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-timing-shifter',
  name: 'Timing Shifter',
  blurb: 'Shift every cue forward or backward by a fixed amount.',
  category: 'subtitle', tile: 'S', icon: 'arrow-right-left', compute: 'instant',
  keywords: ['shift subtitle', 'delay subtitle', 'subtitle offset'], offline: true,
};
export default manifest;
