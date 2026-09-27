'use client';

import * as React from 'react';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'billing', label: 'Billing' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'bug_report', label: 'Bug report' },
  { value: 'other', label: 'Other' },
];

export default function SupportPage() {
  const [form, setForm] = React.useState({ name: '', email: '', subject: '', category: 'general', message: '' });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = React.useState<number | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error || 'Could not submit your request.');
      else setTicketNumber(data.ticketNumber);
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  }

  const field =
    'w-full border border-black/[0.08] bg-white/60 px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-image)] focus:outline-none';

  return (
    <div className="mx-auto w-[min(560px,94vw)] py-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-image)] text-white">
          <TileIcon name="life-buoy" size={20} />
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Support
          </div>
          <h1 className="text-[24px] font-bold tracking-tight">How can we help?</h1>
        </div>
      </div>

      {ticketNumber ? (
        <div className="tile-surface" data-neutral="true">
          <div className="tile-content gap-3 !justify-start">
            <div className="text-[15px] font-semibold text-[var(--color-fg)]">
              Request #{ticketNumber} received
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              Thanks — we&apos;ve logged your request and sent a confirmation to{' '}
              <span className="font-semibold text-[var(--color-fg)]">{form.email}</span>. Our team
              will reply by email.
            </p>
            <Link href="/" className="inline-block bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90">
              Back home
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="tile-surface" data-neutral="true">
          <div className="tile-content gap-3 !justify-start">
            <div className="grid grid-cols-2 gap-3">
              <input className={field} required placeholder="Your name" value={form.name} onChange={set('name')} />
              <input className={field} required type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} />
            </div>
            <input className={field} required placeholder="Subject" value={form.subject} onChange={set('subject')} />
            <select className={field} value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <textarea className={`${field} min-h-[140px] resize-y`} required placeholder="Describe your issue or question…" value={form.message} onChange={set('message')} />
            {error && <div className="text-[12px] font-medium text-[var(--color-cat-pdf)]">{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--color-fg)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
