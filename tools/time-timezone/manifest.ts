import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-timezone',
  name: 'Timezone Converter',
  blurb: 'Convert any time between any two timezones, with offsets shown.',
  category: 'time', tile: 'M', icon: 'arrow-left-right', compute: 'instant',
  keywords: ['timezone converter', 'time conversion', 'utc offset'], offline: true,
};
export default manifest;
