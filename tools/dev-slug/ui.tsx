'use client';

import { TextTool } from '@/components/tool/TextTool';

function slugify(input: string, options: Record<string, unknown>): string {
  const separator = String(options['separator'] ?? '-');
  const lower = options['lower'] !== false;

  // NFKD strips diacritics; the regex removes anything not alnum/space/separator.
  let out = input.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (lower) out = out.toLowerCase();
  out = out.replace(/['"]/g, '');
  out = out.replace(/[^a-zA-Z0-9\s-]/g, ' ');
  out = out.trim().replace(/\s+/g, separator);
  out = out.replace(new RegExp(`${escapeRegex(separator)}+`, 'g'), separator);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function SlugTool() {
  return (
    <TextTool
      toolId="dev-slug"
      transform={slugify}
      colorVar="--color-cat-dev"
      controls={[
        {
          id: 'separator',
          label: 'Separator',
          type: 'select',
          defaultValue: '-',
          options: [
            { value: '-', label: 'Hyphen (-)' },
            { value: '_', label: 'Underscore (_)' },
            { value: '.', label: 'Dot (.)' },
          ],
        },
        { id: 'lower', label: 'Lowercase', type: 'toggle', defaultValue: true },
      ]}
      inputPlaceholder="My Awesome Article Title"
    />
  );
}
