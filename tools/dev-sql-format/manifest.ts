import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-sql-format',
  name: 'SQL Formatter',
  blurb: 'Pretty-print SQL queries — PostgreSQL, MySQL, SQLite, more.',
  category: 'dev', tile: 'M', icon: 'database', compute: 'instant',
  keywords: ['sql format', 'beautify sql', 'query formatter', 'postgres', 'mysql'], offline: true,
};
export default manifest;
