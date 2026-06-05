import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-webcam-record',
  name: 'Webcam Recorder',
  blurb: 'Record video from your webcam or snap a photo, then download it — all in the browser. Nothing leaves your device.',
  category: 'video',
  tile: 'L',
  icon: 'video',
  compute: 'instant',
  produces: ['video/webm', 'image/png'],
  keywords: ['webcam recorder', 'record video online', 'camera recorder', 'online camera', 'take photo online', 'record webcam'],
  offline: true,
};

export default manifest;
