'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import type { Comment, CommentAnchor } from './comments';

export function CommentsThread({
  anchor, comments, currentUser, currentColor,
  onAdd, onReply, onResolve, onUnresolve, onDelete, onEdit,
}: {
  anchor: CommentAnchor;
  comments: Comment[];
  currentUser: string;
  currentColor: string;
  onAdd: (text: string) => void;
  onReply: (parentId: string, text: string) => void;
  onResolve: (id: string) => void;
  onUnresolve: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
}) {
  const [newText, setNewText] = React.useState('');
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');

  const roots = comments.filter(c => !c.parent).sort((a, b) => a.ts - b.ts);
  const repliesFor = (id: string) => comments.filter(c => c.parent === id).sort((a, b) => a.ts - b.ts);

  const submit = () => {
    if (!newText.trim()) return;
    onAdd(newText.trim());
    setNewText('');
  };

  return (
    <div className="space-y-2">
      {roots.length === 0 && <div className="rounded border border-white/5 bg-white/[.02] p-3 text-center text-xs text-zinc-500">No comments yet</div>}
      {roots.map(root => {
        const replies = repliesFor(root.id);
        return (
          <div key={root.id} className={cn('rounded-md border', root.resolved ? 'border-emerald-500/20 bg-emerald-500/5 opacity-60' : 'border-white/10 bg-white/[.03]')}>
            <CommentItem
              comment={root}
              currentUser={currentUser}
              editing={editingId === root.id}
              editText={editText}
              onStartEdit={() => { setEditingId(root.id); setEditText(root.text); }}
              onSaveEdit={() => { if (onEdit) onEdit(root.id, editText); setEditingId(null); }}
              onCancelEdit={() => setEditingId(null)}
              onChangeEditText={setEditText}
              onResolve={() => onResolve(root.id)}
              onUnresolve={() => onUnresolve(root.id)}
              onDelete={() => onDelete(root.id)}
            />
            {replies.length > 0 && (
              <div className="border-t border-white/5 pl-3">
                {replies.map(r => (
                  <CommentItem
                    key={r.id}
                    comment={r}
                    currentUser={currentUser}
                    isReply
                    editing={editingId === r.id}
                    editText={editText}
                    onStartEdit={() => { setEditingId(r.id); setEditText(r.text); }}
                    onSaveEdit={() => { if (onEdit) onEdit(r.id, editText); setEditingId(null); }}
                    onCancelEdit={() => setEditingId(null)}
                    onChangeEditText={setEditText}
                    onResolve={() => {}}
                    onUnresolve={() => {}}
                    onDelete={() => onDelete(r.id)}
                  />
                ))}
              </div>
            )}
            {!root.resolved && (
              replyTo === root.id ? (
                <div className="border-t border-white/5 p-2">
                  <textarea
                    autoFocus
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="Reply…"
                    className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
                  />
                  <div className="mt-1 flex justify-end gap-1">
                    <button onClick={() => { setReplyTo(null); setReplyText(''); }} className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/5">Cancel</button>
                    <button onClick={() => { if (replyText.trim()) { onReply(root.id, replyText.trim()); setReplyTo(null); setReplyText(''); } }} className="rounded bg-cyan-500 px-2 py-0.5 text-[10px] font-medium text-zinc-900 hover:bg-cyan-400">Reply</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setReplyTo(root.id)} className="block w-full border-t border-white/5 px-2 py-1 text-left text-[10px] text-zinc-400 hover:bg-white/5">+ Reply</button>
              )
            )}
          </div>
        );
      })}
      <div className="rounded-md border border-white/5 bg-white/[.02] p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ background: currentColor }} />
          <span>{currentUser}</span>
        </div>
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          rows={2}
          placeholder="Add a comment… use @name to mention"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
        />
        <div className="mt-1 flex justify-end">
          <button onClick={submit} disabled={!newText.trim()} className="rounded bg-cyan-500 px-3 py-1 text-[11px] font-medium text-zinc-900 hover:bg-cyan-400 disabled:opacity-40">Add comment</button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ comment, currentUser, isReply, editing, editText, onStartEdit, onSaveEdit, onCancelEdit, onChangeEditText, onResolve, onUnresolve, onDelete }: {
  comment: Comment;
  currentUser: string;
  isReply?: boolean;
  editing: boolean;
  editText: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onChangeEditText: (t: string) => void;
  onResolve: () => void;
  onUnresolve: () => void;
  onDelete: () => void;
}) {
  const isMine = comment.author === currentUser;
  return (
    <div className={cn('p-2', isReply && 'py-1.5')}>
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: comment.authorColor }} />
          <span className="font-medium text-zinc-200">{comment.author}</span>
          <span className="text-zinc-500">· {timeAgo(comment.ts)}</span>
          {comment.resolved && <span className="rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-300">resolved</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {!isReply && (comment.resolved
            ? <button onClick={onUnresolve} className="rounded px-1 text-zinc-400 hover:bg-white/5 hover:text-emerald-300">↺</button>
            : <button onClick={onResolve} className="rounded px-1 text-zinc-400 hover:bg-white/5 hover:text-emerald-300" title="Resolve">✓</button>
          )}
          {isMine && <button onClick={onStartEdit} className="rounded px-1 text-zinc-400 hover:bg-white/5 hover:text-cyan-300" title="Edit">✎</button>}
          {isMine && <button onClick={onDelete} className="rounded px-1 text-zinc-400 hover:bg-white/5 hover:text-rose-300" title="Delete">×</button>}
        </div>
      </div>
      {editing ? (
        <div className="mt-1">
          <textarea
            value={editText}
            onChange={e => onChangeEditText(e.target.value)}
            rows={2}
            className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 text-xs text-zinc-100"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button onClick={onCancelEdit} className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/5">Cancel</button>
            <button onClick={onSaveEdit} className="rounded bg-cyan-500 px-2 py-0.5 text-[10px] font-medium text-zinc-900 hover:bg-cyan-400">Save</button>
          </div>
        </div>
      ) : (
        <div className="mt-1 whitespace-pre-wrap text-xs text-zinc-100">
          {renderMentions(comment.text)}
        </div>
      )}
    </div>
  );
}

