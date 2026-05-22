'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { CHARACTER_FIRST, CHARACTER_LAST, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-character"
      generate={() => combine([CHARACTER_FIRST, CHARACTER_LAST], ' ')}
    />
  );
}
