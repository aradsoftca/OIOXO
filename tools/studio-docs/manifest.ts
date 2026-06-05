import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-docs',
  name: 'Docs Studio',
  blurb: 'Write and format documents in your browser — headings, lists, links and styles. Open .docx and export PDF, DOCX or HTML. Private by design.',
  category: 'convert',
  tile: 'L',
  icon: 'file-text',
  compute: 'local',
  accepts: ['.docx', '.html', '.txt'],
  produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/html'],
  keywords: ['word online', 'document editor', 'docx editor', 'online word processor', 'write document', 'docx to pdf'],
  offline: true,
};

export default manifest;
