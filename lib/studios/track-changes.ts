export type ChangeStatus = 'pending' | 'accepted' | 'rejected';

export type ChangePath = (string | number)[];

export interface DocChange {
  id: string;
  path: ChangePath;
  kind: 'set' | 'insert' | 'delete';
  before: any;
  after: any;
  author: string;
  authorColor: string;
  ts: number;
  status: ChangeStatus;
  label?: string;
}

export interface TrackChangesState {
  changes: DocChange[];
}

export class TrackChangesModel {
  private state: TrackChangesState = { changes: [] };
  private listeners: Array<(s: TrackChangesState) => void> = [];

  getAll(): DocChange[] { return [...this.state.changes]; }
  pending(): DocChange[] { return this.state.changes.filter(c => c.status === 'pending'); }
  byAuthor(author: string): DocChange[] { return this.state.changes.filter(c => c.author === author); }

  setAll(changes: DocChange[]): void {
    this.state = { changes };
    this.notify();
  }

  onChange(fn: (s: TrackChangesState) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify() {
    for (const l of this.listeners) l(this.state);
  }

  record(path: ChangePath, kind: 'set' | 'insert' | 'delete', before: any, after: any, author: string, authorColor: string, label?: string): DocChange {
    const c: DocChange = {
      id: `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      path, kind, before, after,
      author, authorColor, ts: Date.now(),
      status: 'pending', label,
    };
    this.state = { changes: [...this.state.changes, c] };
    this.notify();
    return c;
  }

  accept(id: string): DocChange | null {
    const change = this.state.changes.find(c => c.id === id);
    if (!change) return null;
    this.state = {
      changes: this.state.changes.map(c => c.id === id ? { ...c, status: 'accepted' as ChangeStatus } : c),
    };
    this.notify();
    return change;
  }

  reject(id: string): DocChange | null {
    const change = this.state.changes.find(c => c.id === id);
    if (!change) return null;
    this.state = {
      changes: this.state.changes.map(c => c.id === id ? { ...c, status: 'rejected' as ChangeStatus } : c),
    };
    this.notify();
    return change;
  }

  acceptAll(): DocChange[] {
    const pending = this.pending();
    this.state = {
      changes: this.state.changes.map(c => c.status === 'pending' ? { ...c, status: 'accepted' as ChangeStatus } : c),
    };
    this.notify();
    return pending;
  }

  rejectAll(): DocChange[] {
    const pending = this.pending();
    this.state = {
      changes: this.state.changes.map(c => c.status === 'pending' ? { ...c, status: 'rejected' as ChangeStatus } : c),
    };
    this.notify();
    return pending;
  }

  clear(): void {
    this.state = { changes: [] };
    this.notify();
  }

  applyRemote(remote: DocChange): boolean {
    if (this.state.changes.find(c => c.id === remote.id)) return false;
    // Sanity-cap peer-supplied before/after + author so a hostile peer can't
    // bloat the changes panel with megabytes of text. The htmlDiffMarkup
    // call truncates for diffing but the raw values still sit in state and
    // get rendered. Mirrors the comments + collab caps.
    const tooBig = (v: unknown) => typeof v === 'string' && v.length > 32_000;
    if (tooBig(remote.before) || tooBig(remote.after)) return false;
    if (typeof remote.author !== 'string' || remote.author.length > 128) return false;
    if (this.state.changes.length >= 10_000) return false;
    this.state = { changes: [...this.state.changes, remote] };
    this.notify();
    return true;
  }
}

// Tight color whitelist so a peer-supplied authorColor (e.g. via the collab
// signal channel) can't break out of the inline style attribute. Without
// this, a malicious peer could send authorColor=`red" onmouseover="alert(1)`
// and the resulting <ins>/<del> markup — rendered via dangerouslySetInnerHTML
// in the doc editor — would carry an event handler.
function safeColor(c: string): string {
  return /^#[0-9a-f]{3,8}$|^rgb\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*\)$|^rgba\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*[\d.]+\s*\)$|^[a-zA-Z]+$/.test(c.trim())
    ? c.trim()
    : '#22d3ee';
}

export function htmlDiffMarkup(before: string, after: string, authorColor: string): string {
  const color = safeColor(authorColor);
  // Cap inputs so a hostile collab peer can't crash the receiver by sending
  // a 1MB before/after pair — diffTokens is O(m*n) memory, and tokenizing
  // both at ~150k tokens each would attempt a ~180GB DP-table allocation.
  // Long content is truncated with a "…" marker; the panel is a preview
  // anyway (the full text lives in the doc).
  const MAX = 8_000;
  const b = before.length > MAX ? before.slice(0, MAX) + '…' : before;
  const a = after.length > MAX ? after.slice(0, MAX) + '…' : after;
  const beforeTokens = tokenize(b);
  const afterTokens = tokenize(a);
  const ops = diffTokens(beforeTokens, afterTokens);
  let out = '';
  for (const op of ops) {
    if (op.kind === 'keep') out += escapeHtml(op.text);
    else if (op.kind === 'insert') out += `<ins data-tc-author style="color:${color};background:${color}1a;text-decoration:none;border-bottom:1px solid ${color}">${escapeHtml(op.text)}</ins>`;
    else if (op.kind === 'delete') out += `<del data-tc-author style="color:${color};opacity:.7;text-decoration:line-through">${escapeHtml(op.text)}</del>`;
  }
  return out;
}

function tokenize(s: string): string[] {
  return s.split(/(\s+|[.,!?;:])/).filter(t => t.length > 0);
}

interface DiffOp { kind: 'keep' | 'insert' | 'delete'; text: string }

function diffTokens(a: string[], b: string[]): DiffOp[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { ops.unshift({ kind: 'keep', text: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { ops.unshift({ kind: 'delete', text: a[i - 1] }); i--; }
    else { ops.unshift({ kind: 'insert', text: b[j - 1] }); j--; }
  }
  while (i > 0) { ops.unshift({ kind: 'delete', text: a[i - 1] }); i--; }
  while (j > 0) { ops.unshift({ kind: 'insert', text: b[j - 1] }); j--; }
  return ops;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
