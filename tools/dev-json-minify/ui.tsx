'use client';
import { TextTool } from '@/components/tool/TextTool';
export default function Tool() {
  return (
    <TextTool
      toolId="dev-json-minify"
      colorVar="--color-cat-dev"
      transform={(s) => {
        if (!s.trim()) return '';
        try { return JSON.stringify(JSON.parse(s)); }
        catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
      }}
    />
  );
}
