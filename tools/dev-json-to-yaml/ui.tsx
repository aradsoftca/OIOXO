'use client';
import { TextTool } from '@/components/tool/TextTool';
import yaml from 'js-yaml';

export default function Tool() {
  return (
    <TextTool
      toolId="dev-json-to-yaml"
      colorVar="--color-cat-dev"
      transform={(s, o) => {
        if (!s.trim()) return '';
        try {
          const obj = JSON.parse(s);
          return yaml.dump(obj, { indent: Number(o.indent) || 2, lineWidth: -1 });
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        { id: 'indent', label: 'Indent', type: 'number', defaultValue: 2, min: 2, max: 8 },
      ]}
    />
  );
}
