import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'office-studio',
  name: 'Office Studio',
  blurb: 'Pro spreadsheet in your browser — formulas, ranges, charts, formatting, CSV/JSON import and export. Nothing leaves your device.',
  category: 'generator', tile: 'L', icon: 'table-2', compute: 'local',
  accepts: ['text/csv', 'application/json'],
  produces: ['text/csv', 'application/json'],
  keywords: ['spreadsheet', 'excel alternative', 'sheets', 'formulas', 'sum', 'average', 'data table', 'office studio', 'csv editor'],
  offline: true,
  pinDefault: true,
};
export default manifest;
