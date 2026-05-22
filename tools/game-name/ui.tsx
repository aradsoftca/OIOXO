'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { GAMING_PRE, USERNAME_MID, GAMING_POST, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-name"
      generate={() => combine([GAMING_PRE, USERNAME_MID, GAMING_POST], '')}
    />
  );
}
