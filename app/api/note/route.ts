import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Zero-knowledge note store. We only ever see CIPHERTEXT — the decryption key
// lives in the URL fragment (#…) on the client and is never sent here. Notes
// live in memory with a TTL and optional burn-after-reading; nothing persists.

interface Note { ct: string; iv: string; oneTime: boolean; expires: number }
const notes = new Map<string, Note>();
const MAX_CT = 200 * 1024;        // ~150 KB plaintext
const MAX_NOTES = 20000;
const MAX_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function sweep() {
  const now = Date.now();
  for (const [id, n] of notes) if (now > n.expires) notes.delete(id);
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 40)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  let body: { ct?: string; iv?: string; oneTime?: boolean; ttlMs?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  if (typeof body.ct !== 'string' || typeof body.iv !== 'string' || !body.ct || body.ct.length > MAX_CT) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (notes.size > MAX_NOTES) sweep();
  const id = crypto.randomBytes(9).toString('base64url');
  const ttl = Math.min(MAX_TTL, Math.max(60_000, Number(body.ttlMs) || MAX_TTL));
  notes.set(id, { ct: body.ct, iv: body.iv, oneTime: !!body.oneTime, expires: Date.now() + ttl });
  return NextResponse.json({ id }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(req: Request) {
  sweep();
  const id = new URL(req.url).searchParams.get('id') || '';
  const n = notes.get(id);
  if (!n) return NextResponse.json({ error: 'gone' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  if (n.oneTime) notes.delete(id); // burn after reading
  return NextResponse.json({ ct: n.ct, iv: n.iv, oneTime: n.oneTime }, { headers: { 'cache-control': 'no-store' } });
}
