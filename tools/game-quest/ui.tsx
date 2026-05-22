'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { QUEST_VERB, QUEST_NOUN, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-quest"
      generate={() => combine([QUEST_VERB, QUEST_NOUN], ' ')}
    />
  );
}
