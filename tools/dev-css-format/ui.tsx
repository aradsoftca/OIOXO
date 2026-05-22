'use client';
import { TextTool } from '@/components/tool/TextTool';
import { css as beautifyCss } from 'js-beautify';

function format(input: string, options: Record<string, unknown>): string {
  if (!input.trim()) return '';
  const mode = String(options['mode'] ?? 'pretty');
  const indent = Number(options['indent'] ?? 2);
  if (mode === 'minify') {
    return input
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1')
      .replace(/;}/g, '}')
      .trim();
  }
  return beautifyCss(input, {
    indent_size: indent,
    end_with_newline: false,
    selector_separator_newline: true,
    newline_between_rules: true,
  });
}

export default function Tool() {
  return (
    <TextTool
      toolId="dev-css-format"
      transform={format}
      colorVar="--color-cat-dev"
      controls={[
        { id: 'mode', label: 'Mode', type: 'select', defaultValue: 'pretty',
          options: [{ value: 'pretty', label: 'Pretty print' }, { value: 'minify', label: 'Minify' }] },
        { id: 'indent', label: 'Indent (spaces)', type: 'number', defaultValue: 2, min: 0, max: 8 },
      ]}
      inputPlaceholder='.btn{color:#fff;background:#000;padding:8px 16px}'
    />
  );
}
