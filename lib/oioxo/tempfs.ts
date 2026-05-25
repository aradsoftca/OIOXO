/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §4) — the Temp workspace's runtime glue. A
 * Temp project lives as a flat CodeFile[] in a MemoryWorkspace (no disk); to RUN
 * or PREVIEW it we mount it into a WebContainer, which wants a nested
 * FileSystemTree. This module is that pure conversion (the only thing the
 * MemoryWorkspace can't do itself), kept separate so it's Node-testable and the
 * heavy WebContainer import stays in webcontainer.ts.
 */
import type { CodeFile } from './codeloop';

type Tree = Record<string, { file: { contents: string } } | { directory: Tree }>;

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

/**
 * Flat `{path, content}[]` → WebContainer FileSystemTree (nested `{file}` /
 * `{directory}` nodes). Nested paths create intermediate directories; later
 * files at the same path win.
 */
export function treeFromFiles(files: CodeFile[]): Tree {
  const root: Tree = {};
  for (const f of files) {
    const parts = norm(f.path).split('/').filter(Boolean);
    if (!parts.length) continue;
    const name = parts.pop() as string;
    let dir = root;
    for (const p of parts) {
      const existing = dir[p];
      if (!existing || !('directory' in existing)) dir[p] = { directory: {} };
      dir = (dir[p] as { directory: Tree }).directory;
    }
    dir[name] = { file: { contents: f.content } };
  }
  return root;
}
