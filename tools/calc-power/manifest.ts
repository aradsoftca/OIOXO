import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-power',
  name: 'Power Calculator',
  blurb: 'Voltage, current, resistance, power — solve any two for the rest.',
  category: 'calc', tile: 'M', icon: 'zap', compute: 'instant',
  keywords: ['ohms law', 'voltage', 'current', 'resistance', 'wattage'], offline: true,
};
export default manifest;
