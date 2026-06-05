import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-sheets',
  name: 'Sheets Studio',
  blurb: 'A full spreadsheet in your browser — edit cells, write formulas (SUM, AVERAGE, IF…), and import/export XLSX & CSV. Nothing uploaded.',
  category: 'convert',
  tile: 'L',
  icon: 'table',
  compute: 'local',
  accepts: ['.xlsx', '.xls', '.csv', '.tsv'],
  produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
  keywords: ['excel online', 'spreadsheet editor', 'xlsx editor', 'csv editor', 'online excel', 'edit spreadsheet', 'formulas'],
  offline: true,
};

export default manifest;
