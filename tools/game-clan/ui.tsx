'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { CLAN_TAGS, CLAN_FULL, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-clan"
      generate={() => `[${combine([CLAN_TAGS])}] ${combine([CLAN_FULL])}`}
    />
  );
}
