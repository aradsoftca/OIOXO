'use client';

import { TextTool } from '@/components/tool/TextTool';

function b64(input: string, options: Record<string, unknown>): string {
  if (!input) return '';
  const mode = String(options['mode'] ?? 'encode');
  const urlSafe = Boolean(options['urlSafe']);

  if (mode === 'encode') {
    const bytes = new TextEncoder().encode(input);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    let out = btoa(bin);
    if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return out;
  }

  // decode — tolerate URL-safe variants and missing padding
  let s = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (e) {
    throw new Error('Not valid Base64');
  }
}

export default function Base64Tool() {
  return (
    <TextTool
      toolId="text-base64"
      transform={b64}
      colorVar="--color-cat-dev"
      controls={[
        {
          id: 'mode',
          label: 'Direction',
          type: 'select',
          defaultValue: 'encode',
          options: [
            { value: 'encode', label: 'Text → Base64' },
            { value: 'decode', label: 'Base64 → Text' },
          ],
        },
        { id: 'urlSafe', label: 'URL-safe (-_ and no padding)', type: 'toggle', defaultValue: false },
      ]}
      inputPlaceholder="Paste text or Base64 here"
    />
  );
}
