/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo — local file access via the File System Access API. This is the
 * "code on your device" capability: the user grants a folder, and oioxo can
 * read + write the real files in it. Chromium-only; feature-detected so other
 * browsers degrade to a clear message instead of breaking.
 */
export interface FileNode {
  name: string;
  kind: 'file' | 'dir';
  path: string;
  handle: any; // FileSystemFileHandle | FileSystemDirectoryHandle
  children?: FileNode[];
}

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.DS_Store']);

export function fsSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Prompt the user to pick a folder; return its handle + a shallow file tree. */
export async function openFolder(): Promise<{ root: any; name: string; tree: FileNode[] } | null> {
  const picker = (window as any).showDirectoryPicker;
  if (!picker) return null;
  const root = await picker({ mode: 'readwrite' });
  const tree = await readDir(root, root.name, 0);
  return { root, name: root.name, tree };
}

async function readDir(dir: any, path: string, depth: number): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const p = `${path}/${name}`;
    if (handle.kind === 'directory') {
      nodes.push({ name, kind: 'dir', path: p, handle, children: depth < 4 ? await readDir(handle, p, depth + 1) : [] });
    } else {
      nodes.push({ name, kind: 'file', path: p, handle });
    }
  }
  nodes.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  return nodes;
}

export async function readFileText(handle: any): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/** Write content to a path relative to the opened root, creating any missing
 *  folders + the file. Powers the agent's multi-file edits. */
export async function writeByPath(root: any, path: string, content: string): Promise<void> {
  const parts = path.split('/').filter((p) => p && p !== '.');
  const fname = parts.pop();
  if (!fname) throw new Error('bad path');
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(fname, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function writeFileText(handle: any, content: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

const CODE_EXT = /\.(ts|tsx|js|jsx|json|css|scss|html|md|py|rs|go|java|c|cpp|h|sh|yml|yaml|toml|sql|txt|env|xml|vue|svelte)$/i;
export function isTextFile(name: string): boolean {
  return CODE_EXT.test(name) || !name.includes('.');
}

/**
 * Convert an opened folder tree into a WebContainer FileSystemTree:
 *   { name: { file: { contents } } | { directory: { …nested } } }
 * Text files are read as strings, binaries as bytes.
 */
export async function snapshotTree(nodes: FileNode[]): Promise<Record<string, unknown>> {
  const tree: Record<string, unknown> = {};
  for (const n of nodes) {
    if (n.kind === 'dir') {
      tree[n.name] = { directory: await snapshotTree(n.children ?? []) };
    } else {
      const file = await n.handle.getFile();
      const contents = isTextFile(n.name) ? await file.text() : new Uint8Array(await file.arrayBuffer());
      tree[n.name] = { file: { contents } };
    }
  }
  return tree;
}

/** Flatten the tree to {path, content}[] for the code agent (text files only).
 *  The execute-repair loop works on this flat list. */
export async function filesFromTree(nodes: FileNode[]): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  async function walk(ns: FileNode[]): Promise<void> {
    for (const n of ns) {
      if (n.kind === 'dir') {
        if (n.children) await walk(n.children);
      } else if (isTextFile(n.name)) {
        try { out.push({ path: n.path, content: await readFileText(n.handle) }); } catch { /* skip unreadable */ }
      }
    }
  }
  await walk(nodes);
  return out;
}
