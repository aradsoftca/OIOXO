/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §3) — the WORKSPACE abstraction. The agent
 * never cares WHERE files live; it reads/writes through one interface, and the
 * environment picks the backend:
 *   - Temp   → an in-browser virtual project (no disk; default for "just build X")
 *   - Local  → a real folder via File System Access (Chromium)
 *   - GitHub → a repo (later)
 *   - Native → a real folder on disk (desktop IDE)
 *
 * This file is the FS half (read/write/list), isomorphic + Node-testable. Running
 * + live preview (WebContainer / native exec) compose on top via the runners, so
 * the file logic stays pure.
 */
import type { CodeFile } from './codeloop';

export type WorkspaceKind = 'temp' | 'local' | 'github' | 'native';

export interface Workspace {
  kind: WorkspaceKind;
  /** File contents at path, or null if absent. */
  read(path: string): Promise<string | null>;
  /** Create/replace a file (creates parent dirs implicitly). */
  write(path: string, content: string): Promise<void>;
  /** Remove a file. */
  remove(path: string): Promise<void>;
  /** Every file in the project (drives the loop + the tree view). */
  files(): Promise<CodeFile[]>;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

/**
 * In-memory workspace — the core of the Temp (in-browser) backend, and the unit
 * test substrate. Files live in a Map; a WebContainer is mounted from `files()`
 * only when the project is run/previewed (kept separate so this stays pure).
 */
export class MemoryWorkspace implements Workspace {
  kind: WorkspaceKind = 'temp';
  private map = new Map<string, string>();
  constructor(seed: CodeFile[] = []) {
    for (const f of seed) this.map.set(norm(f.path), f.content);
  }
  async read(path: string): Promise<string | null> {
    return this.map.get(norm(path)) ?? null;
  }
  async write(path: string, content: string): Promise<void> {
    this.map.set(norm(path), content);
  }
  async remove(path: string): Promise<void> {
    this.map.delete(norm(path));
  }
  async files(): Promise<CodeFile[]> {
    return Array.from(this.map, ([path, content]) => ({ path, content }));
  }
  /** Apply many files at once (e.g. a scaffold or the loop's result). */
  applyAll(files: CodeFile[]): void {
    for (const f of files) this.map.set(norm(f.path), f.content);
  }
}

/**
 * Local-folder workspace — wraps a File System Access directory handle. The
 * read/write helpers come from fs.ts (writeByPath/readFileText) so this is just
 * the Workspace face over a real opened folder. Browser (Chromium) only.
 */
export class LocalWorkspace implements Workspace {
  kind: WorkspaceKind = 'local';
  constructor(
    private root: unknown,
    private snapshot: () => Promise<CodeFile[]>,
    private fsWrite: (root: unknown, path: string, content: string) => Promise<void>,
    private fsRead?: (root: unknown, path: string) => Promise<string | null>,
  ) {}
  async read(path: string): Promise<string | null> {
    if (this.fsRead) return this.fsRead(this.root, path);
    return (await this.files()).find((f) => norm(f.path) === norm(path))?.content ?? null;
  }
  async write(path: string, content: string): Promise<void> {
    await this.fsWrite(this.root, path, content);
  }
  async remove(): Promise<void> {
    throw new Error('remove not supported on the local folder yet');
  }
  async files(): Promise<CodeFile[]> {
    return this.snapshot();
  }
}
