'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { WEAPON_ADJ, WEAPONS, WEAPON_OF, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-weapon"
      generate={() => {
        const variant = Math.random();
        if (variant < 0.5) return combine([WEAPON_ADJ, WEAPONS], ' ');
        return `${combine([WEAPONS])} of ${combine([WEAPON_OF])}`;
      }}
    />
  );
}
