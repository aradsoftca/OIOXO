import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Self-hosted speed test. GET streams N incompressible bytes (download test);
// POST drains the request body and reports how many bytes it received (upload
// test). The client times each and computes Mbps. No third-party service.

const CHUNK = crypto.randomBytes(256 * 1024); // 256 KB reusable random block
const MAX_BYTES = 60 * 1024 * 1024;           // 60 MB cap per request

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bytes = Math.min(MAX_BYTES, Math.max(0, Number(url.searchParams.get('bytes')) || 0));
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= bytes) { controller.close(); return; }
      const n = Math.min(CHUNK.length, bytes - sent);
      controller.enqueue(n === CHUNK.length ? CHUNK : CHUNK.subarray(0, n));
      sent += n;
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes),
      'cache-control': 'no-store, no-cache, must-revalidate',
      'content-encoding': 'identity', // never gzip — would skew the measurement
    },
  });
}

export async function POST(req: Request) {
  let received = 0;
  const reader = req.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) received += value.length;
      if (received > MAX_BYTES) break;
    }
  }
  return NextResponse.json({ received }, { headers: { 'cache-control': 'no-store' } });
}
