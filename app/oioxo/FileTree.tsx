'use client';
/**
 * oioxo Code — a real collapsible FILE TREE built from a flat CodeFile[] path list
 * (so the Build/GitHub/Cloud surfaces show nested folders, not a flat path dump).
 * Pure presentation: it groups paths into a folder/file tree and renders it; the
 * parent owns selection, delete, and the per-file error dots.
 */
import * as React from 'react';
import { File as FileIcon, Folder, FolderOpen, ChevronRight, X } from 'lucide-react';
import type { CodeFile } from '@/lib/oioxo/codeloop';

interface Node {
  name: string;
  path: string;
  dir: boolean;
  children: Node[];
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

/** Build a nested tree from flat paths (folders sorted first, then files, A–Z). */
export function buildTree(files: CodeFile[]): Node[] {
  const root: Node = { name: '', path: '', dir: true, children: [] };
  for (const f of files) {
    const parts = norm(f.path).split('/').filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let next = cur.children.find((c) => c.name === part && c.dir === !isFile);
      if (!next) { next = { name: part, path, dir: !isFile, children: [] }; cur.children.push(next); }
      cur = next;
    });
  }
  const sort = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    for (const n of nodes) if (n.dir) sort(n.children);
  };
  sort(root.children);
  return root.children;
}

export default function FileTree({
  files, active, errorPaths, onOpen, onDelete,
}: {
  files: CodeFile[];
  active: string | null;
  errorPaths?: Set<string>;
  onOpen: (path: string) => void;
  onDelete?: (path: string) => void;
}) {
  const tree = React.useMemo(() => buildTree(files), [files]);
  return <ul className="select-none">{tree.map((n) => (
    <TreeNode key={n.path} node={n} depth={0} active={active} errorPaths={errorPaths} onOpen={onOpen} onDelete={onDelete} />
  ))}</ul>;
}

function TreeNode({
  node, depth, active, errorPaths, onOpen, onDelete,
}: {
  node: Node; depth: number; active: string | null; errorPaths?: Set<string>;
  onOpen: (path: string) => void; onDelete?: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(depth < 1);
  const pad = { paddingLeft: depth * 12 + 8 };
  if (node.dir) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={pad}
          className="flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <ChevronRight className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} active={active} errorPaths={errorPaths} onOpen={onOpen} onDelete={onDelete} />
        ))}
      </li>
    );
  }
  const hasErr = errorPaths?.has(node.path);
  return (
    <li className="group flex items-center">
      <button
        type="button"
        onClick={() => onOpen(node.path)}
        style={pad}
        className={[
          'flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 pr-2 text-left text-[12px] transition',
          active === node.path ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50',
        ].join(' ')}
      >
        <FileIcon className={`h-3.5 w-3.5 shrink-0 ${hasErr ? 'text-rose-500' : 'text-zinc-400'}`} />
        <span className="truncate">{node.name}</span>
        {hasErr && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(node.path)}
          title="Delete file"
          className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition hover:bg-zinc-200 hover:text-rose-600 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
