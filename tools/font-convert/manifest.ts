import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'font-convert',
  name: 'Font Convert',
  blurb: 'Convert OTF / CFF fonts to TTF — keeps every glyph and metric.',
  category: 'font', tile: 'M', icon: 'file-output', compute: 'local',
  accepts: ['font/otf', 'font/ttf', 'font/woff'],
  produces: ['font/ttf'],
  keywords: ['font', 'convert', 'otf to ttf', 'ttf', 'font conversion'], offline: true,
};
export default manifest;
