import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-screen-record',
  name: 'Screen Recorder',
  blurb: 'Record your screen or a tab with audio — saved locally, never uploaded.',
  category: 'video',
  tile: 'L',
  icon: 'monitor',
  compute: 'instant',
  keywords: ['screen recorder', 'record screen', 'screen capture', 'record tab', 'webcam recorder', 'record video online'],
  pinDefault: true,
  offline: true,
};

export default manifest;
