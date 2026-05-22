'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { SCI_FI_ADJ, SCI_FI_NOUN, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-sci-fi"
      generate={() => combine([SCI_FI_ADJ, SCI_FI_NOUN], ' ')}
    />
  );
}
