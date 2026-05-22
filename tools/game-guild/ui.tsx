'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { GUILD_ADJ, GUILD_NOUN, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-guild"
      generate={() => combine([['The'], GUILD_ADJ, GUILD_NOUN], ' ')}
    />
  );
}
