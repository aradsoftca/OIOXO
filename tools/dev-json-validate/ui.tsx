'use client';
import { TextTool } from '@/components/tool/TextTool';

function findLineCol(s: string, err: string): { line: number; col: number } | null {
  // Browsers usually format messages like "Unexpected token } in JSON at position 42"
  const m = /position (\d+)/.exec(err);
  if (!m) return null;
  const pos = Number(m[1]);
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < s.length; i++) {
    if (s[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}

export default function Tool() {
  return (
    <TextTool
      toolId="dev-json-validate"
      colorVar="--color-cat-dev"
      transform={(s) => {
        if (!s.trim()) return 'Paste JSON to validate.';
        try {
          JSON.parse(s);
          return '✓ Valid JSON';
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const loc = findLineCol(s, msg);
          return loc
            ? `✗ Invalid JSON\nLine ${loc.line}, column ${loc.col}\n\n${msg}`
            : `✗ Invalid JSON\n\n${msg}`;
        }
      }}
    />
  );
}
