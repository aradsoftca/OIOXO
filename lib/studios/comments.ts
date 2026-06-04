export type CommentAnchor =
  | { kind: 'cell'; sheetId: string; r: number; c: number }
  | { kind: 'element'; slideId: string; elementId: string }
  | { kind: 'page-rect'; pageId: string; nx: number; ny: number; nw: number; nh: number }
  | { kind: 'text-range'; start: number; end: number }
  | { kind: 'doc'; docId?: string };

export interface Comment {
  id: string;
  anchor: CommentAnchor;
  author: string;
  authorColor: string;
  text: string;
  ts: number;
  resolved: boolean;
  parent?: string;
  mentions?: string[];
}

export interface CommentsState {
  comments: Comment[];
}

export function anchorKey(a: CommentAnchor): string {
  switch (a.kind) {
    case 'cell':       return `cell:${a.sheetId}:${a.r}_${a.c}`;
    case 'element':    return `el:${a.slideId}:${a.elementId}`;
    case 'page-rect':  return `page:${a.pageId}:${a.nx.toFixed(3)}_${a.ny.toFixed(3)}_${a.nw.toFixed(3)}_${a.nh.toFixed(3)}`;
    case 'text-range': return `text:${a.start}-${a.end}`;
    case 'doc':        return `doc:${a.docId ?? 'self'}`;
  }
}

export function anchorEquals(a: CommentAnchor, b: CommentAnchor): boolean {
  return anchorKey(a) === anchorKey(b);
}

export function extractMentions(text: string): string[] {
  const out: string[] = [];
  const re = /@([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

export class CommentsModel {
  private state: CommentsState = { comments: [] };
  private listeners: Array<(s: CommentsState) => void> = [];

  getAll(): Comment[] { return [...this.state.comments]; }
  setAll(comments: Comment[]): void {
    this.state = { comments };
    this.notify();
  }

  onChange(fn: (s: CommentsState) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify() {
    for (const l of this.listeners) l(this.state);
  }

  add(anchor: CommentAnchor, author: string, authorColor: string, text: string, parent?: string): Comment {
    const c: Comment = {
      id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      anchor, author, authorColor, text,
      ts: Date.now(), resolved: false, parent,
      mentions: extractMentions(text),
    };
    this.state = { comments: [...this.state.comments, c] };
    this.notify();
    return c;
  }

  reply(parentId: string, author: string, authorColor: string, text: string): Comment | null {
    const parent = this.state.comments.find(c => c.id === parentId);
    if (!parent) return null;
    return this.add(parent.anchor, author, authorColor, text, parentId);
  }

  remove(id: string): void {
    this.state = {
      comments: this.state.comments.filter(c => c.id !== id && c.parent !== id),
    };
    this.notify();
  }

  resolve(id: string, resolved = true): void {
    this.state = {
      comments: this.state.comments.map(c => c.id === id ? { ...c, resolved } : c),
    };
    this.notify();
  }

  editText(id: string, newText: string): void {
    this.state = {
      comments: this.state.comments.map(c => c.id === id ? { ...c, text: newText, mentions: extractMentions(newText) } : c),
    };
    this.notify();
  }

  threadFor(anchor: CommentAnchor): Comment[] {
    const key = anchorKey(anchor);
    return this.state.comments.filter(c => anchorKey(c.anchor) === key);
  }

  pendingForAnchor(anchor: CommentAnchor): boolean {
    return this.threadFor(anchor).some(c => !c.resolved);
  }

  applyRemote(remote: Comment): boolean {
    if (this.state.comments.find(c => c.id === remote.id)) return false;
    // Sanity-cap peer-supplied text + author so a hostile peer can't push a
    // 50MB comment text (or a megabyte of author name) into the receiver's
    // state and freeze the UI on the next render. Same shape as collab
    // text-op caps.
    if (typeof remote.text !== 'string' || remote.text.length > 10_000) return false;
    if (typeof remote.author !== 'string' || remote.author.length > 128) return false;
    // Cap comment list too — a flood eventually drowns the panel.
    if (this.state.comments.length >= 10_000) return false;
    this.state = { comments: [...this.state.comments, remote] };
    this.notify();
    return true;
  }

  groupedByAnchor(): Map<string, Comment[]> {
    const map = new Map<string, Comment[]>();
    for (const c of this.state.comments) {
      const k = anchorKey(c.anchor);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  }
}
