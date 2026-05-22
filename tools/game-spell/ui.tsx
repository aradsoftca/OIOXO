'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { SPELL_PREFIX, SPELL_VERB, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-spell"
      generate={() => combine([SPELL_PREFIX, SPELL_VERB], ' ')}
    />
  );
}
