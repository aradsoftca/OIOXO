import assert from 'node:assert/strict';
import { buildHubFeed, hubAuthorized } from '../lib/hub-feed.ts';

const KEY = 'k'.repeat(32);
assert.equal(hubAuthorized(null, KEY), false);
assert.equal(hubAuthorized('Bearer wrong', KEY), false);
assert.equal(hubAuthorized('Bearer ' + KEY, undefined), false);
assert.equal(hubAuthorized('Bearer short', 'short'), false);
assert.equal(hubAuthorized('Bearer ' + KEY, KEY), true);

const now = new Date('2026-11-10T12:00:00Z');
const u = { name: 'Ann', email: 'ann@x.com' };
const db: any = {
  payment: { findMany: async () => [
    { id: 'a', status: 'SUCCEEDED', amount: 4.99, currency: 'usd', plan: 'PRO', billingPeriod: 'monthly', createdAt: new Date('2026-11-09'), paidAt: new Date('2026-11-09'), user: u },
    { id: 'b', status: 'FAILED', amount: 4.99, currency: 'usd', plan: 'PRO', createdAt: new Date('2026-11-08'), user: u },
    { id: 'c', status: 'SUCCEEDED', amount: 50, currency: 'usd', plan: 'PRO', createdAt: new Date('2026-08-01'), paidAt: new Date('2026-08-01'), user: u },
  ] },
  cryptoPayment: { findMany: async () => [
    { id: 'd', status: 'completed', amount: 10, currency: 'usd', planType: 'yearly', createdAt: new Date('2026-11-05'), completedAt: new Date('2026-11-06'), user: u },
  ] },
  ticket: {
    findMany: async () => [
      { ticketNumber: 7, status: 'OPEN', name: 'Bob', email: 'b@x.com', subject: 'Help', category: 'billing', createdAt: new Date('2026-11-09') },
      { ticketNumber: 6, status: 'CLOSED', name: 'Cy', email: 'c@x.com', subject: 'Old', category: 'general', createdAt: new Date('2026-10-01') },
    ],
    count: async () => 1,
  },
};
const f = await buildHubFeed(db, now);
assert.equal(f.project, 'xonvert');
assert.equal(f.orders.length, 4);
assert.equal(f.orders[0].id, 'pay_a');
assert.equal(f.totals.revenue30dCents, 499 + 1000);
assert.equal(f.totals.orders30d, 2);
assert.equal(f.totals.openTickets, 1);
assert.equal(f.tickets[0].open, true);
assert.equal(f.tickets[1].open, false);
assert.equal(f.tickets[0].id, 'T7');
console.log('hub feed tests ok');
