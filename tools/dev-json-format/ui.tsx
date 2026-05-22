'use client';

import { TextTool } from '@/components/tool/TextTool';

function formatJson(input: string, options: Record<string, unknown>): string {
  if (!input.trim()) return '';
  const mode = String(options['mode'] ?? 'pretty');
  const indent = Number(options['indent'] ?? 2);
  const sortKeys = Boolean(options['sortKeys']);

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }

  if (sortKeys) parsed = deepSort(parsed);
  if (mode === 'minify') return JSON.stringify(parsed);
  return JSON.stringify(parsed, null, indent);
}

function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach((k) => {
        out[k] = deepSort((value as Record<string, unknown>)[k]);
      });
    return out;
  }
  return value;
}

export default function JsonFormatterTool() {
  return (
    <TextTool
      toolId="dev-json-format"
      transform={formatJson}
      colorVar="--color-cat-dev"
      controls={[
        {
          id: 'mode',
          label: 'Mode',
          type: 'select',
          defaultValue: 'pretty',
          options: [
            { value: 'pretty', label: 'Pretty print' },
            { value: 'minify', label: 'Minify' },
          ],
        },
        { id: 'indent', label: 'Indent (spaces)', type: 'number', defaultValue: 2, min: 0, max: 8 },
        { id: 'sortKeys', label: 'Sort object keys', type: 'toggle', defaultValue: false },
      ]}
      inputPlaceholder='{"hello":"world"}'
    />
  );
}
