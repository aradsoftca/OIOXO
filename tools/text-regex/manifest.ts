import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'text-regex',
  name: 'Regex Find & Replace',
  blurb: 'Full JavaScript regex with capture groups, flags, and replacement patterns.',
  category: 'text', tile: 'M', icon: 'regex', compute: 'instant',
  keywords: ['regex', 'regular expression', 'pattern', 'replace'], offline: true,
};
export default manifest;
