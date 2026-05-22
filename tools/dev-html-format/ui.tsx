'use client';
import { TextTool } from '@/components/tool/TextTool';
import { html as beautifyHtml } from 'js-beautify';

function format(input: string, options: Record<string, unknown>): string {
  if (!input.trim()) return '';
  const indent = Number(options['indent'] ?? 2);
  return beautifyHtml(input, {
    indent_size: indent,
    wrap_line_length: 0,
    end_with_newline: false,
    preserve_newlines: true,
    max_preserve_newlines: 2,
  });
}

export default function Tool() {
  return (
    <TextTool
      toolId="dev-html-format"
      transform={format}
      colorVar="--color-cat-dev"
      controls={[
        { id: 'indent', label: 'Indent (spaces)', type: 'number', defaultValue: 2, min: 0, max: 8 },
      ]}
      inputPlaceholder='<div><h1>Hi</h1><p>Body</p></div>'
    />
  );
}
