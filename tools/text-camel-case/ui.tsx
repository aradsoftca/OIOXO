'use client';
import { TextTool } from '@/components/tool/TextTool';
import { toCamelCase } from '@/engines/text';
export default function Tool() {
  return <TextTool toolId="text-camel-case" transform={(s) => toCamelCase(s)} />;
}
