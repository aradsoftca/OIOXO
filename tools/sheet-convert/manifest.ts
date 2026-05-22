import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'sheet-convert',
  name: 'Spreadsheet Converter',
  blurb: 'Convert Excel, ODS and CSV between each other — and to HTML or JSON, on your device.',
  category: 'convert',
  tile: 'L',
  icon: 'table',
  compute: 'local',
  accepts: ['.xlsx', '.xls', '.ods', '.csv', '.tsv'],
  produces: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/html', 'application/json'],
  keywords: ['xlsx to csv', 'csv to xlsx', 'excel converter', 'ods', 'spreadsheet', 'xls to csv', 'sheet to json'],
  pinDefault: false,
  offline: true,
};

export default manifest;
