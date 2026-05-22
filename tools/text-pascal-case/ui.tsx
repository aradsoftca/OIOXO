'use client';
import { TextTool } from '@/components/tool/TextTool';
import { toPascalCase } from '@/engines/text';
export default function Tool() {
  return <TextTool toolId="text-pascal-case" transform={(s) => toPascalCase(s)} />;
}
