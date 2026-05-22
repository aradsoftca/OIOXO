'use client';
import { NameGenerator } from '@/components/tool/NameGenerator';
import { USERNAME_PRE, USERNAME_MID, combine } from '@/engines/names';

export default function Tool() {
  return (
    <NameGenerator
      toolId="game-username"
      generate={(o) => {
        const num = o.withNumber ? String(Math.floor(Math.random() * 9999)) : '';
        return combine([USERNAME_PRE, USERNAME_MID], '') + num;
      }}
      extraControls={[
        { id: 'withNumber', label: 'Append number', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
