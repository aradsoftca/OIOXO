'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { FANTASY_ADJ, FANTASY_NOUN, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-fantasy"
      generate={() => combine([FANTASY_ADJ, FANTASY_NOUN], '')}
    />
  );
}
