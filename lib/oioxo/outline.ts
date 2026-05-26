/**
 * oioxo Code — OUTLINE: top-level symbols of a file for the editor's outline panel
 * + quick navigation. Pure + language-aware (regex over lines, no TS worker needed,
 * so it works for every language and is Node-testable). Approximate by design — an
 * outline, not a compiler — but good enough to jump around a file.
 */
export type OutlineKind = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'selector' | 'heading' | 'rule';

export interface OutlineItem {
  name: string;
  kind: OutlineKind;
  line: number;       // 1-based
  depth?: number;     // for headings
}

const ext = (path: string) => path.split('.').pop()?.toLowerCase() ?? '';
const TS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs']);
const CSSX = new Set(['css', 'scss', 'less', 'sass']);
const MAX = 300;

/** Extract a flat, line-ordered symbol list for the file. */
export function extractOutline(path: string, content: string): OutlineItem[] {
  const e = ext(path);
  const lines = content.split('\n');
  const out: OutlineItem[] = [];
  const push = (name: string, kind: OutlineKind, i: number, depth?: number) => {
    if (name && out.length < MAX) out.push({ name, kind, line: i + 1, ...(depth ? { depth } : {}) });
  };

  if (TS.has(e)) {
    lines.forEach((raw, i) => {
      const l = raw.trim();
      let m: RegExpMatchArray | null;
      if ((m = l.match(/^export\s+default\s+function\s*([A-Za-z0-9_$]*)/))) push(m[1] || 'default', 'function', i);
      else if ((m = l.match(/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/))) push(m[1], 'function', i);
      else if ((m = l.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/))) push(m[1], 'class', i);
      else if ((m = l.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/))) push(m[1], 'interface', i);
      else if ((m = l.match(/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*[=<]/))) push(m[1], 'type', i);
      else if ((m = l.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/))) push(m[1], 'function', i);
      else if ((m = l.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?function/))) push(m[1], 'function', i);
      else if ((m = l.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Za-z0-9_$]*)\s*[=:]/))) push(m[1], 'variable', i); // exported consts (Capitalized → likely notable)
    });
    return out;
  }

  if (CSSX.has(e)) {
    lines.forEach((raw, i) => {
      const l = raw.trim();
      let m: RegExpMatchArray | null;
      if ((m = l.match(/^(@(?:media|keyframes|supports|font-face)[^{]*)\{?\s*$/))) push(m[1].trim(), 'rule', i);
      else if (/\{\s*$/.test(l) && !l.startsWith('@') && !l.startsWith('//') && !l.startsWith('*')) {
        const sel = l.replace(/\s*\{\s*$/, '').trim();
        if (sel && !/[;:]/.test(sel)) push(sel, 'selector', i);
      }
    });
    return out;
  }

  if (e === 'md' || e === 'mdx') {
    lines.forEach((raw, i) => {
      const m = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) push(m[2], 'heading', i, m[1].length);
    });
    return out;
  }

  if (e === 'html' || e === 'htm') {
    lines.forEach((raw, i) => {
      const h = raw.match(/<(h[1-6])[^>]*>([^<]+)</i);
      if (h) push(h[2].trim(), 'heading', i, Number(h[1][1]));
      const id = raw.match(/\bid=["']([^"']+)["']/);
      if (id) push('#' + id[1], 'selector', i);
    });
    return out;
  }

  return out;
}
