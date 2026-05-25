/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §3) — the GitHub workspace backend. Stays
 * true to host-nothing: the user pastes a fine-grained PAT (kept in their
 * browser only), and every call goes straight to api.github.com from the tab.
 *
 * Shape: load a repo's text files into an in-memory buffer (a Workspace the
 * agent edits like any other), then PUSH the changed files back as ONE clean
 * commit via the Git Data API (blobs-in-tree → tree → commit → move ref). The
 * pure parts (ref parsing, utf-8 base64, the changed-file diff) are Node-tested;
 * the network parts take an injectable fetcher so they're testable with fakes.
 */
import type { CodeFile } from './codeloop';
import type { Workspace, WorkspaceKind } from './workspace';

const API = 'https://api.github.com';
const TOKEN_KEY = 'oioxo.gh.token';

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch to read/write; defaults to the repo's default branch on load. */
  branch?: string;
}

/** Parse "owner/repo", a full github.com URL, or a .git clone URL → {owner,repo,branch?}. */
export function parseRepoRef(input: string): RepoRef | null {
  const s = input.trim();
  // https://github.com/owner/repo(.git)(/tree/branch)?
  const url = s.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?(?:[/?#].*)?$/i);
  if (url) return { owner: url[1], repo: url[2], branch: url[3] };
  // owner/repo[#branch] or owner/repo[@branch]
  const short = s.match(/^([\w.-]+)\/([\w.-]+?)(?:[#@]([\w./-]+))?$/);
  if (short) return { owner: short[1], repo: short[2], branch: short[3] };
  return null;
}

// --- token storage (browser only) ---
export function getToken(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null; } catch { return null; }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode */ }
}

// --- utf-8 safe base64 (browser + node both have btoa/atob) ---
export function b64encodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function b64decodeUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type Fetcher = typeof fetch;

async function gh<T>(token: string, path: string, init?: RequestInit & { fetcher?: Fetcher }): Promise<T> {
  const f = init?.fetcher ?? fetch;
  const res = await f(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|sass|less|html|htm|md|mdx|txt|yml|yaml|toml|xml|svg|vue|svelte|py|rb|go|rs|java|c|h|cpp|hpp|cs|php|sh|sql|env|gitignore|prettierrc|eslintrc)$/i;
const MAX_FILES = 500;
const MAX_BYTES = 300_000;

interface LoadResult {
  files: CodeFile[];
  branch: string;
  /** SHA of the branch's tip commit (the parent for our next commit). */
  headSha: string;
  /** SHA of that commit's tree (base_tree for incremental commits). */
  baseTreeSha: string;
}

/** Load a repo's text files into memory + the refs needed to commit back. */
export async function loadRepo(token: string, ref: RepoRef, fetcher?: Fetcher): Promise<LoadResult> {
  const base = `/repos/${ref.owner}/${ref.repo}`;
  let branch = ref.branch;
  if (!branch) {
    const repo = await gh<{ default_branch: string }>(token, base, { fetcher });
    branch = repo.default_branch;
  }
  const refObj = await gh<{ object: { sha: string } }>(token, `${base}/git/ref/heads/${branch}`, { fetcher });
  const headSha = refObj.object.sha;
  const commit = await gh<{ tree: { sha: string } }>(token, `${base}/git/commits/${headSha}`, { fetcher });
  const baseTreeSha = commit.tree.sha;
  const tree = await gh<{ tree: { path: string; type: string; size?: number; sha: string }[] }>(
    token, `${base}/git/trees/${baseTreeSha}?recursive=1`, { fetcher },
  );
  const blobs = tree.tree
    .filter((t) => t.type === 'blob' && TEXT_EXT.test(t.path) && (t.size ?? 0) <= MAX_BYTES)
    .slice(0, MAX_FILES);
  const files: CodeFile[] = [];
  for (const b of blobs) {
    try {
      const blob = await gh<{ content: string; encoding: string }>(token, `${base}/git/blobs/${b.sha}`, { fetcher });
      files.push({ path: b.path, content: blob.encoding === 'base64' ? b64decodeUtf8(blob.content) : blob.content });
    } catch { /* skip unreadable blob */ }
  }
  return { files, branch, headSha, baseTreeSha };
}

/** Which files differ from the loaded snapshot (the commit payload). */
export function changedFiles(original: CodeFile[], current: CodeFile[]): CodeFile[] {
  const orig = new Map(original.map((f) => [f.path, f.content]));
  return current.filter((f) => orig.get(f.path) !== f.content);
}

/** Commit the changed files back as ONE commit and move the branch ref. Returns
 *  the new commit SHA. Uses inline blob content in the tree (one fewer round-trip
 *  per file) and base_tree so unchanged files are inherited, not re-sent. */
export async function commitFiles(
  token: string, ref: Required<Pick<RepoRef, 'owner' | 'repo'>> & { branch: string },
  baseTreeSha: string, parentSha: string, files: CodeFile[], message: string, fetcher?: Fetcher,
): Promise<string> {
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const tree = await gh<{ sha: string }>(token, `${base}/git/trees`, {
    method: 'POST', fetcher,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: files.map((f) => ({ path: f.path.replace(/^\.?\//, ''), mode: '100644', type: 'blob', content: f.content })),
    }),
  });
  const commit = await gh<{ sha: string }>(token, `${base}/git/commits`, {
    method: 'POST', fetcher,
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });
  await gh(token, `${base}/git/refs/heads/${ref.branch}`, {
    method: 'PATCH', fetcher, body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

/**
 * A GitHub repo as a Workspace. Edits live in an in-memory buffer (so the agent
 * + preview work exactly as for a Temp project); `push()` commits the changed
 * files back as one commit. Create via `openGitHubWorkspace`.
 */
export class GitHubWorkspace implements Workspace {
  kind: WorkspaceKind = 'github';
  private map = new Map<string, string>();
  private original: CodeFile[];
  baseTreeSha: string;
  headSha: string;
  readonly branch: string;
  constructor(
    private token: string,
    private ref: Required<Pick<RepoRef, 'owner' | 'repo'>>,
    load: LoadResult,
    private fetcher?: Fetcher,
  ) {
    this.original = load.files.map((f) => ({ ...f }));
    for (const f of load.files) this.map.set(f.path, f.content);
    this.baseTreeSha = load.baseTreeSha;
    this.headSha = load.headSha;
    this.branch = load.branch;
  }
  async read(path: string) { return this.map.get(path) ?? null; }
  async write(path: string, content: string) { this.map.set(path, content); }
  async remove(path: string) { this.map.delete(path); }
  async files(): Promise<CodeFile[]> { return Array.from(this.map, ([path, content]) => ({ path, content })); }
  applyAll(files: CodeFile[]): void { for (const f of files) this.map.set(f.path, f.content); }

  /** Changed files since load (or last push). */
  pending(): CodeFile[] { return changedFiles(this.original, Array.from(this.map, ([path, content]) => ({ path, content }))); }

  /** Commit + push the pending changes; advances the local base to the new commit. */
  async push(message: string): Promise<{ sha: string; changed: number } | null> {
    const changed = this.pending();
    if (!changed.length) return null;
    const sha = await commitFiles(
      this.token, { ...this.ref, branch: this.branch },
      this.baseTreeSha, this.headSha, changed, message, this.fetcher,
    );
    // advance the base so a subsequent push diffs against what we just pushed
    const base = `/repos/${this.ref.owner}/${this.ref.repo}`;
    const commit = await gh<{ tree: { sha: string } }>(this.token, `${base}/git/commits/${sha}`, { fetcher: this.fetcher });
    this.headSha = sha;
    this.baseTreeSha = commit.tree.sha;
    this.original = Array.from(this.map, ([path, content]) => ({ path, content }));
    return { sha, changed: changed.length };
  }
}

/** Open a repo as a Workspace (loads its text files + commit refs). */
export async function openGitHubWorkspace(token: string, ref: RepoRef, fetcher?: Fetcher): Promise<GitHubWorkspace> {
  const load = await loadRepo(token, ref, fetcher);
  return new GitHubWorkspace(token, { owner: ref.owner, repo: ref.repo }, load, fetcher);
}
