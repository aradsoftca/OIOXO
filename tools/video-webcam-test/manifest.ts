import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-webcam-test',
  name: 'Webcam & Mic Test',
  blurb: 'Check your camera and microphone work — preview, levels and a snapshot. Nothing leaves your device.',
  category: 'video',
  tile: 'L',
  icon: 'camera',
  compute: 'instant',
  keywords: ['webcam test', 'test my camera', 'mic test', 'microphone test', 'check camera', 'camera test online'],
  pinDefault: true,
  offline: true,
};

export default manifest;
