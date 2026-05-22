import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-translator-prep',
  name: 'Translator Prep',
  blurb: 'Extract just the lines so you can paste into any translator and merge back.',
  category: 'subtitle', tile: 'M', icon: 'languages', compute: 'instant',
  keywords: ['translate subtitle', 'translator prep', 'srt translation'], offline: true,
};
export default manifest;
