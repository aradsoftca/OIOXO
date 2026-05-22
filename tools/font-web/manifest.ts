import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'font-web',
  name: 'Web Font Generator',
  blurb: 'Get a ready-to-paste @font-face snippet with your font embedded.',
  category: 'font', tile: 'M', icon: 'code-2', compute: 'local',
  accepts: ['font/ttf', 'font/otf', 'font/woff'],
  keywords: ['web font', 'font-face', 'css', 'embed font', 'base64 font'], offline: true,
};
export default manifest;
