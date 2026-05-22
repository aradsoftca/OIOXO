import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'game-coin',
  name: 'Coin Flip',
  blurb: 'Flip a coin — single or batch, with running heads/tails counts.',
  category: 'game', tile: 'S', icon: 'circle', compute: 'instant',
  keywords: ['coin flip', 'heads or tails', 'random binary'], offline: true,
};
export default manifest;
