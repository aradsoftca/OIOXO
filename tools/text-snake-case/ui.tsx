'use client';
import { TextTool } from '@/components/tool/TextTool';
import { toSnakeCase } from '@/engines/text';
export default function Tool() {
  return <TextTool toolId="text-snake-case" transform={(s) => toSnakeCase(s)} />;
}
