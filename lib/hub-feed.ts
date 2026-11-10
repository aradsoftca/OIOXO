// Read-only feed for the Arad Soft hub (aradsoft.ca/admin/hub). Contract: aradsoft-web/docs/HUB.md
import { timingSafeEqual } from 'node:crypto';

const DAY = 86_400_000;
const MAX = 200;

export function hubAuthorized(header: string | null, key: string | undefined): boolean {
  if (!key || key.length < 24) return false;
  const m = /^Bearer (.+)$/.exec(header || '');
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const cut = (s: string | null | undefined, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const cents = (d: number) => Math.round(d * 100);

type Db = {
  payment: { findMany(a: any): Promise<any[]> };
  cryptoPayment: { findMany(a: any): Promise<any[]> };
  ticket: { findMany(a: any): Promise<any[]>; count(a: any): Promise<number> };
};

export async function buildHubFeed(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [pays, cryptos, tickets, openTickets] = await Promise.all([
    db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: MAX, include: { user: { select: { name: true, email: true } } } }),
    db.cryptoPayment.findMany({ orderBy: { createdAt: 'desc' }, take: MAX, include: { user: { select: { name: true, email: true } } } }),
    db.ticket.findMany({ orderBy: { createdAt: 'desc' }, take: MAX }),
    db.ticket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
  ]);

  const orders = [
    ...pays.map((p) => ({
      id: 'pay_' + p.id,
      at: new Date(p.paidAt || p.createdAt),
      status: String(p.status).toLowerCase(),
      earned: p.status === 'SUCCEEDED',
      amountCents: cents(p.amount),
      currency: String(p.currency || 'usd').toUpperCase(),
      customer: cut(p.user?.name, 80),
      contact: cut(p.user?.email, 120),
      summary: cut([p.plan, p.billingPeriod].filter(Boolean).join(' '), 140),
    })),
    ...cryptos.map((p) => ({
      id: 'crypto_' + p.id,
      at: new Date(p.completedAt || p.createdAt),
      status: String(p.status).toLowerCase(),
      earned: p.status === 'completed',
      amountCents: cents(p.amount),
      currency: String(p.currency || 'usd').toUpperCase(),
      customer: cut(p.user?.name, 80),
      contact: cut(p.user?.email, 120),
      summary: cut('crypto ' + (p.planType || ''), 140),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, MAX);

  const recent = orders.filter((o) => o.earned && o.at >= since);
  return {
    project: 'xonvert',
    generatedAt: now.toISOString(),
    orders: orders.map(({ earned, at, ...o }) => ({ id: o.id, at: at.toISOString(), status: o.status, amountCents: o.amountCents, currency: o.currency, customer: o.customer, contact: o.contact, summary: o.summary })),
    tickets: tickets.map((t) => ({
      id: 'T' + t.ticketNumber,
      at: new Date(t.createdAt).toISOString(),
      status: String(t.status).toLowerCase(),
      open: !['RESOLVED', 'CLOSED'].includes(t.status),
      customer: cut(t.name, 80),
      contact: cut(t.email, 120),
      subject: cut(t.subject, 140),
      summary: cut(t.category, 140),
    })),
    totals: {
      revenue30dCents: recent.reduce((s, o) => s + o.amountCents, 0),
      orders30d: recent.length,
      openTickets,
    },
  };
}
