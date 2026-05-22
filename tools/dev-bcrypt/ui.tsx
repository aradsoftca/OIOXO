'use client';
import { TextTool } from '@/components/tool/TextTool';
import bcrypt from 'bcryptjs';

export default function Tool() {
  return (
    <TextTool
      toolId="dev-bcrypt"
      colorVar="--color-cat-dev"
      inputPlaceholder="Enter password to hash, or 'password\\nhash' to verify…"
      transform={(s, o) => {
        if (!s) return '';
        if (o.mode === 'verify') {
          const [pw, hash] = s.split('\n');
          if (!pw || !hash) return 'Enter password on first line and hash on second.';
          try {
            return bcrypt.compareSync(pw, hash.trim()) ? '✓ Match' : '✗ Does not match';
          } catch (e) {
            return `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        try {
          const rounds = Math.max(4, Math.min(15, Number(o.rounds) || 10));
          return bcrypt.hashSync(s, rounds);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        {
          id: 'mode', label: 'Mode', type: 'select', defaultValue: 'hash',
          options: [
            { value: 'hash',   label: 'Hash password' },
            { value: 'verify', label: 'Verify password vs hash' },
          ],
        },
        { id: 'rounds', label: 'Cost (rounds)', type: 'number', defaultValue: 10, min: 4, max: 15 },
      ]}
    />
  );
}
