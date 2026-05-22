/**
 * Lightweight XML / HTML pretty-printer using a tokenizer. Not a full parser —
 * good enough for human inspection, ignores DTD / processing instructions
 * beyond surface preservation.
 */
export function formatXml(input: string, indent = 2): string {
  // Strip whitespace between tags first.
  const compact = input.replace(/>\s+</g, '><').trim();
  const lines: string[] = [];
  const pad = ' '.repeat(indent);
  let depth = 0;

  const tokens = compact.split(/(<[^>]+>)/g).filter((t) => t.length > 0);
  for (const t of tokens) {
    if (t.startsWith('<!--') || t.startsWith('<!')) {
      lines.push(pad.repeat(depth) + t);
      continue;
    }
    if (t.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      lines.push(pad.repeat(depth) + t);
    } else if (t.startsWith('<?')) {
      lines.push(pad.repeat(depth) + t);
    } else if (t.startsWith('<') && !t.endsWith('/>')) {
      lines.push(pad.repeat(depth) + t);
      // Don't indent for self-closing or void elements
      if (!/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(t)) {
        depth++;
      }
    } else if (t.startsWith('<') && t.endsWith('/>')) {
      lines.push(pad.repeat(depth) + t);
    } else {
      // Text content
      lines.push(pad.repeat(depth) + t.trim());
    }
  }
  return lines.join('\n');
}
