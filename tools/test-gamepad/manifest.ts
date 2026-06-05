import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-gamepad', name: 'Controller Tester',
  blurb: 'Test any game controller — see buttons, triggers and analog sticks respond live, and try vibration.',
  category: 'test', tile: 'M', icon: 'gamepad-2', compute: 'instant',
  keywords: ['gamepad test', 'controller test', 'joystick test', 'xbox controller test', 'ps5 controller test', 'analog stick'], offline: true,
};
export default manifest;
