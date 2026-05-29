'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';
import { hmac } from '@/engines/dev/crypto';

type Algo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export default function Tool() {
  const [output, setOutput] = React.useState('');
  // Track which (key, algo, message) combination is in-flight so we don't
  // fire a new compute on every render — without this guard, every state
  // update from setOutput would re-enter transform and kick off another
  // HMAC, and we'd race the previous result back into view.
  const lastKey = React.useRef('');
  return (
    <TextTool
      toolId="dev-hmac"
      colorVar="--color-cat-dev"
      inputPlaceholder="Message to sign…"
      transform={(s, o) => {
        const key = String(o.key ?? '');
        const algo = String(o.algo ?? 'SHA-256') as Algo;
        if (!s || !key) return '';
        const cacheKey = `${algo}\0${key}\0${s}`;
        if (cacheKey !== lastKey.current) {
          lastKey.current = cacheKey;
          hmac(key, s, algo)
            .then((sig) => { if (lastKey.current === cacheKey) setOutput(sig); })
            .catch((e) => { if (lastKey.current === cacheKey) setOutput(`Error: ${e}`); });
        }
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
