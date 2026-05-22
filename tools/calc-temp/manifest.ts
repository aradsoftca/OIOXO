import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-temp',
  name: 'Temperature Converter',
  blurb: 'Celsius, Fahrenheit, Kelvin, Rankine — convert any to all.',
  category: 'calc', tile: 'S', icon: 'thermometer', compute: 'instant',
  keywords: ['temperature', 'celsius', 'fahrenheit', 'kelvin'], offline: true,
};
export default manifest;
