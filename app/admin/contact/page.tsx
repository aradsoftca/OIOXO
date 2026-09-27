'use client';

import * as React from 'react';
import { AdminNav } from '@/components/admin/AdminNav';

interface CM {
  id: string; name: string; email: string; subject: string; message: string;
  status: string; response: string | null; createdAt: string;
}

const STATUS = ['UNREAD', 'READ', 'IN_PROGRESS', 'RESPONDED', 'CLOSED', 'SPAM'];

export default function AdminContactPage() {
  const [msgs, setMsgs] = React.useState<CM[] | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [sel, setSel] = React.useState<CM | null>(null);
  const [reply, setReply] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [actError, setActError] = React.useState('');

  const load = React.useCallback(() => {
    fetch('/api/admin/contact')
      .then((r) => (r.status === 403 ? Promise.reject() : r.json()))
      .then((d) => setMsgs(d.messages))
      .catch(() => setForbidden(true));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function act(patch: { status?: string; response?: string }) {
    if (!sel) return;
    setBusy(true);
    setActError('');
    try {
      const r = await fetch(`/api/admin/contact/${sel.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!r.ok) {
        // Without an error path the admin silently lost their response.
        setActError(`Update failed (HTTP ${r.status}). Try again — your text is preserved.`);
        return;
      }
      setReply('');
      load();
      setSel((s) => (s ? { ...s, ...patch } : s));
    } catch {
      setActError('Network error. Try again — your text is preserved.');
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return <div className="grid min-h-[60vh] place-items-center text-[18px] font-bold">Admins only</div>;
  }

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Admin</h1>
      <AdminNav />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {msgs === null && <div className="text-[var(--color-fg-muted)]">Loading…</div>}
          {msgs?.length === 0 && <div className="text-[13px] text-[var(--color-fg-muted)]">No messages.</div>}
          {msgs?.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSel(m); setReply(''); }}
              className={`w-full border px-4 py-3 text-left transition ${sel?.id === m.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/5' : 'border-black/[0.08] bg-white/60 hover:bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-semibold text-[var(--color-fg)]">{m.subject}</span>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{m.status}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">{m.name} · {m.email}</div>
            </button>
          ))}
        </div>

        <div>
          {!sel ? (
            <div className="grid h-full min-h-[200px] place-items-center text-[13px] text-[var(--color-fg-muted)]">Select a message.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">From {sel.name} · {sel.email}</div>
              <div className="border border-black/[0.08] bg-white/60 px-3 py-2 text-[13px] font-semibold">{sel.subject}</div>
              <div className="whitespace-pre-wrap border border-black/[0.08] bg-white/60 px-3 py-2 text-[13px] leading-relaxed text-[var(--color-fg)]">{sel.message}</div>
              {sel.response && (
                <div className="border border-[var(--color-cat-image)]/30 bg-[var(--color-cat-image)]/5 px-3 py-2 text-[13px]">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Previous response</div>
                  <div className="mt-1 whitespace-pre-wrap">{sel.response}</div>
                </div>
              )}
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type a response (emails the sender)…"
                className="min-h-[110px] w-full resize-y border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] focus:border-[var(--color-cat-image)] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={sel.status}
                  onChange={(e) => act({ status: e.target.value })}
                  className="border border-black/[0.08] bg-white/60 px-3 py-2 text-[13px]"
                >
                  {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  onClick={() => act({ response: reply.trim() || undefined })}
                  disabled={busy || !reply.trim()}
                  className="flex-1 bg-[var(--color-fg)] px-4 py-2 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Sending…' : 'Send response'}
                </button>
              </div>
              {actError && <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{actError}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
