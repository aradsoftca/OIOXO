'use client';
import { TextTool } from '@/components/tool/TextTool';
import { toKebabCase } from '@/engines/text';
export default function Tool() {
  return <TextTool toolId="text-kebab-case" transform={(s) => toKebabCase(s)} />;
}
