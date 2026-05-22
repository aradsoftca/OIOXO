'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { TEAM_ADJ, TEAM_NOUN, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-team"
      generate={() => combine([TEAM_ADJ, TEAM_NOUN], ' ')}
    />
  );
}
