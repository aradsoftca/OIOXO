import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'dev-json-validate',
  name: 'JSON Validator',
  blurb: 'Pinpoint syntax errors with line and column — paste and check.',
  category: 'dev',
  accepts: ['text/*'], tile: 'S', icon: 'check-circle', compute: 'instant',
  keywords: ['json validate', 'json lint', 'json check', 'syntax error'], offline: true,
};
export default manifest;
