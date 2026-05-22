import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-remove-extra-spaces',
  name: 'Remove Extra Spaces',
  blurb: 'Collapse runs of whitespace and trim each line.',
  category: 'text', tile: 'S', icon: 'space', compute: 'instant',
  keywords: ['remove spaces', 'collapse whitespace', 'trim', 'clean'], offline: true,
};
export default manifest;
