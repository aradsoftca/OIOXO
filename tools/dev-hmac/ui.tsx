'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';
import { hmac } from '@/engines/dev/crypto';

type Algo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export default function Tool() {
  const [output, setOutput] = React.useState('');
  return (
    <TextTool
      toolId="dev-hmac"
      colorVar="--color-cat-dev"
      inputPlaceholder="Message to sign…"
      transform={(s, o) => {
        // Compute async — return the cached output, kick off the new sign.
        const key = String(o.key ?? '');
        const algo = String(o.algo ?? 'SHA-256') as Algo;
        if (!s || !key) return '';
        // Fire-and-forget HMAC compute; component re-renders when state updates.
        hmac(key, s, algo).then((sig) => setOutput(sig)).catch((e) => setOutput(`Error: ${e}`));
        return output;
      }}
      controls={[
        { id: 'key',  label: 'Secret key', type: 'text', defaultValue: '' },
        {
          id: 'algo', label: 'Algorithm', type: 'select', defaultValue: 'SHA-256',
          options: [
            { value: 'SHA-256', label: 'SHA-256' },
            { value: 'SHA-1',   label: 'SHA-1' },
            { value: 'SHA-384', label: 'SHA-384' },
            { value: 'SHA-512', label: 'SHA-512' },
          ],
        },
      ]}
    />
  );
}
