'use client';
import { TextTool } from '@/components/tool/TextTool';
import { js as beautifyJs } from 'js-beautify';

function format(input: string, options: Record<string, unknown>): string {
  if (!input.trim()) return '';
  const mode = String(options['mode'] ?? 'pretty');
  const indent = Number(options['indent'] ?? 2);
  const semicolons = Boolean(options['semicolons'] ?? true);
  if (mode === 'minify') {
    return input
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}();,:=<>+\-*/%&|!?])\s*/g, '$1')
      .trim();
  }
  return beautifyJs(input, {
    indent_size: indent,
    end_with_newline: false,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    space_in_empty_paren: false,
    jslint_happy: false,
    keep_array_indentation: false,
    brace_style: 'collapse',
    unescape_strings: false,
    wrap_line_length: 0,
  }).replace(/;$/gm, semicolons ? ';' : '');
}

export default function Tool() {
  return (
    <TextTool
      toolId="dev-js-format"
      transform={format}
      colorVar="--color-cat-dev"
      controls={[
        { id: 'mode', label: 'Mode', type: 'select', defaultValue: 'pretty',
          options: [{ value: 'pretty', label: 'Pretty print' }, { value: 'minify', label: 'Minify' }] },
        { id: 'indent', label: 'Indent (spaces)', type: 'number', defaultValue: 2, min: 0, max: 8 },
        { id: 'semicolons', label: 'Keep semicolons', type: 'toggle', defaultValue: true },
      ]}
      inputPlaceholder='function add(a,b){return a+b}'
    />
  );
}