function renderMentions(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(@[\w-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    parts.push(<span key={key++} className="text-cyan-300">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return parts;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CommentsBadge({ count, resolved }: { count: number; resolved?: boolean }) {
  if (count === 0) return null;
  return (
    <span className={cn(
      'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold',
      resolved ? 'bg-emerald-500/30 text-emerald-200' : 'bg-yellow-500/30 text-yellow-200',
    )}>
      {count}
    </span>
  );
}

export function CommentsOverviewPanel({ comments, currentUser, currentColor, onJumpTo, onResolve, onUnresolve, onDelete, onReply, onEdit }: {
  comments: Comment[];
  currentUser: string;
  currentColor: string;
  onJumpTo: (anchor: CommentAnchor) => void;
  onResolve: (id: string) => void;
  onUnresolve: (id: string) => void;
  onDelete: (id: string) => void;
  onReply: (parentId: string, text: string) => void;
  onEdit?: (id: string, text: string) => void;
}) {
  const [filter, setFilter] = React.useState<'open' | 'all' | 'mine' | 'resolved'>('open');
  const filtered = comments.filter(c => {
    if (filter === 'open') return !c.resolved;
    if (filter === 'resolved') return c.resolved;
    if (filter === 'mine') return c.author === currentUser;
    return true;
  });
  const groups = new Map<string, Comment[]>();
  for (const c of filtered) {
    const key = JSON.stringify(c.anchor);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-white/5 bg-[#0f1115] p-2">
        {(['open', 'mine', 'resolved', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={cn(
            'flex-1 rounded px-2 py-1 text-[10px] capitalize',
            filter === f ? 'bg-cyan-500/20 text-cyan-200' : 'text-zinc-400 hover:bg-white/5',
          )}>{f}</button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {groups.size === 0 && <div className="rounded border border-white/5 bg-white/[.02] p-4 text-center text-xs text-zinc-500">No comments</div>}
        {Array.from(groups.entries()).map(([key, group]) => {
          const root = group.find(c => !c.parent) ?? group[0];
          return (
            <div key={key} className="rounded border border-white/10 bg-white/[.02]">
              <button onClick={() => onJumpTo(root.anchor)} className="block w-full px-2 py-1.5 text-left text-[10px] text-cyan-300 hover:bg-white/5">
                {anchorLabel(root.anchor)} →
              </button>
              <div className="border-t border-white/5 p-2">
                <CommentsThread
                  anchor={root.anchor}
                  comments={group}
                  currentUser={currentUser}
                  currentColor={currentColor}
                  onAdd={() => {}}
                  onReply={onReply}
                  onResolve={onResolve}
                  onUnresolve={onUnresolve}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function anchorLabel(anchor: CommentAnchor): string {
  switch (anchor.kind) {
    case 'cell':       return `${colLetter(anchor.c)}${anchor.r + 1}`;
    case 'element':    return `Slide element ${anchor.elementId.slice(-4)}`;
    case 'page-rect':  return `Page ${anchor.pageId.slice(-4)}`;
    case 'text-range': return `Text [${anchor.start}-${anchor.end}]`;
    case 'doc':        return 'Document';
  }
}

function colLetter(c: number): string {
  let s = '';
  c++;
  while (c > 0) { s = String.fromCharCode(65 + ((c - 1) % 26)) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
