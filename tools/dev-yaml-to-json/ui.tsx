'use client';
import { TextTool } from '@/components/tool/TextTool';
import yaml from 'js-yaml';

export default function Tool() {
  return (
    <TextTool
      toolId="dev-yaml-to-json"
      colorVar="--color-cat-dev"
      transform={(s, o) => {
        if (!s.trim()) return '';
        try {
          const obj = yaml.load(s);
          return JSON.stringify(obj, null, Number(o.indent) || 2);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        { id: 'indent', label: 'Indent', type: 'number', defaultValue: 2, min: 0, max: 8 },
      ]}
    />
  );
}
