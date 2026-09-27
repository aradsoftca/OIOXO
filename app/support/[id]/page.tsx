'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BRAND } from '@/lib/brand';

interface Msg { id: string; message: string; isStaff: boolean; staffName: string | null; createdAt: string }
interface Ticket {
  ticketNumber: number; subject: string; status: string; category: string; createdAt: string; messages: Msg[];
}

export default function TicketViewPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [state, setState] = React.useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');

  React.useEffect(() => {
    fetch(`/api/tickets/${id}`)
      .then((r) => (r.status === 403 ? Promise.reject('forbidden') : r.ok ? r.json() : Promise.reject('error')))
      .then((d) => { setTicket(d.ticket); setState('ok'); })
      .catch((e) => setState(e === 'forbidden' ? 'forbidden' : 'error'));
  }, [id]);

  return (
    <div className="mx-auto w-[min(640px,94vw)] py-6">
      {state === 'loading' && <div className="text-[var(--color-fg-muted)]">Loading…</div>}
      {state === 'forbidden' && (
        <div className="tile-surface" data-neutral="true">
          <div className="tile-content gap-3 !justify-start">
            <div className="text-[15px] font-semibold">Sign in to view this ticket</div>
            <p className="text-[13px] text-[var(--color-fg-muted)]">
              This conversation is private to its owner. Sign in with the account that created it —
              the full reply is also in your email.
            </p>
            <Link href="/auth/sign-in" className="inline-block bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)]">Sign in</Link>
          </div>
        </div>
      )}
      {state === 'error' && <div className="text-[var(--color-cat-pdf)]">Ticket not found.</div>}
      {state === 'ok' && ticket && (
        <>
          <div className="mb-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              Ticket #{ticket.ticketNumber} · {ticket.status.replace('_', ' ').toLowerCase()}
            </div>
            <h1 className="text-[22px] font-bold tracking-tight">{ticket.subject}</h1>
          </div>
          <div className="space-y-3">
            {ticket.messages.map((m) => (
              <div key={m.id} className={`tile-surface ${m.isStaff ? '' : 'opacity-90'}`} data-neutral="true">
                <div className="tile-content gap-1.5 !justify-start">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                    {m.isStaff ? (m.staffName || `${BRAND} Support`) : 'You'} · {new Date(m.createdAt).toLocaleString()}
                  </div>
                  <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-fg)]">{m.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-[12px] text-[var(--color-fg-muted)]">
            To add to this conversation, reply to our email or{' '}
            <Link href="/support" className="font-semibold text-[var(--color-cat-image)] hover:underline">open a new request</Link>.
          </div>
        </>
      )}
    </div>
  );
}
