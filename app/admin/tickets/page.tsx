'use client';

import * as React from 'react';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/AdminNav';

interface Row {
  id: string; ticketNumber: number; name: string; email: string; subject: string;
  category: string; priority: string; status: string; createdAt: string; _count: { messages: number };
}
interface Msg { id: string; message: string; isStaff: boolean; staffName: string | null; createdAt: string }
interface Detail extends Row { messages: Msg[] }

const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];
const PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'var(--color-cat-pdf)', HIGH: 'var(--color-cat-video)', NORMAL: 'var(--color-fg-muted)', LOW: 'var(--color-fg-subtle)',
};

export default function AdminTicketsPage() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [sel, setSel] = React.useState<Detail | null>(null);
  const [reply, setReply] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [sendError, setSendError] = React.useState('');

  const load = React.useCallback(() => {
    const q = filter ? `?status=${filter}` : '';
    fetch(`/api/admin/tickets${q}`)
      .then((r) => (r.status === 403 ? Promise.reject('forbidden') : r.json()))
      .then((d) => setRows(d.tickets))
      .catch(() => setForbidden(true));
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  async function open(id: string) {
    const d = await fetch(`/api/admin/tickets/${id}`).then((r) => r.json());
    setSel(d.ticket); setReply(''); setStatus(d.ticket.status);
  }

  async function send() {
    if (!sel) return;
    setBusy(true);
    setSendError('');
    try {
      const r = await fetch(`/api/admin/tickets/${sel.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() || undefined, status: status !== sel.status ? status : undefined }),
      });
      if (!r.ok) {
        // Without an error path, a failed reply (network blip, 5xx) was
        // silently dropped — the admin saw the spinner stop, watched the
        // reply textbox clear on reload, and assumed it sent.
        setSendError(`Send failed (HTTP ${r.status}). Try again — your text is preserved below.`);
        return;
      }
      await open(sel.id);
      load();
    } catch {
      setSendError('Network error. Try again — your text is preserved below.');
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <div className="text-[18px] font-bold">Admins only</div>
          <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">You need an admin account to view tickets.</p>
          <Link href="/" className="mt-4 inline-block text-[13px] font-semibold text-[var(--color-cat-image)] hover:underline">Back home</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Admin</h1>
      <AdminNav />
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight">Support tickets</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-black/[0.08] bg-white/60 px-3 py-1.5 text-[13px]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* List */}
        <div className="space-y-2">
          {rows === null && <div className="text-[var(--color-fg-muted)]">Loading…</div>}
          {rows?.length === 0 && <div className="text-[13px] text-[var(--color-fg-muted)]">No tickets.</div>}
          {rows?.map((t) => (
            <button
              key={t.id}
              onClick={() => open(t.id)}
              className={`w-full border px-4 py-3 text-left transition ${sel?.id === t.id ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/5' : 'border-black/[0.08] bg-white/60 hover:bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-semibold text-[var(--color-fg)]">#{t.ticketNumber} · {t.subject}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-fg-muted)]">
                <span className="truncate">{t.name} · {t.email}</span>
                <span>{t.status.replace('_', ' ').toLowerCase()} · {t._count.messages} msg</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div>
          {!sel ? (
            <div className="grid h-full min-h-[200px] place-items-center text-[13px] text-[var(--color-fg-muted)]">
              Select a ticket to view and reply.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                #{sel.ticketNumber} · {sel.category} · from {sel.email}
              </div>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {sel.messages.map((m) => (
                  <div key={m.id} className={`border px-3 py-2 ${m.isStaff ? 'border-[var(--color-cat-image)]/30 bg-[var(--color-cat-image)]/5' : 'border-black/[0.08] bg-white/60'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                      {m.isStaff ? (m.staffName || 'Support') : sel.name} · {new Date(m.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-fg)]">{m.message}</div>
                  </div>
                ))}
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply (emails the requester)…"
                className="min-h-[110px] w-full resize-y border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] focus:border-[var(--color-cat-image)] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-black/[0.08] bg-white/60 px-3 py-2 text-[13px]">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <button
                  onClick={send}
                  disabled={busy || (!reply.trim() && status === sel.status)}
                  className="flex-1 bg-[var(--color-fg)] px-4 py-2 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Sending…' : reply.trim() ? 'Send reply + update' : 'Update status'}
                </button>
              </div>
              {sendError && <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{sendError}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
